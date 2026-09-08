/* ============================================================
   TRADING MASTER — Sprint MARKET-1A
   Servicio global aislado: catálogo público de instrumentos Spot de
   Binance. NO se conecta a Supabase, NO se integra con ningún selector
   ni formulario todavía — expone únicamente una API en memoria que un
   Sprint futuro podrá consumir. Solo usa el endpoint público de solo
   lectura (sin API Keys, sin credenciales, sin datos privados).
   ============================================================ */

(function(global){
  const BINANCE_EXCHANGE_INFO_URL = 'https://api.binance.com/api/v3/exchangeInfo';

  let catalogo = null;          // array normalizado, en memoria — la caché real
  let cargaEnProgreso = null;   // Promise en curso — evita solicitudes duplicadas simultáneas

  function normalizarInstrumento(s){
    return {
      symbol: s.symbol,
      baseAsset: s.baseAsset,
      quoteAsset: s.quoteAsset
    };
  }

  // Mantiene únicamente instrumentos Spot operables con datos válidos.
  // Sin lista hardcodeada de criptomonedas: todo se deriva de la
  // respuesta real de Binance.
  function esInstrumentoValido(s){
    if(!s || typeof s.symbol !== 'string' || !s.symbol) return false;
    if(typeof s.baseAsset !== 'string' || !s.baseAsset) return false;
    if(typeof s.quoteAsset !== 'string' || !s.quoteAsset) return false;
    if(s.status !== 'TRADING') return false;

    // isSpotTradingAllowed es la señal más directa cuando Binance la
    // incluye; si no viene en la respuesta, se revisa `permissions` como
    // respaldo. Nunca se asume disponible por defecto si ninguna señal
    // lo confirma explícitamente.
    if(typeof s.isSpotTradingAllowed === 'boolean'){
      return s.isSpotTradingAllowed === true;
    }
    if(Array.isArray(s.permissions)){
      return s.permissions.indexOf('SPOT') !== -1;
    }
    return false;
  }

  async function loadCatalog(){
    if(catalogo !== null) return catalogo; // ya cargado -> nunca una segunda consulta
    if(cargaEnProgreso) return cargaEnProgreso; // ya en curso -> reutiliza la MISMA promesa

    cargaEnProgreso = (async () => {
      try{
        const response = await fetch(BINANCE_EXCHANGE_INFO_URL);
        if(!response.ok){
          throw new Error(`Binance respondió con estado ${response.status}`);
        }

        const data = await response.json();
        if(!data || !Array.isArray(data.symbols)){
          throw new Error('Respuesta inesperada de Binance: falta el array symbols.');
        }

        const filtrados = data.symbols.filter(esInstrumentoValido).map(normalizarInstrumento);
        catalogo = filtrados; // [] también es un catálogo válido, no un error
        return catalogo;

      }catch(error){
        console.error('BinanceMarketData: no se pudo cargar el catálogo:', error);
        catalogo = null; // permite reintentar en la próxima llamada a loadCatalog()
        throw error; // controlado — el llamador decide qué hacer, nunca rompe nada por sí solo
      }finally{
        cargaEnProgreso = null;
      }
    })();

    return cargaEnProgreso;
  }

  function getCatalog(){
    return catalogo || [];
  }

  // Búsqueda case-insensitive por símbolo o activo base. Prioriza
  // quoteAsset === 'USDT' cuando existe, sin garantizar que siempre exista
  // (ej. buscar un activo que solo cotiza contra BTC no tendrá resultado USDT).
  function search(query){
    if(!catalogo || !query) return [];
    const q = String(query).trim().toUpperCase();
    if(!q) return [];

    const resultados = catalogo.filter(item =>
      item.symbol.toUpperCase().indexOf(q) !== -1 ||
      item.baseAsset.toUpperCase().indexOf(q) !== -1
    );

    resultados.sort((a, b) => {
      const aEsUsdt = a.quoteAsset === 'USDT' ? 0 : 1;
      const bEsUsdt = b.quoteAsset === 'USDT' ? 0 : 1;
      return aEsUsdt - bEsUsdt; // orden estable dentro de cada grupo
    });

    return resultados;
  }

  global.BinanceMarketData = {
    loadCatalog,
    getCatalog,
    search
  };

  /* ============================================================
     Sprint MARKET-1B — Precios en tiempo real vía WebSocket público.
     Extiende el MISMO objeto BinanceMarketData (no crea un servicio
     nuevo). Fuente exclusivamente pública — sin API Key/Secret/balances/
     órdenes privadas. Una única conexión centralizada, multiplexada por
     símbolo mediante SUBSCRIBE/UNSUBSCRIBE (protocolo nativo de Binance),
     nunca un socket por símbolo ni por listener.
     ============================================================ */
  const BINANCE_WS_URL = 'wss://stream.binance.com:9443/ws';
  const RECONEXION_DELAY_MAXIMO_MS = 30000;

  let ws = null;
  let connectionStatus = 'disconnected'; // 'disconnected' | 'connecting' | 'connected' | 'reconnecting'
  let reconnectTimer = null;             // referencia única -> nunca 2 reconexiones simultáneos
  let reconnectAttempts = 0;
  let subscriptions = {};                // símbolo normalizado -> Set(callbacks de precio simple) — SIN CAMBIOS desde MARKET-1B
  let priceCache = {};                   // símbolo normalizado -> último precio numérico — SIN CAMBIOS
  // Sprint MARKET-3A — estructuras NUEVAS y paralelas para el ticker
  // completo. NO reemplazan nada de MARKET-1B; ambas conviven sobre la
  // MISMA conexión y el MISMO stream @ticker ya existente.
  let tickerSubscriptions = {};          // símbolo normalizado -> Set(callbacks de ticker completo)
  let tickerCache = {};                  // símbolo normalizado -> {symbol, price, priceChangePercent, high, low, volume}
  let nextMsgId = 1;

  function normalizarSymbolPrecio(symbol){
    return String(symbol || '').trim().toUpperCase(); // PASO 5 — btcUSDT/BTCUSDT/btcusdt -> mismo símbolo
  }

  // Cuenta TOTAL de listeners (precio + ticker) para un símbolo — decide si
  // hace falta SUBSCRIBE/UNSUBSCRIBE real, ya que ambos tipos comparten la
  // misma suscripción real del símbolo en el WebSocket.
  function totalListenersDeSymbol(s){
    const p = subscriptions[s] ? subscriptions[s].size : 0;
    const t = tickerSubscriptions[s] ? tickerSubscriptions[s].size : 0;
    return p + t;
  }

  function hayAlgunaSuscripcionActiva(){
    const symbols = new Set([...Object.keys(subscriptions), ...Object.keys(tickerSubscriptions)]);
    return Array.from(symbols).some(s => totalListenersDeSymbol(s) > 0);
  }

  function enviarSuscripcion(symbolsNormalizados){
    if(!ws || ws.readyState !== WebSocket.OPEN || symbolsNormalizados.length === 0) return;
    ws.send(JSON.stringify({
      method: 'SUBSCRIBE',
      params: symbolsNormalizados.map(s => s.toLowerCase() + '@ticker'),
      id: nextMsgId++
    }));
  }

  function enviarDesuscripcion(symbolsNormalizados){
    if(!ws || ws.readyState !== WebSocket.OPEN || symbolsNormalizados.length === 0) return;
    ws.send(JSON.stringify({
      method: 'UNSUBSCRIBE',
      params: symbolsNormalizados.map(s => s.toLowerCase() + '@ticker'),
      id: nextMsgId++
    }));
  }

  // PASO 11 — logging controlado: solo se registran errores/eventos de
  // conexión importantes, nunca cada actualización de precio individual.
  function procesarMensajePrecio(data){
    if(!data || typeof data !== 'object') return;
    if(data.result !== undefined && data.id !== undefined) return; // ACK de SUBSCRIBE/UNSUBSCRIBE, no es un precio
    if(!data.s || data.c === undefined) return; // no es un ticker reconocible, se ignora sin ruido

    const symbol = normalizarSymbolPrecio(data.s);
    const price = parseFloat(data.c);
    if(isNaN(price)) return;

    priceCache[symbol] = price; // PASO 6 — actualiza la caché (SIN CAMBIOS respecto a MARKET-1B)

    const listeners = subscriptions[symbol];
    if(listeners){
      listeners.forEach(cb => {
        try{ cb({ symbol, price }); } // MISMA forma exacta del callback — nunca se reemplaza por el ticker completo
        catch(e){ console.error(`BinanceMarketData: error en un listener de precio de ${symbol}.`, e); }
      });
    }

    // Sprint MARKET-3A — el mismo mensaje @ticker YA trae estos campos
    // (P=variación%, h=máximo 24h, l=mínimo 24h, v=volumen); no se cambia
    // el stream ni se pide nada adicional a Binance.
    const priceChangePercent = parseFloat(data.P);
    const high = parseFloat(data.h);
    const low = parseFloat(data.l);
    const volume = parseFloat(data.v);

    const ticker = {
      symbol,
      price,
      priceChangePercent: isNaN(priceChangePercent) ? null : priceChangePercent,
      high: isNaN(high) ? null : high,
      low: isNaN(low) ? null : low,
      volume: isNaN(volume) ? null : volume
    };
    tickerCache[symbol] = ticker;

    const tickerListeners = tickerSubscriptions[symbol];
    if(tickerListeners){
      tickerListeners.forEach(cb => {
        try{ cb(ticker); }
        catch(e){ console.error(`BinanceMarketData: error en un listener de ticker de ${symbol}.`, e); }
      });
    }
  }

  function programarReconexion(){
    if(reconnectTimer) return; // PASO 8 — nunca 2 procesos de reconexión simultáneos
    connectionStatus = 'reconnecting';
    const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), RECONEXION_DELAY_MAXIMO_MS);
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      reconnectAttempts++;
      asegurarConexionWebSocket();
    }, delay);
  }

  function asegurarConexionWebSocket(){
    if(ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;

    connectionStatus = (reconnectAttempts > 0) ? 'reconnecting' : 'connecting';
    ws = new WebSocket(BINANCE_WS_URL);

    ws.onopen = () => {
      connectionStatus = 'connected';
      reconnectAttempts = 0;
      // PASO 8 — restaura TODAS las suscripciones activas tras (re)conectar,
      // considerando tanto price como ticker (símbolo compartido entre ambos).
      const symbols = new Set([...Object.keys(subscriptions), ...Object.keys(tickerSubscriptions)]);
      const simbolosActivos = Array.from(symbols).filter(s => totalListenersDeSymbol(s) > 0);
      enviarSuscripcion(simbolosActivos);
    };

    ws.onmessage = (event) => {
      let data;
      try{ data = JSON.parse(event.data); }
      catch(e){ return; } // mensaje no parseable -> se ignora silenciosamente, sin romper nada
      procesarMensajePrecio(data);
    };

    ws.onerror = (event) => {
      console.error('BinanceMarketData: error en la conexión WebSocket de precios.', event);
    };

    ws.onclose = () => {
      connectionStatus = 'disconnected';
      ws = null;
      if(hayAlgunaSuscripcionActiva()) programarReconexion(); // PASO 8 — solo reconecta si hace falta
    };
  }

  // PASO 3/7/9 — suscripción centralizada: Set evita callbacks duplicados;
  // solo se envía SUBSCRIBE real la PRIMERA vez que un símbolo pasa a tener
  // al menos un listener (de cualquiera de los 2 tipos, price o ticker).
  function subscribePrice(symbol, callback){
    if(typeof callback !== 'function') return;
    const s = normalizarSymbolPrecio(symbol);
    if(!s) return;

    const teniaListenersAntes = totalListenersDeSymbol(s) > 0;
    if(!subscriptions[s]) subscriptions[s] = new Set();
    subscriptions[s].add(callback);

    asegurarConexionWebSocket();
    if(!teniaListenersAntes && ws && ws.readyState === WebSocket.OPEN){
      enviarSuscripcion([s]);
    }
    // Si el socket aún no está abierto, onopen ya restaura todos los
    // símbolos con listeners activos — no hace falta duplicar el envío aquí.
  }

  // PASO 3/7 — elimina SOLO ese listener; si quedan otros para el mismo
  // símbolo (price o ticker), la suscripción real del símbolo NO se cierra.
  function unsubscribePrice(symbol, callback){
    const s = normalizarSymbolPrecio(symbol);
    if(!subscriptions[s]) return;

    subscriptions[s].delete(callback);
    if(subscriptions[s].size === 0) delete subscriptions[s];

    if(totalListenersDeSymbol(s) === 0) enviarDesuscripcion([s]);
  }

  function getPrice(symbol){
    const s = normalizarSymbolPrecio(symbol);
    return (s in priceCache) ? priceCache[s] : null; // PASO 6 — null si todavía no hay precio
  }

  function getConnectionStatus(){
    return connectionStatus; // PASO 10
  }

  /* ============================================================
     Sprint MARKET-3A — Ticker completo (price + priceChangePercent +
     high + low + volume). Comparte la MISMA conexión WebSocket y el
     MISMO stream @ticker que subscribePrice() — nunca crea una segunda
     conexión ni una segunda suscripción real por símbolo.
     ============================================================ */
  function subscribeTicker(symbol, callback){
    if(typeof callback !== 'function') return;
    const s = normalizarSymbolPrecio(symbol);
    if(!s) return;

    const teniaListenersAntes = totalListenersDeSymbol(s) > 0;
    if(!tickerSubscriptions[s]) tickerSubscriptions[s] = new Set();
    tickerSubscriptions[s].add(callback);

    asegurarConexionWebSocket();
    if(!teniaListenersAntes && ws && ws.readyState === WebSocket.OPEN){
      enviarSuscripcion([s]);
    }
  }

  function unsubscribeTicker(symbol, callback){
    const s = normalizarSymbolPrecio(symbol);
    if(!tickerSubscriptions[s]) return;

    tickerSubscriptions[s].delete(callback);
    if(tickerSubscriptions[s].size === 0) delete tickerSubscriptions[s];

    if(totalListenersDeSymbol(s) === 0) enviarDesuscripcion([s]);
  }

  function getTicker(symbol){
    const s = normalizarSymbolPrecio(symbol);
    return (s in tickerCache) ? tickerCache[s] : null;
  }

  Object.assign(global.BinanceMarketData, {
    subscribePrice,
    unsubscribePrice,
    getPrice,
    getConnectionStatus,
    subscribeTicker,
    unsubscribeTicker,
    getTicker
  });

})(window);
