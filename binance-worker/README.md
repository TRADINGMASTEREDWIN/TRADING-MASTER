# Trading Master — Binance Persistent Receiver

FASE WS-1: receptor persistente de ejecuciones Binance.

## Objetivo

Recibir automáticamente ejecuciones reales (`TRADE`) de:

- Spot: `executionReport`
- USDⓈ-M Futures: `ORDER_TRADE_UPDATE`

y convertirlas a un candidato de Canonical Event.

**Todavía no escribe `trades` ni `trade_movements`.** Esa será la siguiente fase, después de validar que el receptor recibe eventos reales.

## Seguridad

- El worker nunca recibe el API Secret.
- El API Secret permanece en Supabase Vault.
- `binance-ws-bootstrap` recupera el secreto server-side y genera la autorización necesaria.
- El worker solo recibe el API Key y datos/firma temporales para abrir las suscripciones.
- El worker no tiene endpoints de trading.
- Para USDⓈ-M Futures mantiene vivo el `listenKey` mediante `userDataStream.ping`.

## Railway

Variables requeridas:

```text
SUPABASE_URL=https://TU_PROYECTO.supabase.co
BINANCE_WS_BOOTSTRAP_TOKEN=<token-largo-aleatorio>
```

Comando de inicio:

```text
npm start
```

## Prueba de esta fase

En los logs debe aparecer:

```text
[BINANCE][SPOT] connected
[BINANCE][FUTURES] connected
```

Cuando se ejecute una operación real en Binance:

```text
[BINANCE][FILL] {...}
```

No se debe introducir ningún dato manualmente en Trading Master para esta prueba.
