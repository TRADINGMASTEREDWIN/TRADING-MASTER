/* ============================================================
   TRADING MASTER — SNAPSHOT ENGINE (Fase 4.2.10)

   Responsabilidad:
   Crear una fotografía INMUTABLE del contexto de mercado asociado a
   un evento de un Trade.

   PRINCIPIOS:
   - Los hechos del evento (precio, fecha/hora, instrumento, etc.) se
     reciben como entrada y NO se recalculan ni se inventan.
   - El contexto se captura en el momento de la llamada.
   - No modifica Trades, Storage, Supabase ni MarketContext.
   - No persiste todavía. La persistencia será una fase posterior.
   - La identidad del instrumento siempre es:
       exchange + marketType + symbol
   - Variables Observadas se reciben como datos del evento; no se
     reinterpretan aquí.
   ============================================================ */

(function(global){
  const VERSION = '4.2.10';
  const SNAPSHOT_TYPE = 'MARKET_CONTEXT';

  function ahoraISO(){
    return new Date().toISOString();
  }

  function texto(valor){
    return String(valor == null ? '' : valor).trim();
  }

  function clonar(valor){
    if(valor == null) return valor;
    if(typeof structuredClone === 'function'){
      try{ return structuredClone(valor); }catch(_e){}
    }
    return JSON.parse(JSON.stringify(valor));
  }

  function congelarProfundo(valor){
    if(!valor || typeof valor !== 'object' || Object.isFrozen(valor)) return valor;
    Object.freeze(valor);
    Object.keys(valor).forEach(k => congelarProfundo(valor[k]));
    return valor;
  }

  function normalizarInstrumento(instrumento){
    const raw = instrumento || {};
    const symbol = texto(raw.symbol).toUpperCase();
    const exchange = texto(raw.exchange || 'BINANCE').toUpperCase();
    const marketType = texto(raw.marketType).toUpperCase();

    return {
      id: texto(raw.id) || `${exchange}|${marketType}|${symbol}`,
      exchange,
      marketType,
      symbol,
      baseAsset: raw.baseAsset == null ? null : texto(raw.baseAsset).toUpperCase(),
      quoteAsset: raw.quoteAsset == null ? null : texto(raw.quoteAsset).toUpperCase()
    };
  }

  function validarEvento(evento){
    const e = evento || {};
    const errores = [];

    if(!texto(e.eventType)) errores.push('eventType');
    if(!e.instrument || !texto(e.instrument.symbol)) errores.push('instrument.symbol');
    if(!texto(e.occurredAt)) errores.push('occurredAt');

    if(errores.length) return {
      status: 'INVALID_INPUT',
      errors: errores
    };

    return { status: 'OK', errors: [] };
  }

  function crearSnapshot(datos){
    const entrada = datos || {};
    const validacion = validarEvento(entrada);
    if(validacion.status !== 'OK') return validacion;

    const instrument = normalizarInstrumento(entrada.instrument);
    if(!instrument.symbol || !instrument.marketType){
      return {
        status: 'INVALID_INPUT',
        errors: [!instrument.symbol ? 'instrument.symbol' : 'instrument.marketType']
      };
    }

    const snapshot = {
      snapshot_type: SNAPSHOT_TYPE,
      snapshot_version: VERSION,
      snapshot_id: texto(entrada.snapshotId) || null,

      event: {
        type: texto(entrada.eventType).toUpperCase(),
        occurred_at: texto(entrada.occurredAt),
        sequence: Number.isFinite(Number(entrada.sequence)) ? Number(entrada.sequence) : null,
        source: texto(entrada.eventSource) || 'TRADE_EVENT'
      },

      instrument,

      execution: {
        timeframe: texto(entrada.executionTimeframe).toUpperCase() || null,
        price: entrada.executionPrice == null || entrada.executionPrice === '' ? null : Number(entrada.executionPrice),
        quantity: entrada.executionQuantity == null || entrada.executionQuantity === '' ? null : Number(entrada.executionQuantity),
        direction: texto(entrada.direction).toUpperCase() || null,
        entryType: texto(entrada.entryType).toUpperCase() || null
      },

      variables_observadas: Array.isArray(entrada.variablesObservadas)
        ? clonar(entrada.variablesObservadas)
        : [],

      context: entrada.context ? clonar(entrada.context) : null,

      capture: {
        captured_at: ahoraISO(),
        context_source: texto(entrada.contextSource) || 'MarketContext',
        facts_source: texto(entrada.factsSource) || 'TRADE_EVENT',
        automatic: entrada.automatic !== false
      }
    };

    // Evita almacenar NaN/Infinity como si fueran hechos válidos.
    ['price','quantity'].forEach(key => {
      if(snapshot.execution[key] != null && !Number.isFinite(snapshot.execution[key])){
        snapshot.execution[key] = null;
      }
    });

    return {
      status: 'OK',
      snapshot: congelarProfundo(snapshot)
    };
  }

  async function capturarSnapshot(opciones){
    const entrada = opciones || {};
    const instrument = entrada.instrument || {
      exchange: entrada.exchange,
      marketType: entrada.marketType,
      symbol: entrada.symbol
    };

    // Fase 4.3.3A — se valida ANTES de gastar ninguna llamada de red
    // (incluyendo el fetch de contexto). Mismo criterio que ya usaba
    // crearSnapshot() (validarEvento), aplicado aquí también y más
    // temprano: si no hay un occurredAt confiable, se informa de
    // inmediato — nunca se sustituye por "ahora" ni se gasta una
    // consulta de contexto para un evento que de todos modos va a
    // rechazarse al final.
    const validacionTemprana = validarEvento(Object.assign({}, entrada, { instrument }));
    if(validacionTemprana.status !== 'OK'){
      return validacionTemprana;
    }

    let context = entrada.context ? clonar(entrada.context) : null;
    let contextStatus = context ? 'PROVIDED' : 'NOT_REQUESTED';

    if(!context && entrada.captureContext !== false){
      if(typeof global.MarketContext === 'undefined' || typeof global.MarketContext.getMarketContext !== 'function'){
        return {
          status: 'CONTEXT_UNAVAILABLE',
          reason: 'MarketContext no está disponible para capturar el contexto automáticamente'
        };
      }

      try{
        const resultado = await global.MarketContext.getMarketContext({
          symbol: instrument.symbol,
          exchange: instrument.exchange,
          marketType: instrument.marketType,
          // Fase 4.3.3A — el contexto se reconstruye HASTA el momento
          // real del evento, nunca hasta "ahora" (look-ahead bias).
          asOf: entrada.occurredAt
        });

        if(!resultado || resultado.status !== 'OK'){
          return {
            status: 'CONTEXT_ERROR',
            reason: resultado && resultado.reason ? resultado.reason : 'No se pudo obtener MarketContext',
            contextResult: resultado || null
          };
        }

        context = clonar(resultado);
        contextStatus = 'CAPTURED';
      }catch(error){
        return {
          status: 'CONTEXT_ERROR',
          reason: String(error && error.message || error)
        };
      }
    }

    const resultado = crearSnapshot(Object.assign({}, entrada, {
      instrument,
      context
    }));

    if(resultado.status !== 'OK') return resultado;

    resultado.snapshot.capture.context_status = contextStatus;
    // El snapshot ya fue congelado por crearSnapshot(); reconstruimos una
    // copia congelada para conservar la inmutabilidad incluyendo el estado
    // final de captura.
    resultado.snapshot = congelarProfundo(clonar(resultado.snapshot));
    return resultado;
  }

  global.SnapshotEngine = {
    VERSION,
    SNAPSHOT_TYPE,
    crearSnapshot,
    capturarSnapshot,
    validarEvento
  };

})(typeof window !== 'undefined' ? window : globalThis);
