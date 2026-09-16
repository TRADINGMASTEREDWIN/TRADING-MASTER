# Trading Master — Security Contract

## Binance integration
- The Binance integration is READ-ONLY.
- Binance API secrets must never be stored in this repository.
- Binance credentials are retrieved server-side from Supabase Vault.
- The browser must never receive `apiSecret`.
- Do not put credentials in URLs, localStorage, source code, logs, screenshots, issues, or commits.
- Only the fixed allow-list implemented by `binance-private` may call Binance private endpoints.
- No trading, withdrawals, transfers, margin mutations, or order mutations are exposed.

## Supabase
- The `binance-private` Edge Function requires an authenticated JWT.
- Secrets remain in Supabase Vault and are not part of GitHub.
- Changes to the Edge Function should be deployed from the GitHub source of truth.

## Before every commit
Check for:
- API keys
- API secrets
- access tokens
- service-role keys
- private keys
- `.env` files
- credentials or secret JSON files
