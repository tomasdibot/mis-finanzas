---
status: accepted
---

# Self-hosted Deployments, no shared service

To let other people use the app without anyone but them holding their Mercado Pago data, it is published as a
Template that each Owner deploys as their own copy (own database, backend, web address and Mercado Pago developer
app). We rejected a hosted multi-user service: it would make the Template author the custodian of everyone's tokens
and movements (data controller under Argentina's Ley 25.326), require a shared Mercado Pago app whose secret either
leaks into every copy or sits in a broker the author runs, and break the "the host never sees financial data" rule.

## Consequences

- Setup must be click-only for non-technical Owners, at $0/month on free tiers, Argentina only.
- Nothing ever reports back to the author (no telemetry, error reports or update pings).
- Personal rules live in each Deployment's data, not in the Template.
- Updates are Releases the Owner applies with a tap that runs in their own GitHub copy; the author never pushes
  code into a Deployment.
