/* Trading Master — Binance Private Bridge — FASE 4.3.5C */
const BINANCE_PRIVATE_FUNCTION_NAME = 'binance-private';

function ensureSupabaseClient() {
  if (!window.supabaseClient) throw new Error('SUPABASE_CLIENT_UNAVAILABLE');
  return window.supabaseClient;
}

async function invocarBinancePrivate(payload) {
  const client = ensureSupabaseClient();
  const { data, error } = await client.functions.invoke(BINANCE_PRIVATE_FUNCTION_NAME, { body: payload });
  if (error) throw error;
  if (!data?.ok) {
    const err = new Error(data?.error || 'BINANCE_PRIVATE_REQUEST_FAILED');
    err.details = data;
    throw err;
  }
  return data;
}

function validarCredencialesBinanceReadOnly(accountType = 'SPOT') {
  return invocarBinancePrivate({ action: 'validate', accountType });
}

function obtenerFillsBinanceReadOnly({ marketType = 'SPOT', params = {} } = {}) {
  return invocarBinancePrivate({ action: marketType === 'FUTURES' ? 'futuresFills' : 'spotFills', params });
}

function obtenerOrdenesBinanceReadOnly({ marketType = 'SPOT', params = {} } = {}) {
  return invocarBinancePrivate({ action: marketType === 'FUTURES' ? 'futuresOrders' : 'spotOrders', params });
}

function obtenerBalancesBinanceReadOnly({ marketType = 'SPOT' } = {}) {
  return invocarBinancePrivate({ action: marketType === 'FUTURES' ? 'futuresBalances' : 'spotBalances' });
}

function obtenerPosicionesFuturesBinanceReadOnly({ params = {} } = {}) {
  return invocarBinancePrivate({ action: 'futuresPositions', params });
}

window.BinancePrivateBridge = Object.freeze({
  validarCredencialesBinanceReadOnly,
  obtenerFillsBinanceReadOnly,
  obtenerOrdenesBinanceReadOnly,
  obtenerBalancesBinanceReadOnly,
  obtenerPosicionesFuturesBinanceReadOnly,
});
