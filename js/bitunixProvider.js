/* ============================================================
   TRADING MASTER — MULTI-EXCHANGE FOUNDATION (Fase 4.2.1)
   BITUNIX PROVIDER — módulo AISLADO.

   PROPÓSITO
   Encapsula exclusivamente la comunicación PÚBLICA de Bitunix Futures
   y expone una interfaz normalizada. NO se integra todavía con
   InstrumentCatalog, MarketContext, MarketStatus, IndicatorEngine,
   Trades, Snapshots, Watchlist ni ninguna UI. Nadie en el proyecto
   importa este archivo todavía — es completamente pasivo hasta que
   otro módulo lo invoque explícitamente (y ese "otro módulo" no
   existe aún).

   IDENTIDAD FIJA DE ESTE PROVIDER
     exchange:   'BITUNIX'
     marketType: 'FUTURES'   (Bitunix Spot NO se implementa en esta fase)

   ENDPOINTS PÚBLICOS UTILIZADOS (re-verificados contra la documentación
   vigente de Bitunix el día de esta implementación, no se asumió nada
   de una investigación previa):
     Catálogo:   GET https://fapi.bitunix.com/api/v1/futures/market/trading_pairs
     Ticker:     GET https://fapi.bitunix.com/api/v1/futures/market/tickers?symbols=...
     Históricos: GET https://fapi.bitunix.com/api/v1/futures/market/kline?symbol=...&interval=...&limit=...
   Los 3 son de solo lectura, públicos, SIN autenticación (confirmado en
   la doc: "Public requests can be invoked without authentication").

   HALLAZGOS AL RE-VERIFICAR (documentados aquí, no se inventó nada):
   - `tickers` NO entrega un campo de % de cambio 24h directo. Sí entrega
     `open` ("Entry price of the last 24 hours") y `lastPrice`/`last`.
     `change24h` se CALCULA de esos 2 campos reales — no es un dato
     inventado, es la misma aritmética estándar que cualquier exchange
     usaría, solo que Bitunix no la precalcula. Si Bitunix alguna vez
     expone un campo de % directo, se debe preferir ese campo sobre el
     cálculo (dejar esto anotado para revisión futura).
   - `tickers` NO entrega un timestamp de la respuesta. Se usa el
     momento de recepción (Date.now()) — documentado como tal, nunca
     se presenta como si viniera de Bitunix.
   - `kline` entrega `time` en MILISEGUNDOS Unix (igual formato que ya
     usa marketData.js — sin conversión necesaria).
   - `kline` entrega `quoteVol`/`baseVol` POR VELA (a pesar de que una
     de las 2 menciones en la doc de Bitunix dice "last 24 hours", eso
     es inconsistente con que el campo vaya dentro de cada elemento de
     un array histórico de muchas velas — se interpreta como volumen de
     ESA vela, mismo criterio que `quoteVolume` en marketData.js).

   NORMALIZACIÓN DE TIMEFRAMES
   Bitunix soporta: 1m,3m,5m,15m,30m,1h,2h,4h,6h,8h,12h,1d,3d,1w,1M
   Trading Master usa: 1m,5m,15m,30m,1H,4H,1D,1W (Analyzer) y
   15M,1H,4H,1D,1W (Market Context). El mapeo vive en UN SOLO lugar
   (MAPA_TIMEFRAMES, más abajo) — nada de conversiones improvisadas.
   Los 9 valores que usa hoy Trading Master SÍ están soportados por
   Bitunix; cualquier otro valor devuelve un error controlado (nunca
   se construyen velas artificialmente).

   CACHÉ
   El catálogo se cachea en memoria con TTL de 5 minutos (ver
   CATALOGO_TTL_MS) — mismo principio de reutilización que
   BinanceMarketData.loadCatalog()/getCatalog() en marketData.js, sin
   copiar su código. 5 minutos: suficientemente largo para no golpear
   el catálogo en cada búsqueda del usuario, suficientemente corto para
   detectar instrumentos nuevos/deslistados en una sesión normal de
   trabajo. No se persiste en Supabase ni en ningún storage — solo
   memoria, se pierde al recargar la página (aceptado explícitamente
   para esta fase).

   AISLAMIENTO
   Este archivo NO importa ni depende de: trades.js, marketStatus.js,
   marketContext.js, indicatorEngine.js, storage.js, supabase.js,
   dashboard.js, variablesObservadas.js, ni de ningún elemento del DOM.
   Solo usa `fetch` (nativo del navegador).

   WEBSOCKET — DOCUMENTADO, NO IMPLEMENTADO EN ESTA FASE
   Bitunix expone un WS público en wss://fapi.bitunix.com/public/, con
   suscripción {op:'subscribe', args:[{symbol, ch:'ticker'}]}, sin
   autenticación para canales de mercado. Se prioriza según lo pedido
   (1. catálogo, 2. ticker REST, 3. históricos) y el WS queda como
   siguiente subpaso, por 2 razones honestas:
     1. Introduce manejo de reconexión/ping-pong — complejidad real,
        no trivial, que merece su propio paso aislado y revisable.
     2. Este entorno de desarrollo NO tiene salida de red, así que
        cualquier implementación de WS aquí sería código sin poder
        verificarse contra el servidor real — un riesgo real de enviar
        algo roto. subscribeTicker()/unsubscribeTicker() quedan
        expuestas como placeholders explícitos (ver más abajo) que
        avisan claramente que no están implementadas, en vez de fingir
        que funcionan.
   ============================================================ */

