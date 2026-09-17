/**
 * Trading Master — Binance WebSocket fill adapter
 * FASE WS-1: WebSocket -> canonical fill candidate
 *
 * This module only translates Binance user-data events.
 * It does NOT classify ENTRY/EXIT and does NOT calculate PnL.
 */

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function normalizeSpotExecutionReport(raw) {
  if (!raw || raw.e !== 'executionReport' || raw.x !== 'TRADE') return null;

  return {
    source_type: 'BINANCE_WS',
    exchange: 'BINANCE',
    external_id: String(raw.t),
    account_ref: 'BINANCE:SPOT',
    event_type: 'FILL',
    event_at: new Date(Number(raw.T)).toISOString(),
    instrument: {
      exchange: 'BINANCE',
      marketType: 'SPOT',
      symbol: String(raw.s),
      baseAsset: null,
      quoteAsset: null,
    },
    direction: raw.S === 'BUY' ? 'Compra' : raw.S === 'SELL' ? 'Venta' : null,
    price: num(raw.L),
    quantity: num(raw.l),
    commission: num(raw.n),
    amount: null,
    metadata: {
      orderId: raw.i ?? null,
      tradeId: raw.t ?? null,
      commissionAsset: raw.N ?? null,
      isMaker: raw.m ?? null,
      executionType: raw.x ?? null,
      orderStatus: raw.X ?? null,
      raw,
    },
  };
}

export function normalizeFuturesOrderTradeUpdate(raw) {
  if (!raw || raw.e !== 'ORDER_TRADE_UPDATE') return null;
  const o = raw.o;
  if (!o || o.x !== 'TRADE') return null;

  return {
    source_type: 'BINANCE_WS',
    exchange: 'BINANCE',
    external_id: String(o.t),
    account_ref: 'BINANCE:FUTURES',
    event_type: 'FILL',
    event_at: new Date(Number(o.T)).toISOString(),
    instrument: {
      exchange: 'BINANCE',
      marketType: 'FUTURES',
      symbol: String(o.s),
      baseAsset: null,
      quoteAsset: null,
    },
    direction: o.S === 'BUY' ? 'Compra' : o.S === 'SELL' ? 'Venta' : null,
    price: num(o.L),
    quantity: num(o.l),
    commission: num(o.n),
    amount: null,
    metadata: {
      orderId: o.i ?? null,
      tradeId: o.t ?? null,
      realizedPnl: num(o.rp),
      commissionAsset: o.N ?? null,
      positionSide: o.ps ?? null,
      isMaker: o.m ?? null,
      reduceOnly: o.R ?? null,
      executionType: o.x ?? null,
      orderStatus: o.X ?? null,
      raw,
    },
  };
}

export function normalizeBinanceUserEvent(raw) {
  if (raw?.e === 'executionReport') return normalizeSpotExecutionReport(raw);
  if (raw?.e === 'ORDER_TRADE_UPDATE') return normalizeFuturesOrderTradeUpdate(raw);
  return null;
}
