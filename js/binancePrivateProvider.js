/* ============================================================
   TRADING MASTER — Fase 4.3.5A
   BINANCE PRIVATE PROVIDER — READ-ONLY / BACKEND-READY

   PROPÓSITO
   Preparar la capa privada de Binance para futura importación de datos
   de cuenta SIN conectarla todavía a la UI, Supabase ni al frontend.

   SEGURIDAD
   - NO contiene API Keys.
   - NO contiene Secret Keys.
   - NO almacena credenciales.
   - NO ejecuta llamadas privadas por sí mismo en esta fase.
   - Expone builders de solicitudes y una fábrica que acepta un transport
     externo (futuro backend/Edge Function).
   - Solo contempla endpoints USER_DATA de lectura.

   FUENTE ECONÓMICA
   - Fills / trades ejecutados = verdad económica.
   - Orders = metadatos del ciclo de vida.
   - Positions / balances = estado actual, no histórico.

   No clasifica ENTRY / EXIT / ADD / AVERAGE / CLOSE y no calcula PnL.
   Esa responsabilidad pertenece al motor existente de Trading Master.
   ============================================================ */

(function(global){
  const HOSTS = Object.freeze({
    SPOT: 'https://api.binance.com',
    FUTURES: 'https://fapi.binance.com'
  });

  const ENDPOINTS = Object.freeze({
    SPOT_FILLS: '/api/v3/myTrades',
    SPOT_ORDERS: '/api/v3/allOrders',
    SPOT_BALANCES: '/api/v3/account',
    FUTURES_FILLS: '/fapi/v1/userTrades',
    FUTURES_ORDERS: '/fapi/v1/allOrders',
    FUTURES_BALANCES: '/fapi/v3/balance',
    FUTURES_POSITIONS: '/fapi/v3/positionRisk'
  });

  function normalizarParams(params){
    const resultado = {};
    if(!params || typeof params !== 'object') return resultado;

    Object.keys(params).forEach(key => {
      const value = params[key];
      if(value === undefined || value === null || value === '') return;
      resultado[key] = value;
    });

    return resultado;
  }

  function construirQuery(params){
    const clean = normalizarParams(params);
    const keys = Object.keys(clean).sort();
    return keys.map(key => `${encodeURIComponent(key)}=${encodeURIComponent(clean[key])}`).join('&');
  }

  function construirSolicitud(endpoint, params){
    const query = construirQuery(params);
    return {
      method: 'GET',
      endpoint,
      query,
      pathWithQuery: query ? `${endpoint}?${query}` : endpoint
    };
  }

  function exigirTransport(transport){
    if(typeof transport !== 'function'){
      throw new Error(
        'BinancePrivateProvider requiere un transport externo seguro. ' +
        'No se realizan llamadas privadas directamente desde Trading Master en esta fase.'
      );
    }
    return transport;
  }

  async function ejecutar(transport, solicitud, contexto){
    const fn = exigirTransport(transport);
    return fn({
      exchange: 'BINANCE',
      ...solicitud,
      context: contexto || null
    });
  }

  // ------------------------------------------------------------
  // Builders públicos de solicitudes USER_DATA.
  // El futuro backend será responsable de API Key + firma + timestamp.
  // ------------------------------------------------------------

  function buildSpotFillsRequest(params){
    return construirSolicitud(ENDPOINTS.SPOT_FILLS, params);
  }

  function buildFuturesFillsRequest(params){
    return construirSolicitud(ENDPOINTS.FUTURES_FILLS, params);
  }

  function buildSpotOrdersRequest(params){
    return construirSolicitud(ENDPOINTS.SPOT_ORDERS, params);
  }

  function buildFuturesOrdersRequest(params){
    return construirSolicitud(ENDPOINTS.FUTURES_ORDERS, params);
  }

  function buildSpotBalancesRequest(params){
    return construirSolicitud(ENDPOINTS.SPOT_BALANCES, params);
  }

  function buildFuturesBalancesRequest(params){
    return construirSolicitud(ENDPOINTS.FUTURES_BALANCES, params);
  }

  function buildFuturesPositionsRequest(params){
    return construirSolicitud(ENDPOINTS.FUTURES_POSITIONS, params);
  }

  // ------------------------------------------------------------
  // Métodos de provider: únicamente delegan al transport seguro.
  // No contienen credenciales ni mecanismo de firma en el navegador.
  // ------------------------------------------------------------

  async function getSpotFills(transport, params){
    return ejecutar(transport, buildSpotFillsRequest(params), {
      marketType: 'SPOT',
      dataType: 'FILLS'
    });
  }

  async function getFuturesFills(transport, params){
    return ejecutar(transport, buildFuturesFillsRequest(params), {
      marketType: 'FUTURES',
      dataType: 'FILLS'
    });
  }

  async function getSpotOrders(transport, params){
    return ejecutar(transport, buildSpotOrdersRequest(params), {
      marketType: 'SPOT',
      dataType: 'ORDERS'
    });
  }

  async function getFuturesOrders(transport, params){
    return ejecutar(transport, buildFuturesOrdersRequest(params), {
      marketType: 'FUTURES',
      dataType: 'ORDERS'
    });
  }

  async function getSpotBalances(transport, params){
    return ejecutar(transport, buildSpotBalancesRequest(params), {
      marketType: 'SPOT',
      dataType: 'BALANCES'
    });
  }

  async function getFuturesBalances(transport, params){
    return ejecutar(transport, buildFuturesBalancesRequest(params), {
      marketType: 'FUTURES',
      dataType: 'BALANCES'
    });
  }

  async function getFuturesPositions(transport, params){
    return ejecutar(transport, buildFuturesPositionsRequest(params), {
      marketType: 'FUTURES',
      dataType: 'POSITIONS'
    });
  }

  global.BinancePrivateProvider = Object.freeze({
    EXCHANGE: 'BINANCE',
    HOSTS,
    ENDPOINTS,
    buildSpotFillsRequest,
    buildFuturesFillsRequest,
    buildSpotOrdersRequest,
    buildFuturesOrdersRequest,
    buildSpotBalancesRequest,
    buildFuturesBalancesRequest,
    buildFuturesPositionsRequest,
    getSpotFills,
    getFuturesFills,
    getSpotOrders,
    getFuturesOrders,
    getSpotBalances,
    getFuturesBalances,
    getFuturesPositions
  });
})(window);
