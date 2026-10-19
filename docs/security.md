# Information security program

Written program required by the Mercado Pago developer terms (clauses 6.6 and 10) for the app "Mis finanzas".
Model: ADR 0003 (local-first; the author keeps no user data).

## What is processed, where

| Data | Where it lives | Who can read it |
|---|---|---|
| Mercado Pago permission (access + refresh token) | The user's browser, AES-GCM encrypted with a non-extractable key | That browser; Mercado Pago |
| Movements, balances, notes, names, personal rules | The user's browser (IndexedDB, one Profile per account) | That browser |
| Sign-in code, renewals, report calls | Pass through the Relay (Cloudflare Worker) in memory only | Nobody: not stored, not logged |
| App credentials (client id/secret) | Cloudflare Worker secrets | The author's Cloudflare account |

## Controls

- No database, no Cron, Worker observability/logs disabled (`wrangler.toml`). The Relay forwards only the
  allowlisted "Dinero disponible" report calls and refuses requests from other sites.
- The permission is used only to read movements and request balance reports; no payment, refund or order endpoint is
  ever called (`web/lib/sync.js` is the only Mercado Pago client).
- No card data, emails, document numbers, phones or account numbers are stored; transfer recipients are HMAC keys
  with a per-Profile salt.
- No third-party scripts other than Google Fonts; no analytics or telemetry.
- Secrets only in Cloudflare (`wrangler secret put`); never in code or the repository. Access to the Cloudflare,
  GitHub and Mercado Pago developer accounts is protected with 2-factor authentication by the author.
- Tests use invented data; real data is never rendered or printed to inspect it.
- Users can export, restore and erase their data in the app (Ajustes → Tus datos), and revoke the app's access from
  their Mercado Pago account.

## Incidents

If the client secret, a Worker or an account is suspected compromised: rotate the client secret in Mercado Pago
Developers and `wrangler secret put` the new one; review the Worker's deployed code; notify Mercado Pago through the
developer support channel within the term their developer terms set; publish a notice in the app. Because no user
data is held centrally, there is no central data set to leak. Whether rotating the secret invalidates existing
permissions is undocumented: also ask Mercado Pago support to revoke them if needed.

## Review

Reviewed whenever the Relay or the data model changes, and at least once a year.
