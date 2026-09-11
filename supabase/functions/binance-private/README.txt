TRADING MASTER — FASE 4.3.5B
BINANCE SECURE READ-ONLY BRIDGE

NUEVOS ARCHIVOS
- binancePrivateBridge.js
- supabase/functions/binance-private/index.ts

IMPORTANTE
- Esta fase NO guarda API Key ni Secret Key.
- Las credenciales viajan únicamente en memoria durante una petición autenticada.
- No se escriben en Supabase, localStorage, URLs ni logs.
- Solo se permiten endpoints GET de lectura de Binance.
- La función verifica primero /sapi/v1/account/apiRestrictions y rechaza claves con permisos de trading, retiros, transferencias, margin, futures, options o portfolio margin.
- No se habilita ninguna operación de trading.

INTEGRACIÓN
- El frontend debe cargar binancePrivateBridge.js después de supabase.js.
- La Edge Function debe desplegarse como `binance-private`.
- NO introducir API keys reales en archivos del repositorio.
- Esta fase no implementa persistencia de credenciales ni sincronización automática.
