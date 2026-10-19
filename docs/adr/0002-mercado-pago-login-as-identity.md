---
status: superseded by 0003
---

# Mercado Pago login is the Owner's identity

Owners sign in with "Entrar con Mercado Pago" through their own Mercado Pago developer app (OAuth authorization
code + PKCE, exchanged server-side). The Deployment accepts only the Mercado Pago account that owns that app, so
no setup code, password or passkey is needed, account recovery is Mercado Pago's own, and the same flow obtains
and renews (every 180 days) the token used to read movements, so Owners never paste a token.

Verified 2026-10-18 with the throwaway prototype (branch `prototype/cf-worker`): the app owner can authorize their
own app, the OAuth token reads payments search and the Releases report, and a `*.workers.dev` redirect URL is
accepted. The fallback (passkey + recovery code + setup code + pasted token) is not needed.

## Consequences

- The OAuth token arrives with write scopes (payments, refunds, orders); the app must only ever read with it.
  Unticking "write" in the app's Permisos (tested 2026-10-18) only drops the generic `write` scope; every
  `urn:mp:...` scope stays read-write, so the token can't be narrowed. "write" stays ticked, since report creation
  may need it. Protection = the token never leaves the Owner's Worker and the code only reads.
