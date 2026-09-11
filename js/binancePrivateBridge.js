/* ============================================================
   Trading Master — Binance Private Bridge
   FASE 4.3.5B

   Frontend adapter for the Supabase Edge Function `binance-private`.
   IMPORTANT: credentials remain only in memory. This module never
   writes apiKey/apiSecret to localStorage, Supabase, URL params, or DOM.
   ============================================================ */

const BINANCE_PRIVATE_FUNCTION_NAME = 'binance-private';

function validarCredencialesBinanceReadOnly(apiKey, apiSecret, accountType = 'SPOT') {
  return invocarBinancePrivate({
    action: 'validate',
    apiKey,
    apiSecret,
    accountType,
  });
}

function obtenerFillsBinanceReadOnly({ apiKey, apiSecret, marketType = 'SPOT', params = {} }) {
  return invocarBinancePrivate({
    action: marketType === 'FUTURES' ? 'futuresFills' : 'spotFills',
    apiKey,
    apiSecret,
    params,
  });
}

function obtenerOrdenesBinanceReadOnly({ apiKey, apiSecret, marketType = 'SPOT', params = {} }) {
  return invocarBinancePrivate({
    action: marketType === 'FUTURES' ? 'futuresOrders' : 'spotOrders',
    apiKey,
    apiSecret,
    params,
  });
}

function obtenerBalancesBinanceReadOnly({ apiKey, apiSecret, marketType = 'SPOT' }) {
  return invocarBinancePrivate({
    action: marketType === 'FUTURES' ? 'futuresBalances' : 'spotBalances',
    apiKey,
    apiSecret,
  });
}

function obtenerPosicionesFuturesBinanceReadOnly({ apiKey, apiSecret, params = {} }) {
  return invocarBinancePrivate({
    action: 'futuresPositions',
    apiKey,
    apiSecret,
    params,
  });
}

async function invocarBinancePrivate(payload) {
  if (!supabaseClient) {
    throw new Error('SUPABASE_CLIENT_UNAVAILABLE');
  }

  const { data: sessionData, error: sessionError } = await supabaseClient.auth.getSession();
  if (sessionError || !sessionData?.session?.access_token) {
    throw new Error('AUTH_REQUIRED');
  }

  if (!payload?.apiKey || !payload?.apiSecret) {
    throw new Error('BINANCE_CREDENTIALS_REQUIRED');
  }

  const { data, error } = await supabaseClient.functions.invoke(
    BINANCE_PRIVATE_FUNCTION_NAME,
    {
      body: payload,
      headers: {
        Authorization: `Bearer ${sessionData.session.access_token}`,
      },
    }
  );

  if (error) {
    throw error;
  }

  if (!data?.ok) {
    const err = new Error(data?.error || 'BINANCE_PRIVATE_REQUEST_FAILED');
    err.details = data;
    throw err;
  }

  return data;
}

// Exponer API pública controlada sin contaminar otros módulos.
window.BinancePrivateBridge = Object.freeze({
  validarCredencialesBinanceReadOnly,
  obtenerFillsBinanceReadOnly,
  obtenerOrdenesBinanceReadOnly,
  obtenerBalancesBinanceReadOnly,
  obtenerPosicionesFuturesBinanceReadOnly,
});
