-- Sync in small steps (phase 3).
-- h: a fingerprint of the row's Mercado Pago facts; a re-synced movement is written only when it changed (saves D1's
-- free daily write allowance).
ALTER TABLE movements ADD COLUMN h TEXT;
-- attempts: a report that can't be processed after a few tries is set aside instead of blocking every run.
ALTER TABLE report_tasks ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0;
