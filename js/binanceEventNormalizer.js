/* ============================================================
   TRADING MASTER — Fase 4.3.5A
   BINANCE EVENT NORMALIZER

   Convierte fills privados de Binance a Canonical Event.

   CONTRATO CANÓNICO APROBADO (4.3.4)
     source_type
     exchange
     external_id
     account_ref
     event_type
     event_at
     instrument { exchange, marketType, symbol, baseAsset, quoteAsset }
     direction
     price
     quantity
     commission
     amount
     metadata

   IMPORTANTE
   - Un fill de Binance es un hecho externo: event_type = FILL.
   - ENTRY / EXIT / ADD / AVERAGE / CLOSE NO se derivan aquí.
   - No hay FIFO.
   - No calcula PnL.
   - realizedPnl de Futures se conserva únicamente en metadata.
   - El payload original se conserva para trazabilidad.
   ============================================================ */

(function(global){
  const SOURCE_TYPE = 'EXTERNAL';
  const EVENT_TYPE = 'FILL';
  const EXCHANGE = 'BINANCE';

  function numeroValido(value){
    const n = Number(value);
    return Number.isFinite(n);
  }

  function stringNoVacia(value){
    return typeof value === 'string' && value.trim() !== '';
  }

  function isoDesdeBinanceTime(value){
    if(!numeroValido(value)) return null;
    const date = new Date(Number(value));
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  function exigirObjeto(raw){
    if(!raw || typeof raw !== 'object' || Array.isArray(raw)){
      throw new Error('BinanceEventNormalizer requiere un fill de Binance válido.');
    }
  }

  function construirInstrumento(raw, marketType){
    const symbol = String(raw.symbol || '').trim().toUpperCase();
    const baseAsset = String(raw.baseAsset || '').trim().toUpperCase();
    const quoteAsset = String(raw.quoteAsset || '').trim().toUpperCase();

    if(!symbol || !baseAsset || !quoteAsset){
      throw new Error('Fill de Binance sin symbol/baseAsset/quoteAsset suficientes para identidad de instrumento.');
    }

    return {
      exchange: EXCHANGE,
      marketType,
      symbol,
      baseAsset,
      quoteAsset
    };
  }

  function completarActivosDesdeSymbol(raw, instrumento){
    // Binance fill normalmente no trae baseAsset/quoteAsset.
    // Si el llamador aporta instrumentInfo, se utiliza; nunca se adivina.
    if(instrumento) return construirInstrumento({
      symbol: raw.symbol,
      baseAsset: instrumento.baseAsset,
      quoteAsset: instrumento.quoteAsset
    }, instrumento.marketType);

    return null;
  }

  function normalizarSpotFill(raw, opciones){
    exigirObjeto(raw);
    opciones = opciones || {};

    const instrumentInfo = opciones.instrument || null;
    const instrument = completarActivosDesdeSymbol(raw, instrumentInfo);
    if(!instrument) throw new Error('Para normalizar un Spot fill se requiere instrument {baseAsset, quoteAsset, marketType}.');
    if(instrument.marketType !== 'SPOT') throw new Error('El instrument de un Spot fill debe tener marketType=SPOT.');

    const externalId = raw.id !== undefined && raw.id !== null ? String(raw.id) : null;
    const eventAt = isoDesdeBinanceTime(raw.time);
    const quantity = Number(raw.qty);
    const price = Number(raw.price);

    if(!externalId) throw new Error('Spot fill sin id externo.');
    if(!eventAt) throw new Error('Spot fill sin time válido.');
    if(!numeroValido(quantity) || quantity < 0) throw new Error('Spot fill con qty inválido.');
    if(!numeroValido(price) || price < 0) throw new Error('Spot fill con price inválido.');

    return {
      source_type: SOURCE_TYPE,
      exchange: EXCHANGE,
      external_id: externalId,
      account_ref: opciones.account_ref || null,
      event_type: EVENT_TYPE,
      event_at: eventAt,
      instrument,
      direction: raw.isBuyer === true ? 'Compra' : raw.isBuyer === false ? 'Venta' : null,
      price,
      quantity,
      commission: numeroValido(raw.commission) ? Number(raw.commission) : null,
      amount: numeroValido(raw.quoteQty) ? Number(raw.quoteQty) : null,
      metadata: {
        rawIds: {
          orderId: raw.orderId !== undefined && raw.orderId !== null ? String(raw.orderId) : null,
          tradeId: externalId
        },
        commissionAsset: raw.commissionAsset || null,
        isMaker: raw.isMaker === true,
        raw: raw
      }
    };
  }

  function normalizarFuturesFill(raw, opciones){
    exigirObjeto(raw);
    opciones = opciones || {};

    const instrumentInfo = opciones.instrument || null;
    const instrument = completarActivosDesdeSymbol(raw, instrumentInfo);
    if(!instrument) throw new Error('Para normalizar un Futures fill se requiere instrument {baseAsset, quoteAsset, marketType}.');
    if(instrument.marketType !== 'FUTURES') throw new Error('El instrument de un Futures fill debe tener marketType=FUTURES.');

    const externalId = raw.id !== undefined && raw.id !== null ? String(raw.id) : null;
    const eventAt = isoDesdeBinanceTime(raw.time);
    const quantity = Number(raw.qty);
    const price = Number(raw.price);

    if(!externalId) throw new Error('Futures fill sin id externo.');
    if(!eventAt) throw new Error('Futures fill sin time válido.');
    if(!numeroValido(quantity) || quantity < 0) throw new Error('Futures fill con qty inválido.');
    if(!numeroValido(price) || price < 0) throw new Error('Futures fill con price inválido.');

    return {
      source_type: SOURCE_TYPE,
      exchange: EXCHANGE,
      external_id: externalId,
      account_ref: opciones.account_ref || null,
      event_type: EVENT_TYPE,
      event_at: eventAt,
      instrument,
      direction: typeof raw.side === 'string' ?
        (raw.side.toUpperCase() === 'BUY' ? 'Compra' : raw.side.toUpperCase() === 'SELL' ? 'Venta' : null) : null,
      price,
      quantity,
      commission: numeroValido(raw.commission) ? Number(raw.commission) : null,
      amount: numeroValido(raw.quoteQty) ? Number(raw.quoteQty) : null,
      metadata: {
        rawIds: {
          orderId: raw.orderId !== undefined && raw.orderId !== null ? String(raw.orderId) : null,
          tradeId: externalId
        },
        realizedPnl: numeroValido(raw.realizedPnl) ? Number(raw.realizedPnl) : null,
        commissionAsset: raw.commissionAsset || null,
        positionSide: raw.positionSide || null,
        maker: raw.maker === true,
        buyer: raw.buyer === true,
        raw: raw
      }
    };
  }

  function normalizarFills(fills, opciones){
    if(!Array.isArray(fills)) throw new Error('BinanceEventNormalizer requiere un array de fills.');
    opciones = opciones || {};
    const marketType = opciones.marketType;

    if(marketType !== 'SPOT' && marketType !== 'FUTURES'){
      throw new Error('normalizarFills requiere marketType=SPOT o FUTURES.');
    }

    return fills.map(fill => marketType === 'SPOT'
      ? normalizarSpotFill(fill, opciones)
      : normalizarFuturesFill(fill, opciones));
  }

  function validarCanonicalEvent(evento){
    if(!evento || typeof evento !== 'object') return false;
    if(evento.source_type !== 'EXTERNAL') return false;
    if(evento.exchange !== EXCHANGE) return false;
    if(!stringNoVacia(evento.external_id)) return false;
    if(evento.event_type !== EVENT_TYPE) return false;
    if(!stringNoVacia(evento.event_at)) return false;
    if(!evento.instrument || evento.instrument.exchange !== EXCHANGE) return false;
    if(evento.instrument.marketType !== 'SPOT' && evento.instrument.marketType !== 'FUTURES') return false;
    if(!stringNoVacia(evento.instrument.symbol)) return false;
    if(!stringNoVacia(evento.instrument.baseAsset)) return false;
    if(!stringNoVacia(evento.instrument.quoteAsset)) return false;
    if(evento.direction !== 'Compra' && evento.direction !== 'Venta') return false;
    if(!numeroValido(evento.price) || !numeroValido(evento.quantity)) return false;
    return true;
  }

  global.BinanceEventNormalizer = Object.freeze({
    SOURCE_TYPE,
    EVENT_TYPE,
    EXCHANGE,
    normalizarSpotFill,
    normalizarFuturesFill,
    normalizarFills,
    validarCanonicalEvent
  });
})(window);
