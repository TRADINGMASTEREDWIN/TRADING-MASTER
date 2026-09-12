TRADING MASTER — FASE 4.3.5B CORREGIDA
PUENTE DE SOLO LECTURA SEGURO DE BINANCE

ESTRUCTURA
- js/binancePrivateBridge.js
- supabase/functions/binance-private/index.ts

CAMBIO PRINCIPAL
La validación de permisos no usa enableReading como única señal. La Edge Function rechaza también las capacidades que podrían modificar fondos, posiciones u órdenes, incluyendo trading Spot/Margin, Futures, Options, Portfolio Margin, retiros y transferencias.

SEGURIDAD
- No guarda API Key ni Secret Key.
- No escribe credenciales en Supabase, localStorage, URL ni DOM.
- Solo acepta una lista cerrada de acciones.
- Solo ejecuta GET contra endpoints privados de lectura de Binance.
- Nunca acepta URL, host, path o método arbitrario enviados por el cliente.
- No crea, modifica ni cancela órdenes.
- No realiza retiros, transferencias, préstamos ni cambios de configuración.

NO HACER TODAVÍA
- No introducir claves reales en GitHub.
- No guardar claves en Supabase.
- No desplegar ni probar con una clave que tenga permisos de trading.

FUENTE
La lista de permisos se contrasta con la respuesta de /sapi/v1/account/apiRestrictions de Binance.
