import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "jsr:@supabase/server@^1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-worker-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface BootstrapRequest {
  purpose?: string;
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

async function loadCredentials(
  supabaseAdmin: any,
  userId: string,
) {
  const { data, error } = await supabaseAdmin.rpc(
    "get_binance_credentials_for_user",
    {
      p_user_id: userId,
    },
  );

  if (error) {
    throw new Error(`CREDENTIALS_LOAD_FAILED: ${error.message}`);
  }

  if (!data?.apiKey || !data?.apiSecret) {
    throw new Error("BINANCE_CREDENTIALS_NOT_CONFIGURED");
  }

  return {
    apiKey: String(data.apiKey),
    apiSecret: String(data.apiSecret),
  };
}

async function hmacSha256(
  secret: string,
  message: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(message),
  );

  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function handle(req: Request, ctx: any) {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      status: 204,
      headers: corsHeaders,
    });
  }

  if (req.method !== "POST") {
    return json(
      {
        ok: false,
        error: "METHOD_NOT_ALLOWED",
      },
      405,
    );
  }

  const expectedToken = Deno.env.get(
    "BINANCE_WS_BOOTSTRAP_TOKEN",
  );

  const receivedToken = req.headers.get(
    "x-worker-token",
  );

  if (
    !expectedToken ||
    !receivedToken ||
    receivedToken !== expectedToken
  ) {
    return json(
      {
        ok: false,
        error: "WORKER_UNAUTHORIZED",
      },
      401,
    );
  }

  let body: BootstrapRequest = {};

  try {
    body = await req.json();
  } catch {
    return json(
      {
        ok: false,
        error: "INVALID_JSON",
      },
      400,
    );
  }

  if (body.purpose !== "BINANCE_USER_DATA_STREAM") {
    return json(
      {
        ok: false,
        error: "INVALID_PURPOSE",
      },
      400,
    );
  }

  const userId = Deno.env.get(
    "BINANCE_WORKER_USER_ID",
  );

  if (!userId) {
    return json(
      {
        ok: false,
        error: "BINANCE_WORKER_USER_ID_NOT_CONFIGURED",
      },
      500,
    );
  }

  try {
    const credentials = await loadCredentials(
      ctx.supabaseAdmin,
      userId,
    );

    const timestamp = Date.now();
    const recvWindow = 5000;

    const signaturePayload =
      `apiKey=${encodeURIComponent(credentials.apiKey)}` +
      `&recvWindow=${recvWindow}` +
      `&timestamp=${timestamp}`;

    const signature = await hmacSha256(
      credentials.apiSecret,
      signaturePayload,
    );

    return json({
      ok: true,
      apiKey: credentials.apiKey,
      timestamp,
      recvWindow,
      spot: {
        signature,
      },
    });
  } catch (error) {
    console.error(
      "[BINANCE_WS_BOOTSTRAP]",
      error instanceof Error
        ? error.message
        : error,
    );

    return json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "BOOTSTRAP_FAILED",
      },
      500,
    );
  }
}

Deno.serve(
  withSupabase(
    { auth: "none" },
    (req, ctx) => handle(req, ctx),
  ),
);
