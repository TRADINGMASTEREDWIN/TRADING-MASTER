/*
 * Trading Master — Binance Private Read-Only Bridge
 * FASE 4.3.5B
 *
 * SECURITY CONTRACT:
 * - READ-ONLY only.
 * - API credentials are accepted only in-memory for the duration of one request.
 * - Credentials are NEVER written to Supabase, logs, localStorage, or responses.
 * - Only an explicit allow-list of Binance GET endpoints is callable.
 * - No POST/PUT/DELETE/PATCH endpoint can be selected through this function.
 */

import { createClient } from 'npm:@supabase/supabase-js@2';

const BINANCE_SPOT_BASE = 'https://api.binance.com';
const BINANCE_FUTURES_BASE = 'https://fapi.binance.com';
const RECV_WINDOW = 5000;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: corsHeaders });
}

function cleanSecret(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function assertCredentials(apiKey: string, apiSecret: string) {
  if (!apiKey || !apiSecret) throw new Error('BINANCE_CREDENTIALS_REQUIRED');
  if (apiKey.length > 256 || apiSecret.length > 256) throw new Error('BINANCE_CREDENTIALS_INVALID');
}

async function hmacSha256Hex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function sortedQuery(params: Record<string, string | number | undefined>): string {
  return Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&');
}

async function signedGet(
  baseUrl: string,
  path: string,
  apiKey: string,
  apiSecret: string,
  params: Record<string, string | number | undefined> = {},
) {
  const query = sortedQuery({
    ...params,
    recvWindow: RECV_WINDOW,
    timestamp: Date.now(),
  });
  const signature = await hmacSha256Hex(apiSecret, query);
  const response = await fetch(`${baseUrl}${path}?${query}&signature=${signature}`, {
    method: 'GET',
    headers: { 'X-MBX-APIKEY': apiKey },
  });

  const text = await response.text();
  let body: unknown;
  try { body = JSON.parse(text); } catch { body = { raw: text }; }

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      body,
    };
  }

  return { ok: true, status: response.status, body };
}

function validateNoTrading(permission: any) {
  if (!permission || typeof permission !== 'object') {
    return { valid: false, reason: 'BINANCE_PERMISSION_RESPONSE_INVALID' };
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
  ];

  const enabledForbidden = forbidden.filter(([, enabled]) => enabled === true).map(([name]) => name);

  return {
    valid: permission.enableReading === true && enabledForbidden.length === 0,
    readOnly: permission.enableReading === true && enabledForbidden.length === 0,
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
      ipRestrict: permission.ipRestrict === true,
      enableFixReadOnly: permission.enableFixReadOnly === true,
    },
  };
}

function normalizeSafeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const allowed = new Set([
    'BINANCE_CREDENTIALS_REQUIRED',
    'BINANCE_CREDENTIALS_INVALID',
    'BINANCE_PERMISSION_DENIED',
    'BINANCE_READONLY_REQUIRED',
    'ACTION_NOT_ALLOWED',
    'REQUEST_INVALID',
  ]);
  return allowed.has(message) ? message : 'BINANCE_PRIVATE_REQUEST_FAILED';
}

async function getAuthenticatedUser(req: Request) {
  const authorization = req.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return null;

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const publishableKeysRaw = Deno.env.get('SUPABASE_PUBLISHABLE_KEYS');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const publishableKey = publishableKeysRaw
    ? JSON.parse(publishableKeysRaw).default
    : anonKey;

  if (!supabaseUrl || !publishableKey) return null;

  const client = createClient(supabaseUrl, publishableKey, {
    global: { headers: { Authorization: authorization } },
  });
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
}

async function handle(req: Request) {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405);

  const user = await getAuthenticatedUser(req);
  if (!user) return json({ ok: false, error: 'AUTH_REQUIRED' }, 401);

  let payload: any;
  try { payload = await req.json(); } catch { return json({ ok: false, error: 'REQUEST_INVALID' }, 400); }

  const action = payload?.action;
  const apiKey = cleanSecret(payload?.apiKey);
  const apiSecret = cleanSecret(payload?.apiSecret);
  assertCredentials(apiKey, apiSecret);

  // Only these read operations are allowed in this phase.
  const allowedActions = new Set(['validate', 'spotFills', 'futuresFills', 'spotOrders', 'futuresOrders', 'spotBalances', 'futuresBalances', 'futuresPositions']);
  if (!allowedActions.has(action)) throw new Error('ACTION_NOT_ALLOWED');

  // First gate every operation through Binance's API-key permission endpoint.
  const permissionResult = await signedGet(
    BINANCE_SPOT_BASE,
    '/sapi/v1/account/apiRestrictions',
    apiKey,
    apiSecret,
  );

  if (!permissionResult.ok) {
    return json({ ok: false, error: 'BINANCE_PERMISSION_DENIED', binance: permissionResult.body }, 400);
  }

  const permissionCheck = validateNoTrading(permissionResult.body);
  if (!permissionCheck.readOnly) {
    return json({ ok: false, error: 'BINANCE_READONLY_REQUIRED', permission: permissionCheck }, 403);
  }

  if (action === 'validate') {
    return json({
      ok: true,
      action: 'validate',
      readOnly: true,
      accountRef: `BINANCE:${payload?.accountType === 'FUTURES' ? 'FUTURES' : 'SPOT'}`,
      userId: user.id,
      permission: permissionCheck.permission,
    });
  }

  const p = payload?.params ?? {};
  const common = {
    symbol: typeof p.symbol === 'string' ? p.symbol.toUpperCase() : undefined,
    startTime: Number.isFinite(Number(p.startTime)) ? Number(p.startTime) : undefined,
    endTime: Number.isFinite(Number(p.endTime)) ? Number(p.endTime) : undefined,
    fromId: Number.isFinite(Number(p.fromId)) ? Number(p.fromId) : undefined,
    limit: Number.isFinite(Number(p.limit)) ? Math.min(Math.max(Number(p.limit), 1), 1000) : undefined,
  };

  const map: Record<string, { base: string; path: string }> = {
    spotFills: { base: BINANCE_SPOT_BASE, path: '/api/v3/myTrades' },
    futuresFills: { base: BINANCE_FUTURES_BASE, path: '/fapi/v1/userTrades' },
    spotOrders: { base: BINANCE_SPOT_BASE, path: '/api/v3/allOrders' },
    futuresOrders: { base: BINANCE_FUTURES_BASE, path: '/fapi/v1/allOrders' },
    spotBalances: { base: BINANCE_SPOT_BASE, path: '/api/v3/account' },
    futuresBalances: { base: BINANCE_FUTURES_BASE, path: '/fapi/v3/balance' },
    futuresPositions: { base: BINANCE_FUTURES_BASE, path: '/fapi/v3/positionRisk' },
  };

  const target = map[action];
  const result = await signedGet(target.base, target.path, apiKey, apiSecret, common);

  if (!result.ok) {
    return json({ ok: false, error: 'BINANCE_PRIVATE_REQUEST_FAILED', status: result.status, binance: result.body }, 400);
  }

  // Deliberately return Binance data only; no credentials are ever echoed.
  return json({
    ok: true,
    action,
    sourceType: 'EXTERNAL',
    exchange: 'BINANCE',
    accountRef: `BINANCE:${action.startsWith('futures') ? 'FUTURES' : 'SPOT'}`,
    data: result.body,
  });
}

Deno.serve(async (req) => {
  try {
    return await handle(req);
  } catch (error) {
    console.error('binance-private error:', normalizeSafeError(error));
    return json({ ok: false, error: normalizeSafeError(error) }, 400);
  }
});
