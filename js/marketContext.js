/* ============================================================
   TRADING MASTER — MARKET CONTEXT FOUNDATION (Sprint 0)
   Paso 4: Market Context Engine (ORQUESTADOR).

   Este archivo NO calcula ningún indicador — eso vive exclusivamente
   en indicatorEngine.js. Aquí solo se decide QUÉ pedir y a QUIÉN:

     BINANCE -> marketData.js -> OHLCV -> indicatorEngine.js
                                              |
                                              v
                                       marketContext.js
                                              |
                                              v
                              { assetContext, globalContext }

   RESPONSABILIDAD (y solo esto):
   1. Resolver symbol/marketType.
   2. Pedir OHLCV a marketData.js (getHistoricalCandles), reutilizando
      su caché existente — sin caché propia nueva.
   3. Leer qué Variables están configuradas como CALCULATED/AUTOMATIC
      con un `method` (trading_variables.config) — consulta PROPIA e
      independiente, no reutiliza el arreglo en memoria de variables.js
      (mismo criterio de "no acoplar módulos" que ya usa
      variablesObservadas.js con data_types).
   4. Delegar cada cálculo a IndicatorEngine.calculate(method, candles, config).
   5. Armar assetContext + globalContext.

   NO hace fetch directo a Binance (usa marketData.js).
   NO consulta Trades/Storage.
   NO persiste nada (no hay Snapshots todavía).
   NO modifica ningún archivo existente.
   ============================================================ */

