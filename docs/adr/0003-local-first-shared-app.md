---
status: accepted
supersedes: 0001, 0002
---

# One shared app, data only on each user's device

Setting up a self-hosted copy (ADR 0001) takes at least ~10 minutes and four accounts, too much for "any new user".
A hosted multi-user service would take ~1 minute but make the author the custodian of everyone's tokens and
movements, which the owner refused (2026-10-19 grilling). So there is one app at one address, and everything a user
has — the Mercado Pago permission, movements, notes, names, rules — lives only in their own browser (IndexedDB).
The server is a stateless relay with logs off: it swaps the sign-in code for a token (it needs the app's client
secret), renews tokens, and forwards the "Dinero disponible" report calls, which Mercado Pago does not allow from
browsers. It stores nothing. Movements (`/v1/payments/search`) and Mercado Libre categories are read by the browser
directly (CORS checked 2026-10-19).

Sign-in is "Entrar con Mercado Pago" through the author's single Mercado Pago developer app (OAuth code + PKCE).
Verified 2026-10-19 with a throwaway pilot: another person's real account can authorize it, and its token shows the
payments that person made (purchases, transfers), not only what they collected, and reads the Releases report.

## Consequences

- Open to anyone, free for users and the author: a static page plus a light relay fit Cloudflare's free plan.
- The app updates its data only while open (3 months first, up to 13 while it stays open; the balance report at
  most once a day, and Mercado Pago e-mails the user each time it generates one).
- Each device is on its own; the backup file moves notes and rules. A monthly reminder offers a backup, and the app
  asks the browser for persistent storage.
- One profile per Mercado Pago account on a device; "Cerrar sesión" drops the permission and keeps the data. A
  signed-out profile is readable by someone with technical access to the device: there is no user secret to encrypt
  it with. An optional fingerprint/PIN lock (device passkey) guards opening the app.
- The token still carries write scopes (ADR 0002 finding stands); the app only reads, and the token never leaves the
  device except to Mercado Pago and, for renewal and reports, through the relay.
- Mercado Pago may throttle or suspend the author's app (developer terms 2.3, 15); every user depends on it.
- The author keeps no personal data, so a Ley 25.326 database registration very likely does not apply (reading,
  not legal advice). Users are told what happens to their data under the sign-in button, with a privacy page.
- New versions reach everyone automatically; there are no per-user Releases or Deploy button any more.
