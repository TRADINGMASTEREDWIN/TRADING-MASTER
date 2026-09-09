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
     Sprint MARKET-1B/3A/UI (base) + MARKET-HYPE-1 (arquitectura Spot +
     Futures). Extiende el MISMO objeto BinanceMarketData. Fuente
     exclusivamente pública — sin API Key/Secret/balances/órdenes
     privadas.

     MARKET-HYPE-1 — HALLAZGO: HYPEUSDT (Hyperliquid) no está disponible
     como par Spot en Binance global — solo existe como contrato
     USDⓈ-M Futures. Por eso, en vez de UNA conexión, ahora existen DOS
     conexiones centralizadas independientes y paralelas — nunca una por
     activo, nunca una por listener:

       MERCADOS.SPOT    -> wss://stream.binance.com:9443/ws     (9 activos)
       MERCADOS.FUTURES -> wss://fstream.binance.com/market/ws  (HYPEUSDT)

     Cada una tiene su propio WebSocket, caché, suscripciones y
     reconexión — completamente aisladas entre sí. subscribePrice()/
     unsubscribePrice()/getPrice()/getConnectionStatus() NUNCA cambiaron
     de firma y siguen operando exclusivamente sobre SPOT (comportamiento
     por defecto, 100% compatible con MARKET-1B). subscribeTicker()/
     unsubscribeTicker()/getTicker() ganaron un 3er parámetro opcional
     { marketType: 'FUTURES' } — sin ese parámetro, se comportan
     exactamente igual que antes (SPOT).
     ============================================================ */
  const RECONEXION_DELAY_MAXIMO_MS = 30000;

  function crearEstadoMercado(wsUrl){
    return {
      wsUrl,
      ws: null,
      connectionStatus: 'disconnected', // 'disconnected' | 'connecting' | 'connected' | 'reconnecting'
      reconnectTimer: null,             // referencia única -> nunca 2 reconexiones simultáneas de ESTE mercado
      reconnectAttempts: 0,
      subscriptions: {},                // símbolo normalizado -> Set(callbacks de precio simple)
      priceCache: {},                   // símbolo normalizado -> último precio numérico
      tickerSubscriptions: {},          // símbolo normalizado -> Set(callbacks de ticker completo)
      tickerCache: {},                  // símbolo normalizado -> {symbol, price, priceChangePercent, high, low, volume, quoteVolume}
      nextMsgId: 1
    };
  }

  const MERCADOS = {
    SPOT: crearEstadoMercado('wss://stream.binance.com:9443/ws'),
    FUTURES: crearEstadoMercado('wss://fstream.binance.com/market/ws')
  };

  function normalizarSymbolPrecio(symbol){
    return String(symbol || '').trim().toUpperCase(); // btcUSDT/BTCUSDT/btcusdt -> mismo símbolo
  }

  function resolverMercado(opciones){
    return (opciones && opciones.marketType === 'FUTURES') ? MERCADOS.FUTURES : MERCADOS.SPOT; // SPOT = comportamiento por defecto, sin cambios
  }

  // Cuenta TOTAL de listeners (precio + ticker) para un símbolo DENTRO de
  // un mercado específico — decide si hace falta SUBSCRIBE/UNSUBSCRIBE real.
  function totalListenersDeSymbol(mercado, s){
    const p = mercado.subscriptions[s] ? mercado.subscriptions[s].size : 0;
    const t = mercado.tickerSubscriptions[s] ? mercado.tickerSubscriptions[s].size : 0;
    return p + t;
  }

  function hayAlgunaSuscripcionActiva(mercado){
    const symbols = new Set([...Object.keys(mercado.subscriptions), ...Object.keys(mercado.tickerSubscriptions)]);
    return Array.from(symbols).some(s => totalListenersDeSymbol(mercado, s) > 0);
  }

  function enviarSuscripcion(mercado, symbolsNormalizados){
    if(!mercado.ws || mercado.ws.readyState !== WebSocket.OPEN || symbolsNormalizados.length === 0) return;
    mercado.ws.send(JSON.stringify({
      method: 'SUBSCRIBE',
      params: symbolsNormalizados.map(s => s.toLowerCase() + '@ticker'),
      id: mercado.nextMsgId++
    }));
  }

  function enviarDesuscripcion(mercado, symbolsNormalizados){
    if(!mercado.ws || mercado.ws.readyState !== WebSocket.OPEN || symbolsNormalizados.length === 0) return;
    mercado.ws.send(JSON.stringify({
      method: 'UNSUBSCRIBE',
      params: symbolsNormalizados.map(s => s.toLowerCase() + '@ticker'),
      id: mercado.nextMsgId++
    }));
  }

  // Logging controlado: solo errores/eventos de conexión importantes,
  // nunca cada actualización de precio individual. El formato del mensaje
  // @ticker de Futures usa los MISMOS nombres de campo que Spot (c/P/h/l/v/q).
  function procesarMensajePrecio(mercado, data){
    if(!data || typeof data !== 'object') return;
    if(data.result !== undefined && data.id !== undefined) return; // ACK de SUBSCRIBE/UNSUBSCRIBE, no es un precio
    if(!data.s || data.c === undefined) return; // no es un ticker reconocible, se ignora sin ruido

    const symbol = normalizarSymbolPrecio(data.s);
    const price = parseFloat(data.c);
    if(isNaN(price)) return;

    mercado.priceCache[symbol] = price;

    const listeners = mercado.subscriptions[symbol];
    if(listeners){
      listeners.forEach(cb => {
        try{ cb({ symbol, price }); } // MISMA forma exacta del callback — nunca se reemplaza por el ticker completo
        catch(e){ console.error(`BinanceMarketData: error en un listener de precio de ${symbol}.`, e); }
      });
    }

    const priceChangePercent = parseFloat(data.P);
    const high = parseFloat(data.h);
    const low = parseFloat(data.l);
    const volume = parseFloat(data.v);
    const quoteVolume = parseFloat(data.q);

    const ticker = {
      symbol,
      price,
      priceChangePercent: isNaN(priceChangePercent) ? null : priceChangePercent,
      high: isNaN(high) ? null : high,
      low: isNaN(low) ? null : low,
      volume: isNaN(volume) ? null : volume,
      quoteVolume: isNaN(quoteVolume) ? null : quoteVolume
    };
    mercado.tickerCache[symbol] = ticker;

    const tickerListeners = mercado.tickerSubscriptions[symbol];
    if(tickerListeners){
      tickerListeners.forEach(cb => {
        try{ cb(ticker); }
        catch(e){ console.error(`BinanceMarketData: error en un listener de ticker de ${symbol}.`, e); }
      });
    }
  }

  function programarReconexion(mercado){
    if(mercado.reconnectTimer) return; // nunca 2 procesos de reconexión simultáneos de ESTE mercado
    mercado.connectionStatus = 'reconnecting';
    const delay = Math.min(1000 * Math.pow(2, mercado.reconnectAttempts), RECONEXION_DELAY_MAXIMO_MS);
    mercado.reconnectTimer = setTimeout(() => {
      mercado.reconnectTimer = null;
      mercado.reconnectAttempts++;
      asegurarConexionWebSocket(mercado);
    }, delay);
  }

  function asegurarConexionWebSocket(mercado){
    if(mercado.ws && (mercado.ws.readyState === WebSocket.OPEN || mercado.ws.readyState === WebSocket.CONNECTING)) return;

    mercado.connectionStatus = (mercado.reconnectAttempts > 0) ? 'reconnecting' : 'connecting';
    mercado.ws = new WebSocket(mercado.wsUrl);

    mercado.ws.onopen = () => {
      mercado.connectionStatus = 'connected';
      mercado.reconnectAttempts = 0;
      // Restaura TODAS las suscripciones activas de ESTE mercado tras (re)conectar.
      const symbols = new Set([...Object.keys(mercado.subscriptions), ...Object.keys(mercado.tickerSubscriptions)]);
      const simbolosActivos = Array.from(symbols).filter(s => totalListenersDeSymbol(mercado, s) > 0);
      enviarSuscripcion(mercado, simbolosActivos);
    };

    mercado.ws.onmessage = (event) => {
      let data;
      try{ data = JSON.parse(event.data); }
      catch(e){ return; } // mensaje no parseable -> se ignora silenciosamente, sin romper nada
      procesarMensajePrecio(mercado, data);
    };

    mercado.ws.onerror = (event) => {
      console.error(`BinanceMarketData: error en la conexión WebSocket (${mercado.wsUrl}).`, event);
    };

    mercado.ws.onclose = () => {
      mercado.connectionStatus = 'disconnected';
      mercado.ws = null;
      if(hayAlgunaSuscripcionActiva(mercado)) programarReconexion(mercado); // solo reconecta ESTE mercado si hace falta
    };
  }

  function subscribePriceInterno(mercado, symbol, callback){
    if(typeof callback !== 'function') return;
    const s = normalizarSymbolPrecio(symbol);
    if(!s) return;

    const teniaListenersAntes = totalListenersDeSymbol(mercado, s) > 0;
    if(!mercado.subscriptions[s]) mercado.subscriptions[s] = new Set();
    mercado.subscriptions[s].add(callback);

    asegurarConexionWebSocket(mercado);
    if(!teniaListenersAntes && mercado.ws && mercado.ws.readyState === WebSocket.OPEN){
      enviarSuscripcion(mercado, [s]);
    }
  }

  function unsubscribePriceInterno(mercado, symbol, callback){
    const s = normalizarSymbolPrecio(symbol);
    if(!mercado.subscriptions[s]) return;
    mercado.subscriptions[s].delete(callback);
    if(mercado.subscriptions[s].size === 0) delete mercado.subscriptions[s];
    if(totalListenersDeSymbol(mercado, s) === 0) enviarDesuscripcion(mercado, [s]);
  }

  function getPriceInterno(mercado, symbol){
    const s = normalizarSymbolPrecio(symbol);
    return (s in mercado.priceCache) ? mercado.priceCache[s] : null;
  }

  function subscribeTickerInterno(mercado, symbol, callback){
    if(typeof callback !== 'function') return;
    const s = normalizarSymbolPrecio(symbol);
    if(!s) return;

    const teniaListenersAntes = totalListenersDeSymbol(mercado, s) > 0;
    if(!mercado.tickerSubscriptions[s]) mercado.tickerSubscriptions[s] = new Set();
    mercado.tickerSubscriptions[s].add(callback);

    asegurarConexionWebSocket(mercado);
    if(!teniaListenersAntes && mercado.ws && mercado.ws.readyState === WebSocket.OPEN){
      enviarSuscripcion(mercado, [s]);
    }
  }

  function unsubscribeTickerInterno(mercado, symbol, callback){
    const s = normalizarSymbolPrecio(symbol);
    if(!mercado.tickerSubscriptions[s]) return;
    mercado.tickerSubscriptions[s].delete(callback);
    if(mercado.tickerSubscriptions[s].size === 0) delete mercado.tickerSubscriptions[s];
    if(totalListenersDeSymbol(mercado, s) === 0) enviarDesuscripcion(mercado, [s]);
  }

  function getTickerInterno(mercado, symbol){
    const s = normalizarSymbolPrecio(symbol);
    return (s in mercado.tickerCache) ? mercado.tickerCache[s] : null;
  }

  // ============================================================
  // API PÚBLICA — subscribePrice/unsubscribePrice/getPrice/
  // getConnectionStatus: firma y comportamiento IDÉNTICOS a MARKET-1B,
  // siempre sobre SPOT. Ningún consumidor existente necesita cambiar.
  // ============================================================
  function subscribePrice(symbol, callback){
    subscribePriceInterno(MERCADOS.SPOT, symbol, callback);
  }
  function unsubscribePrice(symbol, callback){
    unsubscribePriceInterno(MERCADOS.SPOT, symbol, callback);
  }
  function getPrice(symbol){
    return getPriceInterno(MERCADOS.SPOT, symbol);
  }
  function getConnectionStatus(){
    return MERCADOS.SPOT.connectionStatus; // sin cambios — sigue reportando el estado de Spot
  }

  // subscribeTicker/unsubscribeTicker/getTicker: mismo comportamiento que
  // MARKET-3A cuando se llaman SIN el 3er parámetro (SPOT por defecto).
  // Con { marketType: 'FUTURES' }, operan sobre la conexión Futures
  // independiente — mismo protocolo SUBSCRIBE/UNSUBSCRIBE, misma forma
  // de ticker devuelta.
  function subscribeTicker(symbol, callback, opciones){
    subscribeTickerInterno(resolverMercado(opciones), symbol, callback);
  }
  function unsubscribeTicker(symbol, callback, opciones){
    unsubscribeTickerInterno(resolverMercado(opciones), symbol, callback);
  }
  function getTicker(symbol, opciones){
    return getTickerInterno(resolverMercado(opciones), symbol);
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

  /* ============================================================
     Sprint MARKET-5 — Historial real de precios (mini-gráficas). Usa
     REST pública de Binance — Spot: /api/v3/klines, Futures: /fapi/v1/klines
     — nunca WebSockets nuevos ni credenciales. Caché simple en memoria por
     symbol+timeframe, para no repetir consultas al reabrir la misma
     temporalidad.
     ============================================================ */
  const BINANCE_SPOT_KLINES_URL = 'https://api.binance.com/api/v3/klines';
  const BINANCE_FUTURES_KLINES_URL = 'https://fapi.binance.com/fapi/v1/klines';

  // timeframe visible -> { interval de Binance, cuántas velas pedir }
  const CONFIG_TIMEFRAME = {
    '1H':  { interval: '1m',  limit: 60 },
    '4H':  { interval: '5m',  limit: 48 },
    '24H': { interval: '15m', limit: 96 },
    '7D':  { interval: '1h',  limit: 168 }
  };

  const historicoCache = {}; // "SYMBOL|TIMEFRAME|MARKETTYPE" -> { datos, timestamp }
  const HISTORICO_CACHE_TTL_MS = 60 * 1000; // 1 minuto — evita reconsultar en ráfaga, nunca sirve datos "viejos" como si fueran de ahora

  function claveCacheHistorico(symbol, timeframe, marketType){
    return `${symbol}|${timeframe}|${marketType}`;
  }

  async function getHistoricalPrices(symbol, timeframe, opciones){
    const s = normalizarSymbolPrecio(symbol);
    const config = CONFIG_TIMEFRAME[timeframe];
    if(!config) throw new Error(`Timeframe no soportado: ${timeframe}`);

    const marketType = (opciones && opciones.marketType === 'FUTURES') ? 'FUTURES' : 'SPOT';
    const clave = claveCacheHistorico(s, timeframe, marketType);

    const cacheado = historicoCache[clave];
    if(cacheado && (Date.now() - cacheado.timestamp) < HISTORICO_CACHE_TTL_MS){
      return cacheado.datos; // reutiliza — evita consultas innecesarias en ráfaga
    }

    const baseUrl = (marketType === 'FUTURES') ? BINANCE_FUTURES_KLINES_URL : BINANCE_SPOT_KLINES_URL;
    const url = `${baseUrl}?symbol=${encodeURIComponent(s)}&interval=${config.interval}&limit=${config.limit}`;

    const response = await fetch(url);
    if(!response.ok){
      throw new Error(`Binance klines respondió con estado ${response.status} para ${s} (${marketType})`);
    }

    const raw = await response.json();
    if(!Array.isArray(raw)){
      throw new Error(`Respuesta inesperada de klines para ${s}: se esperaba un array.`);
    }

    // Kline de Binance: [openTime, open, high, low, close, volume, closeTime, ...]
    // Se usa el precio de CIERRE de cada vela, tal como pide el Sprint.
    // Kline de Binance: [openTime, open, high, low, close, volume, closeTime,
    // quoteAssetVolume, ...]. Sprint MARKET-6 — se agrega quoteVolume (índice
    // 7) para que el Pulso/Resumen puedan calcular volumen REAL del período
    // reutilizando este MISMO historial, sin ninguna consulta adicional.
    const datos = raw.map(vela => {
      const qv = parseFloat(vela[7]);
      return {
        time: vela[0],
        price: parseFloat(vela[4]),
        quoteVolume: isNaN(qv) ? null : qv
      };
    }).filter(p => !isNaN(p.price));

    historicoCache[clave] = { datos, timestamp: Date.now() };
    return datos;
  }

  Object.assign(global.BinanceMarketData, {
    getHistoricalPrices
  });

})(window);
