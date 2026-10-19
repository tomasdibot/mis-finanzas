# mis-finanzas

Personal-finance app that reads a person's Mercado Pago account and shows where their money goes. One shared app
at one address; each person's data lives only on their own devices (ADR 0003).

## Language

**User**:
A person who signs in with their **Mercado Pago account**. Anyone can be one; the app holds nothing of theirs.
_Avoid_: owner, customer, tenant

**Mercado Pago account**:
The **User**'s Mercado Pago account whose movements the app reads.
_Avoid_: MP user, wallet

**Profile**:
Everything one **Mercado Pago account** has on one device: its permission, movements, balances, notes, recipient
names and **Personal rules**. A device can hold several; each only ever shows its own.
_Avoid_: account (ambiguous), local data

**Relay**:
The server part of the app. It swaps the sign-in code for a permission, renews it, and forwards the balance report
calls Mercado Pago won't take from a browser. It stores and logs nothing.
_Avoid_: backend, server (when meaning storage)

**Personal rules**:
The **User**'s own merchant names and words that pick a category. They live in the **Profile**, never in the shared
`web/rules.js`, and app updates never change them.
_Avoid_: config

**Backup**:
A file the **User** downloads with their **Profile** (without the permission) to keep or move to another device.

## Relationships

- One app serves many **Users**; each device keeps one **Profile** per **Mercado Pago account** signed in there.
- No **Profile** can see another's data, and the **Relay** keeps none.

## Flagged ambiguities

- "Deployment", "Owner", "Claim", "Template" and "Release" (ADR 0001/0002, 2026-10-17/18) belong to the retired
  self-hosted model; superseded by ADR 0003 on 2026-10-19.
