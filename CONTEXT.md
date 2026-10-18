# mis-finanzas

Personal-finance app that reads one person's Mercado Pago account and shows where their money goes. It is
distributed as a self-hosted template: every person runs their own copy.

## Language

**Owner**:
The one person a **Deployment** belongs to; the only one who can sign in to it and read its data.
_Avoid_: user, customer, tenant

**Deployment**:
One person's own running copy of the app (their own database, backend and web address), set up from the shared
**Template**. Holds the data of exactly one **Mercado Pago account**.
_Avoid_: instance, site, project

**Template**:
The shared, publishable source that anyone can turn into their own **Deployment**. Contains no one's data or
personal rules.
_Avoid_: repo, product

**Mercado Pago account**:
The **Owner**'s Mercado Pago account whose movements the **Deployment** reads. One per **Deployment**.
_Avoid_: MP user, wallet

**Claim**:
The first sign-in to a new **Deployment**, which binds it to its **Owner** for good. Only the
**Mercado Pago account** that owns the Deployment's Mercado Pago developer app can **Claim** it or sign in later.

**Personal rules**:
The **Owner**'s own merchant names, categories, recipient names and learned words. They live in the
**Deployment**'s data, never in the **Template**, and **Template** updates never overwrite them.
_Avoid_: config, rules.js

**Release**:
A published version of the **Template**. An **Owner** chooses when to apply a **Release** to their
**Deployment**; nothing updates by itself.
_Avoid_: auto-update, upgrade

## Relationships

- A **Template** produces many **Deployments**; each **Deployment** has exactly one **Owner** and one
  **Mercado Pago account**.
- No **Deployment** can read another's data, and the **Template** author holds none of it.

## Flagged ambiguities

- "users" (2026-10-17) meant other people running the app — resolved: each is the **Owner** of their own
  **Deployment**, not an account inside a shared service.
