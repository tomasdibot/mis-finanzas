-- Sign-in (ADR 0002): the Owner signs in with Mercado Pago through their own Mercado Pago developer app.
-- The first accepted sign-in is the Claim: it binds the Deployment to that Mercado Pago account for good.

-- The Owner (exactly one row once claimed).
CREATE TABLE owner (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  mp_user_id TEXT NOT NULL,            -- the Mercado Pago account that claimed this Deployment
  claimed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Signed-in browsers. Only a SHA-256 hash of the cookie value is kept, never the value itself.
CREATE TABLE sessions (
  id_hash TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  expires_at TEXT NOT NULL
);

-- The Owner's Mercado Pago token, used only to READ movements (exactly one row). Never sent to the browser and
-- never included in exports.
CREATE TABLE mp_token (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expires_at TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
