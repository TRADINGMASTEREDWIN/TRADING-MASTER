import WebSocket from 'ws';
import crypto from 'node:crypto';
import { normalizeBinanceUserEvent } from './wsNormalizer.js';

const SUPABASE_URL = requiredEnv('SUPABASE_URL');
const BOOTSTRAP_TOKEN = requiredEnv('BINANCE_WS_BOOTSTRAP_TOKEN');
const BOOTSTRAP_URL = `${SUPABASE_URL.replace(/\/$/, '')}/functions/v1/binance-ws-bootstrap`;

const SPOT_WS_URL = 'wss://ws-api.binance.com:443/ws-api/v3';
const FUTURES_WS_API_URL = 'wss://ws-fapi.binance.com/ws-fapi/v1';
const FUTURES_STREAM_URL = 'wss://fstream.binance.com/ws';

let stopping = false;
let spotSocket = null;
let futuresSocket = null;
let futuresListenKey = null;

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

function id() {
  return crypto.randomUUID();
}

async function bootstrap() {
  const response = await fetch(BOOTSTRAP_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-worker-token': BOOTSTRAP_TOKEN,
    },
    body: JSON.stringify({ purpose: 'BINANCE_USER_DATA_STREAM' }),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.ok) {
    throw new Error(`BOOTSTRAP_FAILED:${data?.error || response.status}`);
  }
  return data;
}

function send(socket, payload) {
  socket.send(JSON.stringify(payload));
}

async function connectSpot() {
  const socket = new WebSocket(SPOT_WS_URL);
  spotSocket = socket;

  socket.on('open', async () => {
    console.log('[BINANCE][SPOT] connected');
    const auth = await bootstrap();
    send(socket, {
      id: id(),
      method: 'userDataStream.subscribe.signature',
      params: {
        apiKey: auth.apiKey,
        timestamp: auth.timestamp,
        recvWindow: auth.recvWindow,
        signature: auth.spot.signature,
      },
    });
  });

  socket.on('message', (buffer) => {
    try {
      const message = JSON.parse(buffer.toString());
      if (message?.status && message.status !== 200) {
        console.error('[BINANCE][SPOT] subscription error', JSON.stringify(message));
        return;
      }
      const event = message?.data || message;
      const canonical = normalizeBinanceUserEvent(event);
      if (canonical) {
        console.log('[BINANCE][FILL]', JSON.stringify(canonical));
      }
    } catch (error) {
      console.error('[BINANCE][SPOT] message parse error', error.message);
    }
  });

  socket.on('error', (error) => console.error('[BINANCE][SPOT] socket error', error.message));
  socket.on('close', () => {
    console.warn('[BINANCE][SPOT] disconnected');
    if (!stopping) setTimeout(connectSpot, 3000);
  });
}

async function requestOnSocket(socket, payload, expectedField) {
  return await new Promise((resolve, reject) => {
    const requestId = payload.id;
    const timer = setTimeout(() => {
      socket.off('message', onMessage);
      reject(new Error(`BINANCE_WS_REQUEST_TIMEOUT:${payload.method}`));
    }, 10000);

    const onMessage = (buffer) => {
      try {
        const message = JSON.parse(buffer.toString());
        if (message?.id !== requestId) return;
        clearTimeout(timer);
        socket.off('message', onMessage);
        if (message?.status !== 200) {
          reject(new Error(`BINANCE_WS_REQUEST_FAILED:${payload.method}`));
          return;
        }
        const value = expectedField
          ? message?.result?.[expectedField]
          : message?.result;
        if (expectedField && !value) {
          reject(new Error(`BINANCE_WS_RESPONSE_INVALID:${payload.method}`));
          return;
        }
        resolve(value);
      } catch {}
    };

    socket.on('message', onMessage);
    send(socket, payload);
  });
}

async function connectFutures() {
  let controlSocket = null;
  let dataSocket = null;
  let keepaliveTimer = null;

  try {
    const auth = await bootstrap();
    controlSocket = new WebSocket(FUTURES_WS_API_URL);
    futuresSocket = controlSocket;

    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('FUTURES_CONTROL_CONNECT_TIMEOUT')), 10000);
      controlSocket.once('open', () => { clearTimeout(timer); resolve(); });
      controlSocket.once('error', (error) => { clearTimeout(timer); reject(error); });
    });

    const listenKey = await requestOnSocket(
      controlSocket,
      {
        id: id(),
        method: 'userDataStream.start',
        params: { apiKey: auth.apiKey },
      },
      'listenKey',
    );

    futuresListenKey = listenKey;
    dataSocket = new WebSocket(`${FUTURES_STREAM_URL}/${listenKey}`);
    futuresSocket = dataSocket;

    dataSocket.on('open', () => console.log('[BINANCE][FUTURES] connected'));
    dataSocket.on('message', (buffer) => {
      try {
        const event = JSON.parse(buffer.toString());
        if (event?.e === 'listenKeyExpired') {
          console.warn('[BINANCE][FUTURES] listenKey expired');
          try { dataSocket.close(); } catch {}
          return;
        }
        const canonical = normalizeBinanceUserEvent(event);
        if (canonical) console.log('[BINANCE][FILL]', JSON.stringify(canonical));
      } catch (error) {
        console.error('[BINANCE][FUTURES] message parse error', error.message);
      }
    });

    const restart = () => {
      if (stopping) return;
      if (keepaliveTimer) clearInterval(keepaliveTimer);
      try { dataSocket?.close(); } catch {}
      try { controlSocket?.close(); } catch {}
      futuresListenKey = null;
      setTimeout(connectFutures, 3000);
    };

    dataSocket.on('error', (error) => console.error('[BINANCE][FUTURES] data socket error', error.message));
    dataSocket.on('close', () => {
      console.warn('[BINANCE][FUTURES] data stream disconnected');
      restart();
    });

    controlSocket.on('error', (error) => {
      console.error('[BINANCE][FUTURES] control socket error', error.message);
      restart();
    });
    controlSocket.on('close', () => {
      if (!stopping) {
        console.warn('[BINANCE][FUTURES] control socket disconnected');
        restart();
      }
    });

    // Binance requires the USDⓈ-M user data stream to be kept alive.
    keepaliveTimer = setInterval(async () => {
      try {
        await requestOnSocket(
          controlSocket,
          {
            id: id(),
            method: 'userDataStream.ping',
            params: { apiKey: auth.apiKey },
          },
          null,
        );
      } catch (error) {
        console.error('[BINANCE][FUTURES] keepalive failed', error.message);
        restart();
      }
    }, 50 * 60 * 1000);
  } catch (error) {
    console.error('[BINANCE][FUTURES] connection failed', error.message);
    try { dataSocket?.close(); } catch {}
    try { controlSocket?.close(); } catch {}
    futuresSocket = null;
    futuresListenKey = null;
    if (!stopping) setTimeout(connectFutures, 5000);
  }
}

async function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  console.log(`[WORKER] stopping (${signal})`);
  try { spotSocket?.close(); } catch {}
  try { futuresSocket?.close(); } catch {}
  setTimeout(() => process.exit(0), 500);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

console.log('[WORKER] Trading Master Binance receiver starting');
await Promise.all([connectSpot(), connectFutures()]);
