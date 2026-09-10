/* ============================================================
   Trading Master — InstrumentMarketData
   Fase 4.2.6 — Router de datos por identidad de instrumento.

   Objetivo:
   - Mantener una única API para precio/ticker de un instrumento.
   - Binance usa sus WebSockets existentes.
   - Bitunix usa getTicker() REST como fallback controlado mientras su
     WebSocket propio no esté implementado.
   - La identidad siempre es exchange + marketType + symbol.
   - No modifica providers ni crea conexiones Binance adicionales.
   ============================================================ */
(function(global){
  'use strict';


  function normalizarInstrumento(instrumento){
    if(!instrumento) return null;
    const symbol = String(instrumento.symbol || '').trim().toUpperCase();
    const exchange = String(instrumento.exchange || '').trim().toUpperCase();
    const marketType = String(instrumento.marketType || '').trim().toUpperCase();
    if(!symbol || !exchange || !marketType) return null;
    return { ...instrumento, symbol, exchange, marketType };
  }

  function esBinance(instrumento){ return instrumento.exchange === 'BINANCE'; }
  function esBitunix(instrumento){ return instrumento.exchange === 'BITUNIX'; }

  function opcionesBinance(instrumento){
    return { marketType: instrumento.marketType };
  }

  async function getHistoricalCandles(instrumento, timeframe, opciones){
    const i = normalizarInstrumento(instrumento);
    if(!i) throw new Error('InstrumentMarketData.getHistoricalCandles: instrumento inválido');

    if(esBinance(i) && global.BinanceMarketData && typeof global.BinanceMarketData.getHistoricalCandles === 'function'){
      return global.BinanceMarketData.getHistoricalCandles(i.symbol, timeframe, {
        ...(opciones || {}),
        marketType: i.marketType
      });
    }

    if(esBitunix(i) && i.marketType === 'FUTURES' && global.BitunixProvider && typeof global.BitunixProvider.getHistoricalCandles === 'function'){
      return global.BitunixProvider.getHistoricalCandles(i.symbol, timeframe, opciones || {});
    }

    throw new Error(`InstrumentMarketData.getHistoricalCandles: proveedor no soportado para ${i.exchange}/${i.marketType}`);
  }

  async function getTicker(instrumento){
    const i = normalizarInstrumento(instrumento);
    if(!i) return null;

    if(esBinance(i) && global.BinanceMarketData && typeof global.BinanceMarketData.getTicker === 'function'){
      return global.BinanceMarketData.getTicker(i.symbol, opcionesBinance(i));
    }

    if(esBitunix(i) && i.marketType === 'FUTURES' && global.BitunixProvider && typeof global.BitunixProvider.getTicker === 'function'){
      return global.BitunixProvider.getTicker(i.symbol);
    }

    return null;
  }

  function subscribeTicker(instrumento, callback){
    const i = normalizarInstrumento(instrumento);
    if(!i || typeof callback !== 'function') return () => {};

    if(esBinance(i) && global.BinanceMarketData && typeof global.BinanceMarketData.subscribeTicker === 'function'){
      global.BinanceMarketData.subscribeTicker(i.symbol, callback, opcionesBinance(i));
      return () => unsubscribeTicker(i, callback);
    }

    if(esBitunix(i) && i.marketType === 'FUTURES' && global.BitunixProvider && typeof global.BitunixProvider.subscribeTicker === 'function'){
      return global.BitunixProvider.subscribeTicker(i.symbol, callback);
    }

    return () => {};
  }

  function unsubscribeTicker(instrumento, callback){
    const i = normalizarInstrumento(instrumento);
    if(!i || typeof callback !== 'function') return;

    if(esBinance(i) && global.BinanceMarketData && typeof global.BinanceMarketData.unsubscribeTicker === 'function'){
      global.BinanceMarketData.unsubscribeTicker(i.symbol, callback, opcionesBinance(i));
      return;
    }

    if(esBitunix(i) && i.marketType === 'FUTURES' && global.BitunixProvider && typeof global.BitunixProvider.unsubscribeTicker === 'function'){
      global.BitunixProvider.unsubscribeTicker(i.symbol, callback);
    }
  }

  global.InstrumentMarketData = {
    getTicker,
    getHistoricalCandles,
    subscribeTicker,
    unsubscribeTicker
  };
})(typeof window !== 'undefined' ? window : globalThis);