(function(global){

  // Temporalidades del Context Engine — independientes de las del
  // Analyzer y de las del selector de Watchlist/Pulso (ver notas en
  // marketData.js, CONFIG_TIMEFRAME vs CONFIG_TIMEFRAME_GRAFICO).
  const CONTEXTO_TIMEFRAMES = ['15M', '1H', '4H', '1D', '1W'];

  /* ============================================================
     MARKET TYPE — resolución PROVISIONAL (Fase 2, aprobada).

     Regla actual: si el símbolo existe en el catálogo Spot público de
     Binance (ya cargado por marketData.js), es SPOT. Si no aparece
     ahí, se asume FUTURES — mismo criterio ya usado a mano para
     HYPEUSDT en el resto del proyecto.

     Se deja ENCAPSULADA en esta única función a propósito: el día que
     se decida una fuente de verdad más robusta (ej. una columna en
     `assets`), solo esta función cambia — nada más en este archivo
     necesita enterarse. NO se modificó `assets` para este Sprint.
     ============================================================ */
  async function resolverMarketType(symbol){
    const s = String(symbol || '').trim().toUpperCase();
    if(!s) return 'FUTURES'; // sin símbolo no hay forma de confirmar Spot — mismo criterio conservador

    if(typeof BinanceMarketData === 'undefined'){
      console.error('[MarketContext] BinanceMarketData no está disponible — no se puede resolver marketType, se asume FUTURES.');
      return 'FUTURES';
    }
    try{
      await BinanceMarketData.loadCatalog(); // no-op si ya está cargado (loadCatalog cachea internamente)
    }catch(error){
      console.error('[MarketContext] No se pudo cargar el catálogo Spot para resolverMarketType, se asume FUTURES:', error);
      return 'FUTURES';
    }
    const enCatalogoSpot = BinanceMarketData.getCatalog().some(item => item.symbol === s);
    return enCatalogoSpot ? 'SPOT' : 'FUTURES';
  }

  /* ============================================================
     VARIABLES CALCULABLES — consulta propia a trading_variables.
     Solo se consideran las que:
       - están activas (is_active = true)
       - config.source es CALCULATED o AUTOMATIC
       - config.method está presente
     Las MANUAL nunca llegan aquí -> nunca se intenta calcularlas.
     ============================================================ */
  async function obtenerVariablesCalculables(){
    if(typeof supabaseClient === 'undefined'){
      console.error('[MarketContext] supabaseClient no está disponible — no se pudieron leer las Variables configuradas.');
      return [];
    }
    const { data, error } = await supabaseClient
      .from('trading_variables')
      .select('id, code, name, config, is_active')
      .eq('is_active', true);

    if(error){
      console.error('[MarketContext] No se pudieron cargar las Variables calculables desde trading_variables:', error);
      return [];
    }

    return (data || []).filter(v =>
      v && v.config &&
      (v.config.source === 'CALCULATED' || v.config.source === 'AUTOMATIC') &&
      typeof v.config.method === 'string' && v.config.method.trim() !== ''
    );
  }

  // Delega el cálculo completo a IndicatorEngine — se pasa el config
  // COMPLETO de la Variable (periodo, fastPeriod, kPeriod, lo que sea)
  // tal cual está en Supabase. IndicatorEngine ya sabe qué claves le
  // interesan a cada método y ignora el resto (source/provider/method
  // incluidos) — cero acoplamiento de forma aquí.
  function resolverIndicador(variable, candles){
    if(typeof IndicatorEngine === 'undefined'){
      return { method: variable.config.method, value: null, status: 'ERROR', config: {}, error: 'IndicatorEngine no está disponible' };
    }
    return IndicatorEngine.calculate(variable.config.method, candles, variable.config);
  }

  /* ============================================================
     ASSET CONTEXT — por símbolo, por temporalidad.
     Un fallo obteniendo velas de UNA temporalidad, o calculando UN
     indicador, nunca tumba el resto (regla explícita del Sprint).
     ============================================================ */
  async function construirAssetContext(symbol, marketType, variablesCalculables){
    const timeframes = {};

    for(const tf of CONTEXTO_TIMEFRAMES){
      let candles;
      try{
        candles = await BinanceMarketData.getHistoricalCandles(symbol, tf, { marketType });
      }catch(error){
        // Esta temporalidad queda marcada con su propio error — las demás continúan.
        timeframes[tf] = { indicators: {}, status: 'ERROR', error: String(error && error.message || error) };
        continue;
      }

      const indicators = {};
      for(const variable of variablesCalculables){
        try{
          indicators[variable.code] = resolverIndicador(variable, candles);
        }catch(error){
          indicators[variable.code] = { method: variable.config.method, value: null, status: 'ERROR', config: {}, error: String(error && error.message || error) };
        }
      }
      timeframes[tf] = { indicators, status: 'OK' };
    }

    return { symbol, marketType, timeframes };
  }

  /* ============================================================
     GLOBAL CONTEXT

     Fear & Greed: reutilizado directamente vía MarketSentiment.getCurrent()
     — cero duplicación, ya expuesto públicamente por ese módulo.

     Pulso y Sesiones: NO IMPLEMENTADOS EN ESTE PASO. marketStatus.js
     no expone ningún getter público para ninguno de los dos (solo
     init/destroy/getWatchlist/setWatchlist) — ver detalle completo en
     el reporte de entrega. Se deja el campo presente con status
     explícito en vez de omitirlo u ocultarlo.
     ============================================================ */
  async function construirGlobalContext(){
    let fearGreed = { status: 'NOT_AVAILABLE', reason: 'MarketSentiment no está disponible en este entorno' };
    if(typeof MarketSentiment !== 'undefined'){
      const actual = MarketSentiment.getCurrent();
      fearGreed = actual || { status: 'NOT_AVAILABLE', reason: 'MarketSentiment todavía no tiene un dato cacheado' };
    }

    return {
      fearGreed,
      marketPulse: {
        status: 'NOT_IMPLEMENTED',
        reason: 'marketStatus.js no expone un getter público del Pulso y depende de suscripciones WebSocket activas de la Watchlist — ver reporte de entrega del Paso 4, no se duplicó esa lógica.'
      },
      sessions: {
        status: 'NOT_IMPLEMENTED',
        reason: 'marketStatus.js no expone un getter público de sesiones y su cálculo real incluye un calendario de feriados (NYSE/Londres/Tokio) extenso — ver reporte de entrega del Paso 4, no se duplicó esa lógica.'
      }
    };
  }

  /* ============================================================
     PUNTO DE ENTRADA ÚNICO
     ============================================================ */
  async function getMarketContext(opciones){
    const symbol = opciones && opciones.symbol;
    if(typeof symbol !== 'string' || symbol.trim() === ''){
      return { status: 'INVALID_INPUT', reason: 'symbol debe ser un string no vacío', assetContext: null, globalContext: null };
    }
    const symbolNormalizado = symbol.trim().toUpperCase();

    let marketType = opciones && opciones.marketType;
    if(marketType !== 'SPOT' && marketType !== 'FUTURES'){
      marketType = await resolverMarketType(symbolNormalizado);
    }

    const variablesCalculables = await obtenerVariablesCalculables();

    let assetContext;
    try{
      assetContext = await construirAssetContext(symbolNormalizado, marketType, variablesCalculables);
    }catch(error){
      // Red de seguridad: no debería llegar aquí (los fallos por
      // temporalidad/indicador ya se capturan adentro), pero si algo
      // no anticipado explota, se reporta en vez de romper la llamada.
      return { status: 'ERROR', reason: String(error && error.message || error), assetContext: null, globalContext: null };
    }

    const globalContext = await construirGlobalContext();

    return { status: 'OK', assetContext, globalContext };
  }

  global.MarketContext = {
    getMarketContext,
    resolverMarketType // expuesta a propósito — ver nota PROVISIONAL arriba
  };

})(typeof window !== 'undefined' ? window : globalThis);
