-- Initial schema for one Owner's Deployment (D1 / SQLite). Applied by `npm run deploy`
-- (wrangler d1 migrations apply DB --remote). Translated from the old Supabase setup.sql + migrations 002-008.
-- One Deployment = one Owner, so there is no owners table and no row-level security: only the Worker reads the
-- database, and (from phase 2) it answers only the signed-in Owner. Sign-in/session tables come in phase 2.
-- Times are ISO 8601 text in UTC ("2026-10-18T12:00:00.000Z"); amounts are pesos (REAL).

-- Raw Mercado Pago movements (facts only; names and categories are derived in the app from rules).
CREATE TABLE movements (
  id TEXT PRIMARY KEY,                 -- "<payment_id>:payment", "<payment_id>:refund:<refund_id>" or "payout:..."
  payment_id INTEGER NOT NULL,
  row_type TEXT NOT NULL,              -- payment | refund | payout
  date TEXT NOT NULL,
  month TEXT NOT NULL,                 -- YYYY-MM in Argentina time
  direction TEXT NOT NULL,             -- out | in
  operation_type TEXT, status TEXT, payment_type TEXT, payment_method TEXT, channel TEXT,
  business_unit TEXT, branch TEXT, item_category TEXT,
  description TEXT, statement_descriptor TEXT, item_titles TEXT, merchant_site TEXT,
  counterparty TEXT, holder_name TEXT,
  group_id TEXT,                       -- same value = one purchase paid with several methods
  recipient_key TEXT,                  -- HMAC of the transfer recipient's account id; never the id itself
  mcc TEXT,                            -- card-network merchant category code (e.g. 5411 = supermarket)
  amount REAL NOT NULL,                -- signed: out < 0, in > 0
  synced_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX movements_month ON movements (month);

-- Available balance snapshots, read from Mercado Pago's "Dinero disponible" (Releases) reports.
CREATE TABLE balances (
  as_of TEXT PRIMARY KEY,              -- time of the last movement the balance includes
  available REAL NOT NULL,
  fetched_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Releases reports requested by the sync (generated asynchronously by Mercado Pago, max 90 days each).
CREATE TABLE report_tasks (
  task_id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL,                  -- recent | backfill
  begin_date TEXT, end_date TEXT,
  requested_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  processed_at TEXT, detail TEXT
);

-- Names (and optionally a category) the Owner gives to transfer recipients.
CREATE TABLE recipients (
  key TEXT PRIMARY KEY,                -- the recipient's HMAC key (movements.recipient_key)
  name TEXT NOT NULL,
  category TEXT,                       -- empty = "Transferencias enviadas"
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- The Owner's notes and rules: a note on one movement (id = movement id), a rule for a whole merchant
-- (id "m:<merchant>") or a learned word (id "w:<out|in>:<word>").
CREATE TABLE notes (
  id TEXT PRIMARY KEY,
  note TEXT,
  category TEXT,                       -- empty = the one the note's words or the automatic rules give
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Mercado Libre category id -> path ("Hogar, Muebles y Jardín > Iluminación"), cached by the sync.
CREATE TABLE ml_categories (id TEXT PRIMARY KEY, path TEXT NOT NULL);

-- One row per sync run, shown in Ajustes.
CREATE TABLE sync_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  finished_at TEXT,
  trigger TEXT, months INTEGER, ok INTEGER, rows INTEGER, detail TEXT   -- ok: 1 | 0 | NULL (running)
);

-- Server-only settings (e.g. recipient_salt). Never sent to the browser.
CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
