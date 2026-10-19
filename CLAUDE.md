# mis-finanzas

One shared, free web app (Argentina only) that reads a person's Mercado Pago movements and shows where their money
goes. Local-first (ADR 0003): each user's permission and data live only in their own browser (IndexedDB, one
**Profile** per Mercado Pago account, `web/lib/store.js`); the browser reads Mercado Pago itself (`web/lib/sync.js`).
The Worker (`src/`) serves `web/` and is a stateless **Relay**: sign-in code exchange, permission renewal and the
"Dinero disponible" report calls Mercado Pago refuses from browsers. Read `CONTEXT.md` and `docs/adr/` first.
`npm test` runs the tests; `npm run deploy` publishes (everyone gets the new version on next open).

## Hard rules
- The author keeps NO user data: no database, no Cron, no logs (`[observability] enabled = false`). The Relay never
  stores, logs or echoes a permission, code, movement or id beyond the response to the browser that asked.
- A user's permission and data never leave their device except to Mercado Pago (directly, or through the Relay for
  renewals and reports). Backups never include the permission. A Profile never sees another Profile's data.
- The Mercado Pago permission is only ever used to READ (it carries write scopes; Mercado Pago has no read-only).
  The only writes allowed are the report configuration and report requests (how Mercado Pago gives the balance).
- NEVER read, print, quote or commit `.dev.vars`, `.env`, anything under `data/`, `*.xlsx` or backup files.
  Secrets (`MP_CLIENT_ID`, `MP_CLIENT_SECRET`) are Worker secrets, never in code or `wrangler.toml`.
- Nothing personal in the code: no one's data, names or keywords that identify a person or places they use.
  Personal rules live in each user's Profile, never in `web/rules.js`.
- Every movement counts: payments, withdrawals, transfers sent, holds/disputes, refunds, deposits.
- No telemetry, analytics, error reporting or third-party scripts beyond Google Fonts.
- Tests use invented data only. Check rendering with `?demo` — never render a user's real data to inspect it.
- Sync is idempotent (movements stored by id) and resumable (the plan is saved after every step).
- Verify Mercado Pago and Cloudflare API details against official docs (or a probe) before relying on them.
- Run the tests before saying a step is finished. Commit after each finished step.

## Conventions
- User-facing text is in SPANISH (Argentina). Code, comments, CLAUDE.md and ADRs stay in English.
- Facts only: no suggestions, projections, inferred budgets or conclusions until the owner asks for them.
- Raw facts are stored; interpretation lives in `web/rules.js` + `web/lib/model.js` + the user's personal rules.
- Charts follow Storytelling with Data: gray context + ONE accent (palette color, coral by default) for the selection,
  values on the marks, no axes/gridlines/legends, simple bars only, no tables up front.
  Fonts: DM Serif Display (titles, big numbers) + DM Sans.
- Least friction for new users: one tap to sign in, nothing to install or configure.
- Plain JavaScript ES modules, no build step, no runtime dependencies. Small, readable modules.
- Bump `web/sw.js` VERSION when app files change, so phones pick the new version up.
- On this Windows PC `npx` is blocked in PowerShell: use `npx.cmd`. Git: `"C:\Program Files\Git\cmd\git.exe"`.
  The Bash tool collapses double backslashes: write code containing backslashes with the Write tool.
