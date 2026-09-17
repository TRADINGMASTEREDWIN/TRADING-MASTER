/*
 * Trading Master — Binance WebSocket Bootstrap
 * FASE WS-1
 *
 * Purpose:
 * - Authenticate a dedicated persistent worker.
 * - Read the Binance credentials from Supabase Vault server-side.
 * - Return only the Binance API key plus short-lived WebSocket auth data.
 *
 * The Binance API Secret is NEVER returned to the worker.
 */
import { withSupabase } from 'npm:@supabase/server@^1';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, x-worker-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}

async function hmacSha256Hex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(payload),
  );
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function sortedQuery(params: Record<string, string | number>) {
  return Object.entries(params)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&');
}

async function loadCredentials(supabaseAdmin: any, userId: string) {
  const { data, error } = await supabaseAdmin.rpc(
    'get_binance_credentials_for_user',
    { p_user_id: userId },
  );
  if (error || !data) throw new Error('BINANCE_CREDENTIALS_NOT_CONFIGURED');

  const apiKey = typeof data.apiKey === 'string' ? data.apiKey.trim() : '';
  const apiSecret = typeof data.apiSecret === 'string' ? data.apiSecret.trim() : '';
  if (!apiKey || !apiSecret) throw new Error('BINANCE_CREDENTIALS_INVALID');

  return { apiKey, apiSecret };
}

async function handle(req: Request, ctx: any) {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405);

  const expectedToken = Deno.env.get('BINANCE_WS_BOOTSTRAP_TOKEN')?.trim();
  const suppliedToken = req.headers.get('x-worker-token')?.trim();
  if (!expectedToken || !suppliedToken || suppliedToken !== expectedToken) {
    return json({ ok: false, error: 'WORKER_UNAUTHORIZED' }, 401);
  }

  const userId = Deno.env.get('BINANCE_WORKER_USER_ID')?.trim();
  if (!userId) return json({ ok: false, error: 'WORKER_USER_NOT_CONFIGURED' }, 500);

  try {
    const { apiKey, apiSecret } = await loadCredentials(ctx.supabaseAdmin, userId);
    const timestamp = Date.now();
    const recvWindow = 5000;
    const query = sortedQuery({ apiKey, recvWindow, timestamp });
    const signature = await hmacSha256Hex(apiSecret, query);

    return json({
      ok: true,
      apiKey,
      timestamp,
      recvWindow,
      spot: { signature },
    });
  } catch (error) {
    console.error('binance-ws-bootstrap failed:', error);
    return json({ ok: false, error: 'BINANCE_WS_BOOTSTRAP_FAILED' }, 500);
  }
}

Deno.serve((req) => withSupabase({ auth: 'none' }, (ctx) => handle(req, ctx)));
