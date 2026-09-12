/*
 * Trading Master — Binance Private Read-Only Bridge
 * FASE 4.3.5C — AUTH + SERVER-SIDE CREDENTIALS
 *
 * Security contract:
 * - User authentication is handled by Supabase Auth / @supabase/server.
 * - Binance credentials NEVER arrive in the browser request body.
 * - Credentials are stored encrypted in Supabase Vault and retrieved only
 *   for the authenticated user's own Vault secret.
 * - Only a fixed allow-list of Binance GET USER_DATA endpoints is callable.
 * - No user-provided host, URL, HTTP method, or Binance path is accepted.
 * - No trading, withdrawals, transfers, margin, or order mutations exist.
 */

import { createSupabaseContext } from 'npm:@supabase/server';

const BINANCE_SPOT_BASE = 'https://api.binance.com';
const BINANCE_FUTURES_BASE = 'https://fapi.binance.com';
const RECV_WINDOW = 5000;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}

function normalizeSafeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const allowed = new Set([
    'AUTH_REQUIRED',
    'BINANCE_CREDENTIALS_NOT_CONFIGURED',
    'BINANCE_CREDENTIALS_INVALID',
    'BINANCE_PERMISSION_DENIED',
    'BINANCE_READONLY_REQUIRED',
    'ACTION_NOT_ALLOWED',
    'REQUEST_INVALID',
    'PARAMETER_INVALID',
    'SYMBOL_REQUIRED',
  ]);
  return allowed.has(message) ? message : 'BINANCE_PRIVATE_REQUEST_FAILED';
}

async function hmacSha256Hex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(signature)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function sortedQuery(params: Record<string, string | number | undefined>): string {
  return Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&');
}

async function signedGet(baseUrl: string, path: string, apiKey: string, apiSecret: string,
  params: Record<string, string | number | undefined> = {}) {
  const query = sortedQuery({ ...params, recvWindow: RECV_WINDOW, timestamp: Date.now() });
  const signature = await hmacSha256Hex(apiSecret, query);
  const response = await fetch(`${baseUrl}${path}?${query}&signature=${signature}`, {
    method: 'GET',
    headers: { 'X-MBX-APIKEY': apiKey },
  });
  const text = await response.text();
  let body: unknown;
  try { body = JSON.parse(text); } catch { body = { raw: text }; }
  return response.ok ? { ok: true, status: response.status, body } : { ok: false, status: response.status, body };
}

function validateReadOnlyPermissions(permission: any) {
  if (!permission || typeof permission !== 'object') {
    return { valid: false, readOnly: false, reason: 'BINANCE_PERMISSION_RESPONSE_INVALID' };
  }
  const forbidden = [
    ['enableWithdrawals', permission.enableWithdrawals],
    ['enableInternalTransfer', permission.enableInternalTransfer],
    ['permitsUniversalTransfer', permission.permitsUniversalTransfer],
    ['enableSpotAndMarginTrading', permission.enableSpotAndMarginTrading],
    ['enableMargin', permission.enableMargin],
    ['enableFutures', permission.enableFutures],
    ['enableVanillaOptions', permission.enableVanillaOptions],
    ['enablePortfolioMarginTrading', permission.enablePortfolioMarginTrading],
    ['enableFixApiTrade', permission.enableFixApiTrade],
  ];
  const enabledForbidden = forbidden.filter(([, enabled]) => enabled === true).map(([name]) => name);
  const readOnly = permission.enableReading === true && enabledForbidden.length === 0;
  return {
    valid: readOnly,
    readOnly,
    enabledForbidden,
    permission: {
      enableReading: permission.enableReading === true,
      enableWithdrawals: permission.enableWithdrawals === true,
      enableInternalTransfer: permission.enableInternalTransfer === true,
      permitsUniversalTransfer: permission.permitsUniversalTransfer === true,
      enableSpotAndMarginTrading: permission.enableSpotAndMarginTrading === true,
      enableMargin: permission.enableMargin === true,
      enableFutures: permission.enableFutures === true,
      enableVanillaOptions: permission.enableVanillaOptions === true,
      enablePortfolioMarginTrading: permission.enablePortfolioMarginTrading === true,
      enableFixApiTrade: permission.enableFixApiTrade === true,
      ipRestrict: permission.ipRestrict === true,
      enableFixReadOnly: permission.enableFixReadOnly === true,
    },
  };
}

function positiveIntegerOrUndefined(value: unknown) {
  if (value === undefined || value === null || value === '') return undefined;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) throw new Error('PARAMETER_INVALID');
  return n;
}

function normalizeSymbol(value: unknown) {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') throw new Error('PARAMETER_INVALID');
  const symbol = value.trim().toUpperCase();
  if (!/^[A-Z0-9._-]{1,30}$/.test(symbol)) throw new Error('PARAMETER_INVALID');
  return symbol;
}

