# mis-finanzas

Public **Template** of a personal-finance app for one Mercado Pago account (Argentina only). Each **Owner** deploys
their own copy to their own Cloudflare account at $0: a Worker (`src/worker.js`) serves the PWA in `web/` as static
assets, keeps the data in D1 (`migrations/`) and will sync from Mercado Pago on a Cron. Read `CONTEXT.md` (glossary)
and `docs/adr/` first. `npm run deploy` applies the D1 migrations and deploys; `npm test` runs the tests.

## Hard rules
- This repo is public. NOTHING personal goes in it: no one's data, tokens, emails, account ids, project URLs,
  merchant/recipient names or keywords that identify a person or the places they use. Personal rules live in each
  Deployment's database (CONTEXT.md, "Personal rules"), never in `web/rules.js`.
- NEVER read, print, quote or commit `.dev.vars`, `.env`, anything under `data/`, `*.xlsx` or exported backups. Secrets
  (Mercado Pago client secret, session keys) are Worker secrets (`wrangler secret put`), never in code or `wrangler.toml`.
- Every movement counts: payments, withdrawals, transfers sent, holds/disputes, refunds, deposits. Nothing is
  silently dropped.
- The Mercado Pago token is only ever used to READ (it carries write scopes; see ADR 0002). It never leaves the
  Owner's Worker and is never sent to the browser.
- Nothing reports back to the Template author: no telemetry, error reports, update pings or third-party analytics.
- Tests use invented data only, never real data. Never paste real rows into chats or commits. Check rendering with
  `?demo` (invented data) — never render an Owner's real data to inspect it.
- Sync code must be idempotent: rerunning must not duplicate rows or double-count. Keep each run within the free plan's
  10 ms CPU (≤ ~200 payments per run).
- Verify Mercado Pago and Cloudflare API details against the official docs before relying on them; do not guess
  endpoints or field names.
- Run the tests before saying a step is finished. Commit after each finished step.

## Conventions
- User-facing text is in SPANISH (Argentina): the app, error messages and the setup guide for Owners
  (`LEEME.md`). Code, comments, CLAUDE.md and ADRs stay in English.
- Facts only: no suggestions, projections, inferred budgets or conclusions in the app until the owner asks for them.
- The cloud stores raw facts only; interpretation lives in `web/rules.js` + `web/lib/model.js`.
- Charts follow Storytelling with Data: gray context + ONE accent (the palette color, coral by default) for the
  selection, values on the marks, no axes/gridlines/legends, simple bars only, no tables up front.
  Fonts: DM Serif Display (titles, big numbers) + DM Sans.
- Setup must stay click-only for non-technical Owners, on free tiers only.
- Plain JavaScript ES modules, no build step. Prefer small, readable modules. No new dependencies without a reason.
- On this Windows PC `npx` is blocked in PowerShell (execution policy): use `npx.cmd`. Git may not be on PATH:
  `"C:\Program Files\Git\cmd\git.exe"`.
