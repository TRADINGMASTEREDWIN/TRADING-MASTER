/* ============================================================
   TRADING MASTER — MULTI-EXCHANGE FOUNDATION (Fase 4.2.3)
   INSTRUMENT CATALOG — ORQUESTADOR PASIVO

   PROPÓSITO
   Unificar, sin modificar los providers existentes, los instrumentos
   públicos de:
     - BINANCE / SPOT
     - BINANCE / FUTURES
     - BITUNIX / FUTURES

   Este módulo es deliberadamente independiente de UI, Supabase,
   Trades, MarketContext, MarketStatus, Watchlist y WebSockets.

   IDENTIDAD ÚNICA
     exchange + marketType + symbol

   IMPORTANTE
   - BTCUSDT Spot y BTCUSDT Futures son instrumentos DISTINTOS.
   - No se deduplica solo por symbol.
   - Un fallo de un provider no invalida los resultados de los demás.
   - No se inventan instrumentos ni datos.
   - No modifica los objetos recibidos de ningún provider.
   ============================================================ */

(function(global){
  const EXCHANGES = Object.freeze({
    BINANCE: 'BINANCE',
    BITUNIX: 'BITUNIX'
  });

  const MARKET_TYPES = Object.freeze({
    SPOT: 'SPOT',
    FUTURES: 'FUTURES'
  });

  const ESTADOS = Object.freeze({
    OK: 'OK',
    PARTIAL: 'PARTIAL',
    ERROR: 'ERROR',
    INVALID_INPUT: 'INVALID_INPUT'
  });

  // Caché propia únicamente del catálogo unificado. Los providers
  // conservan sus propias cachés de red y sus propias políticas de TTL.
  let catalogo = null;
  let cargaEnProgreso = null;
  let ultimoEstadoCarga = null;

  function textoNormalizado(valor){
    return String(valor || '').trim().toUpperCase();
  }

  function construirId(item){
    if(!item) return null;
    const exchange = textoNormalizado(item.exchange);
    const marketType = textoNormalizado(item.marketType);
    const symbol = textoNormalizado(item.symbol);
    if(!exchange || !marketType || !symbol) return null;
    return `${exchange}|${marketType}|${symbol}`;
  }

  function normalizarBinanceSpot(item){
    if(!item || !item.symbol) return null;
    return {
      exchange: EXCHANGES.BINANCE,
      marketType: MARKET_TYPES.SPOT,
      symbol: textoNormalizado(item.symbol),
      baseAsset: item.baseAsset || null,
      quoteAsset: item.quoteAsset || null,
      status: item.status || 'TRADING',
      estaOperable: true
    };
  }

  function normalizarInstrumento(item){
    if(!item || typeof item !== 'object') return null;

    const exchange = textoNormalizado(item.exchange);
    const marketType = textoNormalizado(item.marketType);
    const symbol = textoNormalizado(item.symbol);

    if(!exchange || !marketType || !symbol) return null;
    if(!item.baseAsset || !item.quoteAsset) return null;

    const normalizado = Object.assign({}, item, {
      exchange,
      marketType,
      symbol,
      baseAsset: textoNormalizado(item.baseAsset),
      quoteAsset: textoNormalizado(item.quoteAsset)
    });

    // El ID se calcula a partir de la identidad canónica y no se toma
    // de ningún provider externo.
    normalizado.id = construirId(normalizado);
    return normalizado;
  }

  function agregarSinDuplicar(mapa, items){
    for(const item of (items || [])){
      const normalizado = normalizarInstrumento(item);
      if(!normalizado || !normalizado.id) continue;
      if(!mapa.has(normalizado.id)){
        mapa.set(normalizado.id, normalizado);
      }
    }
  }

  function ordenarCatalogo(items){
    return items.slice().sort((a, b) => {
      const exchange = a.exchange.localeCompare(b.exchange);
      if(exchange !== 0) return exchange;
      const marketType = a.marketType.localeCompare(b.marketType);
      if(marketType !== 0) return marketType;
      return a.symbol.localeCompare(b.symbol);
    });
  }

  async function cargarProvider(nombre, cargador){
    try{
      const data = await cargador();
      return { nombre, ok: true, data: Array.isArray(data) ? data : [] };
    }catch(error){
      console.error(`[InstrumentCatalog] ${nombre} no disponible:`, error);
      return {
        nombre,
        ok: false,
        data: [],
        error: String(error && error.message || error)
      };
    }
  }

  async function cargarCatalogo(opciones){
    if(catalogo !== null && !(opciones && opciones.forzarRefresco)){
      return {
        status: ultimoEstadoCarga ? ultimoEstadoCarga.status : ESTADOS.OK,
        instruments: catalogo.slice(),
        providers: ultimoEstadoCarga ? ultimoEstadoCarga.providers.slice() : []
      };
    }

    if(cargaEnProgreso) return cargaEnProgreso;

    cargaEnProgreso = (async () => {
      const tareas = [];

      if(global.BinanceMarketData && typeof global.BinanceMarketData.loadCatalog === 'function'){
        tareas.push(cargarProvider('BINANCE_SPOT', () => global.BinanceMarketData.loadCatalog()));
      }else{
        tareas.push(Promise.resolve({ nombre: 'BINANCE_SPOT', ok: false, data: [], error: 'Provider no disponible' }));
      }

      if(global.BinanceMarketData && typeof global.BinanceMarketData.loadFuturesCatalog === 'function'){
        tareas.push(cargarProvider('BINANCE_FUTURES', () => global.BinanceMarketData.loadFuturesCatalog()));
      }else{
        tareas.push(Promise.resolve({ nombre: 'BINANCE_FUTURES', ok: false, data: [], error: 'Provider no disponible' }));
      }

      if(global.BitunixProvider && typeof global.BitunixProvider.getAssets === 'function'){
        tareas.push(cargarProvider('BITUNIX_FUTURES', () => global.BitunixProvider.getAssets(opciones)));
      }else{
        tareas.push(Promise.resolve({ nombre: 'BITUNIX_FUTURES', ok: false, data: [], error: 'Provider no disponible' }));
      }

      const resultados = await Promise.all(tareas);
      const mapa = new Map();

      // Binance Spot histórico no lleva exchange/marketType; el adapter
      // local completa únicamente esos campos, sin mutar el provider.
      if(resultados[0].ok){
        agregarSinDuplicar(mapa, resultados[0].data.map(normalizarBinanceSpot));
      }
      if(resultados[1].ok){
        agregarSinDuplicar(mapa, resultados[1].data);
      }
      if(resultados[2].ok){
        agregarSinDuplicar(mapa, resultados[2].data);
      }

      const proveedoresOk = resultados.filter(r => r.ok).length;
      const instrumentos = ordenarCatalogo(Array.from(mapa.values()));
      let status = ESTADOS.OK;
      if(proveedoresOk === 0) status = ESTADOS.ERROR;
      else if(proveedoresOk < resultados.length) status = ESTADOS.PARTIAL;

      catalogo = instrumentos;
      ultimoEstadoCarga = {
        status,
        providers: resultados.map(r => ({
          name: r.nombre,
          status: r.ok ? 'OK' : 'ERROR',
          count: r.data.length,
          error: r.ok ? null : r.error
        }))
      };

      return {
        status,
        instruments: instrumentos.slice(),
        providers: ultimoEstadoCarga.providers.slice()
      };
    })();

    try{
      return await cargaEnProgreso;
    }finally{
      cargaEnProgreso = null;
    }
  }

  function getCatalog(){
    return catalogo ? catalogo.slice() : [];
  }

  function getLoadStatus(){
    if(!ultimoEstadoCarga){
      return { status: 'NOT_LOADED', providers: [] };
    }
    return {
      status: ultimoEstadoCarga.status,
      providers: ultimoEstadoCarga.providers.slice()
    };
  }

  async function search(query, opciones){
    const q = textoNormalizado(query);
    if(!q) return [];

    const resultadoCarga = await cargarCatalogo(opciones);
    if(resultadoCarga.status === ESTADOS.ERROR && !resultadoCarga.instruments.length){
      return [];
    }

    const exchange = textoNormalizado(opciones && opciones.exchange);
    const marketType = textoNormalizado(opciones && opciones.marketType);

    const resultados = resultadoCarga.instruments.filter(item => {
      if(exchange && item.exchange !== exchange) return false;
      if(marketType && item.marketType !== marketType) return false;
      return item.symbol.indexOf(q) !== -1 ||
             item.baseAsset.indexOf(q) !== -1 ||
             item.quoteAsset.indexOf(q) !== -1;
    });

    // Primero coincidencia exacta de símbolo, luego baseAsset exacto,
    // después el resto. Dentro de cada grupo se conserva el orden estable.
    return resultados.slice().sort((a, b) => {
      const score = item => {
        if(item.symbol === q) return 0;
        if(item.baseAsset === q) return 1;
        if(item.symbol.startsWith(q)) return 2;
        if(item.baseAsset.startsWith(q)) return 3;
        return 4;
      };
      const diferencia = score(a) - score(b);
      if(diferencia !== 0) return diferencia;
      const usdtA = a.quoteAsset === 'USDT' ? 0 : 1;
      const usdtB = b.quoteAsset === 'USDT' ? 0 : 1;
      if(usdtA !== usdtB) return usdtA - usdtB;
      return a.id.localeCompare(b.id);
    });
  }

  async function resolve(opciones){
    if(typeof opciones === 'string'){
      opciones = { symbol: opciones };
    }
    opciones = opciones || {};

    const symbol = textoNormalizado(opciones.symbol);
    if(!symbol){
      return { status: ESTADOS.INVALID_INPUT, instrument: null, matches: [] };
    }

    await cargarCatalogo(opciones);

    const exchange = textoNormalizado(opciones.exchange);
    const marketType = textoNormalizado(opciones.marketType);

    const matches = getCatalog().filter(item =>
      item.symbol === symbol &&
      (!exchange || item.exchange === exchange) &&
      (!marketType || item.marketType === marketType)
    );

    if(matches.length === 1){
      return { status: ESTADOS.OK, instrument: matches[0], matches };
    }

    // Si hay más de uno, no se inventa una preferencia: se devuelve la
    // ambigüedad para que el llamador obligue a especificar exchange y/o
    // marketType.
    return {
      status: matches.length ? 'AMBIGUOUS' : 'NOT_FOUND',
      instrument: null,
      matches
    };
  }

  async function resolveIdentity(exchange, marketType, symbol){
    const e = textoNormalizado(exchange);
    const m = textoNormalizado(marketType);
    const s = textoNormalizado(symbol);
    if(!e || !m || !s){
      return { status: ESTADOS.INVALID_INPUT, instrument: null };
    }

    await cargarCatalogo();
    const id = `${e}|${m}|${s}`;
    const instrument = getCatalog().find(item => item.id === id) || null;
    return {
      status: instrument ? ESTADOS.OK : 'NOT_FOUND',
      instrument
    };
  }

  function groupByBaseAsset(items){
    const grupos = {};
    for(const item of (items || getCatalog())){
      const key = item.baseAsset;
      if(!grupos[key]) grupos[key] = [];
      grupos[key].push(item);
    }
    return grupos;
  }

  // API pública deliberadamente pequeña. No expone helpers internos ni
  // referencias mutables a la caché.
  global.InstrumentCatalog = {
    EXCHANGES,
    MARKET_TYPES,
    ESTADOS,
    load: cargarCatalogo,
    getCatalog,
    getLoadStatus,
    search,
    resolve,
    resolveIdentity,
    groupByBaseAsset
  };

})(typeof window !== 'undefined' ? window : globalThis);