function buildFillsParams(params: any, requireSymbol = true) {
  const symbol = normalizeSymbol(params?.symbol);
  if (requireSymbol && !symbol) throw new Error('SYMBOL_REQUIRED');
  const startTime = positiveIntegerOrUndefined(params?.startTime);
  const endTime = positiveIntegerOrUndefined(params?.endTime);
  const fromId = positiveIntegerOrUndefined(params?.fromId);
  const limit = params?.limit === undefined || params?.limit === null || params?.limit === ''
    ? undefined : positiveIntegerOrUndefined(params.limit);
  if (limit !== undefined && (limit < 1 || limit > 1000)) throw new Error('PARAMETER_INVALID');
  if (startTime !== undefined && endTime !== undefined && startTime > endTime) throw new Error('PARAMETER_INVALID');
  return { symbol, startTime, endTime, fromId, limit };
}

async function loadBinanceCredentials(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc('get_my_binance_credentials');
  if (error) {
    console.error('binance-private credentials lookup failed:', error.message);
    throw new Error('BINANCE_CREDENTIALS_NOT_CONFIGURED');
  }
  if (!data || typeof data !== 'object') throw new Error('BINANCE_CREDENTIALS_NOT_CONFIGURED');
  const apiKey = typeof data.apiKey === 'string' ? data.apiKey.trim() : '';
  const apiSecret = typeof data.apiSecret === 'string' ? data.apiSecret.trim() : '';
  if (!apiKey || !apiSecret || apiKey.length > 256 || apiSecret.length > 256) {
    throw new Error('BINANCE_CREDENTIALS_INVALID');
  }
  // userId is intentionally only used to bind the request context; the RPC derives
  // the Vault secret name from auth.uid() and never accepts a caller-supplied name.
  void userId;
  return { apiKey, apiSecret };
}

async function handle(req: Request, ctx: any) {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405);

  if (!ctx?.userClaims?.sub) return json({ ok: false, error: 'AUTH_REQUIRED' }, 401);

  let payload: any;
  try { payload = await req.json(); } catch { return json({ ok: false, error: 'REQUEST_INVALID' }, 400); }

  const action = payload?.action;
  const allowedActions = new Set(['validate', 'spotFills', 'futuresFills', 'spotOrders', 'futuresOrders', 'spotBalances', 'futuresBalances', 'futuresPositions']);
  if (!allowedActions.has(action)) throw new Error('ACTION_NOT_ALLOWED');

  const { apiKey, apiSecret } = await loadBinanceCredentials(ctx.supabase, ctx.userClaims.sub);

  const permissionResult = await signedGet(BINANCE_SPOT_BASE, '/sapi/v1/account/apiRestrictions', apiKey, apiSecret);
  if (!permissionResult.ok) return json({ ok: false, error: 'BINANCE_PERMISSION_DENIED', binance: permissionResult.body }, 400);
  const permissionCheck = validateReadOnlyPermissions(permissionResult.body);
  if (!permissionCheck.readOnly) return json({ ok: false, error: 'BINANCE_READONLY_REQUIRED', permission: permissionCheck }, 403);

  if (action === 'validate') {
    return json({ ok: true, action: 'validate', readOnly: true, accountRef: 'BINANCE:SPOT', userId: ctx.userClaims.sub, permission: permissionCheck.permission });
  }

  const p = payload?.params ?? {};
  let requestParams: Record<string, string | number | undefined> = {};
  let base = BINANCE_SPOT_BASE;
  let path = '';
  let accountRef = 'BINANCE:SPOT';

  switch (action) {
    case 'spotFills': path = '/api/v3/myTrades'; requestParams = buildFillsParams(p, true); break;
    case 'futuresFills': base = BINANCE_FUTURES_BASE; path = '/fapi/v1/userTrades'; requestParams = buildFillsParams(p, true); accountRef = 'BINANCE:FUTURES'; break;
    case 'spotOrders': path = '/api/v3/allOrders'; requestParams = buildFillsParams(p, true); break;
    case 'futuresOrders': base = BINANCE_FUTURES_BASE; path = '/fapi/v1/allOrders'; requestParams = buildFillsParams(p, true); accountRef = 'BINANCE:FUTURES'; break;
    case 'spotBalances': path = '/api/v3/account'; break;
    case 'futuresBalances': base = BINANCE_FUTURES_BASE; path = '/fapi/v3/balance'; accountRef = 'BINANCE:FUTURES'; break;
    case 'futuresPositions': base = BINANCE_FUTURES_BASE; path = '/fapi/v3/positionRisk'; requestParams = { symbol: normalizeSymbol(p?.symbol) }; accountRef = 'BINANCE:FUTURES'; break;
    default: throw new Error('ACTION_NOT_ALLOWED');
  }

  const result = await signedGet(base, path, apiKey, apiSecret, requestParams);
  if (!result.ok) return json({ ok: false, error: 'BINANCE_PRIVATE_REQUEST_FAILED', status: result.status, binance: result.body }, 400);
  return json({ ok: true, action, sourceType: 'EXTERNAL', exchange: 'BINANCE', accountRef, data: result.body });
}

export default {
  fetch: async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
    const { data: ctx, error } = await createSupabaseContext(req, { auth: 'user' });
    if (error) return json({ ok: false, error: 'AUTH_REQUIRED' }, 401);
    try {
      return await handle(req, ctx);
    } catch (error) {
      console.error('binance-private error:', normalizeSafeError(error));
      return json({ ok: false, error: normalizeSafeError(error) }, 400);
    }
  },
};