(function(global){

  const EXCHANGE = 'BITUNIX';
  const MARKET_TYPE = 'FUTURES';

  const BASE_URL = 'https://fapi.bitunix.com';
  const TRADING_PAIRS_URL = BASE_URL + '/api/v1/futures/market/trading_pairs';
  const TICKERS_URL = BASE_URL + '/api/v1/futures/market/tickers';
  const KLINE_URL = BASE_URL + '/api/v1/futures/market/kline';

  const TIMEOUT_MS = 10000; // por request — evita que un fetch cuelgue indefinidamente

  /* ------------------------------------------------------------
     Fetch con timeout — único helper de red del archivo. No cambia
     ningún comportamiento de marketData.js, es una utilidad local.
     ------------------------------------------------------------ */
  async function fetchConTimeout(url){
    const controlador = new AbortController();
    const timer = setTimeout(() => controlador.abort(), TIMEOUT_MS);
    try{
      return await fetch(url, { signal: controlador.signal });
    }catch(error){
      if(error && error.name === 'AbortError'){
        throw new Error('BitunixProvider: tiempo de espera agotado (' + TIMEOUT_MS + 'ms) consultando ' + url);
      }
      throw error;
    }finally{
      clearTimeout(timer);
    }
  }

  // Envoltura común para las 3 respuestas de Bitunix, todas con la
  // misma forma {code, data, msg}. Centraliza el manejo de errores de
  // formato/HTTP para no repetirlo 3 veces.
  async function pedirJson(url){
    const response = await fetchConTimeout(url);
    if(!response.ok){
      throw new Error('BitunixProvider: HTTP ' + response.status + ' consultando ' + url);
    }
    let json;
    try{
      json = await response.json();
    }catch(error){
      throw new Error('BitunixProvider: respuesta no es JSON válido (' + url + '): ' + error.message);
    }
    if(!json || json.code !== 0 || !Array.isArray(json.data)){
      throw new Error('BitunixProvider: respuesta inesperada de Bitunix (' + url + '): ' + (json && json.msg ? json.msg : 'forma desconocida'));
    }
    return json.data;
  }

  /* ============================================================
     1. CATÁLOGO (getAssets) — con caché en memoria
     ============================================================ */
  let catalogoCache = null;       // array normalizado, o null si nunca se cargó con éxito
  let catalogoTimestamp = 0;
  let catalogoEnProgreso = null;  // evita ráfagas de solicitudes simultáneas
  const CATALOGO_TTL_MS = 5 * 60 * 1000; // 5 minutos — ver justificación en la cabecera del archivo

  function normalizarInstrumento(row){
    return {
      exchange: EXCHANGE,
      marketType: MARKET_TYPE,
      symbol: row.symbol,
      baseAsset: row.base,
      quoteAsset: row.quote,
      status: row.symbolStatus || null,        // 'OPEN' | 'CANCEL_ONLY' | 'STOP', tal cual lo entrega Bitunix
      estaOperable: row.symbolStatus === 'OPEN' // conveniencia — no reemplaza a `status`, solo lo hace fácil de filtrar
    };
  }

  async function getAssets(opciones){
    const forzarRefresco = !!(opciones && opciones.forzarRefresco);
    const ahora = Date.now();
    if(!forzarRefresco && catalogoCache && (ahora - catalogoTimestamp) < CATALOGO_TTL_MS){
      return catalogoCache; // dentro del TTL — cero peticiones nuevas
    }
    if(catalogoEnProgreso) return catalogoEnProgreso; // reutiliza la MISMA promesa en curso

    catalogoEnProgreso = (async () => {
      try{
        const data = await pedirJson(TRADING_PAIRS_URL);
        catalogoCache = data.map(normalizarInstrumento);
        catalogoTimestamp = Date.now();
        return catalogoCache;
      }catch(error){
        console.error('BitunixProvider: no se pudo cargar el catálogo:', error);
        throw error; // el llamador decide qué hacer, igual criterio que loadCatalog() de marketData.js
      }finally{
        catalogoEnProgreso = null;
      }
    })();
    return catalogoEnProgreso;
  }

  // Getter síncrono del catálogo YA cargado — igual patrón que
  // BinanceMarketData.getCatalog(). Nunca dispara una petición.
  function getCachedAssets(){
    return catalogoCache || [];
  }

  /* ============================================================
     2. BÚSQUEDA — solo sobre lo ya cargado (mismo criterio que
     BinanceMarketData.search(): no auto-carga el catálogo).
     ============================================================ */
  function search(query){
    const lista = getCachedAssets();
    if(!lista.length || !query) return [];
    const q = String(query).trim().toUpperCase();
    if(!q) return [];
    return lista.filter(item =>
      item.symbol.toUpperCase().indexOf(q) !== -1 ||
      item.baseAsset.toUpperCase().indexOf(q) !== -1
    );
  }

  /* ============================================================
     3. RESOLUCIÓN DE INSTRUMENTO — nunca inventa. Si no existe,
     devuelve null explícitamente.
     ============================================================ */
  async function getInstrument(symbol){
    const s = String(symbol || '').trim().toUpperCase();
    if(!s) return null;

    let lista = getCachedAssets();
    if(lista.length === 0){
      try{
        lista = await getAssets(); // primer uso -> asegura que el catálogo esté cargado
      }catch(error){
        // No se pudo confirmar nada -> null controlado, NUNCA inventar el instrumento.
        return null;
      }
    }
    return lista.find(item => item.symbol === s) || null;
  }

  /* ============================================================
     4. TIMEFRAMES — ÚNICO lugar responsable del mapeo.
     ============================================================ */
  const MAPA_TIMEFRAMES = {
    '1m': '1m', '5m': '5m', '15m': '15m', '30m': '30m',
    '1H': '1h', '4H': '4h', '1D': '1d', '1W': '1w',
    '15M': '15m' // Market Context Engine (Sprint 0) — mismo criterio: 15M de contexto = vela de 15m
  };

  function timeframeSoportado(timeframe){
    return Object.prototype.hasOwnProperty.call(MAPA_TIMEFRAMES, timeframe);
  }

  /* ============================================================
     5. TICKER
     ============================================================ */
  async function getTicker(symbol){
    const s = String(symbol || '').trim().toUpperCase();
    if(!s) return null;

    const data = await pedirJson(TICKERS_URL + '?symbols=' + encodeURIComponent(s));
    const fila = data.find(row => row.symbol === s);
    if(!fila) return null; // símbolo inexistente en Bitunix -> null controlado

    const open = parseFloat(fila.open);
    const ultimo = parseFloat(fila.lastPrice !== undefined ? fila.lastPrice : fila.last);
    const volumenQuote = parseFloat(fila.quoteVol);

    // change24h: CALCULADO de open/lastPrice reales (Bitunix no lo da
    // directo — ver hallazgo documentado en la cabecera). null si
    // cualquiera de los 2 insumos no es un número válido.
    const change24h = (Number.isFinite(open) && open !== 0 && Number.isFinite(ultimo))
      ? ((ultimo - open) / open) * 100
      : null;

    return {
      exchange: EXCHANGE,
      marketType: MARKET_TYPE,
      symbol: s,
      price: Number.isFinite(ultimo) ? ultimo : null,
      change24h,
      volume24h: Number.isFinite(volumenQuote) ? volumenQuote : null,
      timestamp: Date.now() // Bitunix no entrega timestamp en este endpoint — ver hallazgo documentado en la cabecera
    };
  }

  /* ============================================================
     6. HISTÓRICOS (OHLCV normalizado — mismo contrato que ya
     consume IndicatorEngine, sin que IndicatorEngine conozca Bitunix)
     ============================================================ */
  async function getHistoricalCandles(symbol, timeframe, opciones){
    const s = String(symbol || '').trim().toUpperCase();
    if(!s) throw new Error('BitunixProvider.getHistoricalCandles: symbol es requerido');
    if(!timeframeSoportado(timeframe)){
      throw new Error('BitunixProvider.getHistoricalCandles: timeframe no soportado: ' + timeframe);
    }

    const intervaloBitunix = MAPA_TIMEFRAMES[timeframe];
    // Bitunix documenta límite máximo real de 200 por solicitud — nunca se pide más, nunca se completa artificialmente lo que falte.
    const limit = (opciones && Number.isFinite(opciones.limit)) ? Math.max(1, Math.min(opciones.limit, 200)) : 200;

    const url = KLINE_URL + '?symbol=' + encodeURIComponent(s) + '&interval=' + encodeURIComponent(intervaloBitunix) + '&limit=' + limit;
    const data = await pedirJson(url);

    return data.map(vela => ({
      time: Number(vela.time),        // Bitunix ya entrega milisegundos Unix, mismo formato que marketData.js — sin conversión
      open: parseFloat(vela.open),
      high: parseFloat(vela.high),
      low: parseFloat(vela.low),
      price: parseFloat(vela.close),  // 'price' = cierre — mismo nombre que ya usa marketData.js, para no romper el contrato de IndicatorEngine
      quoteVolume: Number.isFinite(parseFloat(vela.quoteVol)) ? parseFloat(vela.quoteVol) : null
    })).filter(v =>
      Number.isFinite(v.time) && Number.isFinite(v.open) && Number.isFinite(v.high) &&
      Number.isFinite(v.low) && Number.isFinite(v.price)
    ); // velas con datos corruptos se descartan, nunca se rellenan inventadas
  }

  /* ============================================================
     7. WEBSOCKET — placeholders explícitos, NO implementados.
     Avisan con claridad en vez de fingir funcionar (ver nota en la
     cabecera del archivo sobre por qué se difiere este subpaso).
     ============================================================ */
  function subscribeTicker(){
    throw new Error('BitunixProvider.subscribeTicker: WebSocket todavía NO implementado en esta fase (Fase 4.2.1). Usa getTicker() (REST) mientras tanto. Ver documentación en la cabecera de este archivo.');
  }
  function unsubscribeTicker(){
    // no-op deliberado: si nadie pudo suscribirse (subscribeTicker lanza
    // error), no hay nada que desuscribir — nunca falla silenciosamente
    // de forma inesperada, simplemente no hace nada.
  }
  function getConnectionStatus(){
    return 'not_implemented';
  }

  global.BitunixProvider = {
    EXCHANGE,
    MARKET_TYPE,
    getAssets,
    getCachedAssets,
    search,
    getInstrument,
    getTicker,
    getHistoricalCandles,
    subscribeTicker,
    unsubscribeTicker,
    getConnectionStatus
  };

})(typeof window !== 'undefined' ? window : globalThis);
