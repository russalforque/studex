-- Studex licensing database (Cloudflare D1 / SQLite).
-- Holds purchases, licenses and device activations only. No student data ever lives here.
-- Timestamps are unix seconds (INTEGER). Emails are stored lower-cased and trimmed.

PRAGMA foreign_keys = ON;

-- Server-side configuration the admin can change without a deploy (price, edition name).
CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
INSERT INTO settings (key, value) VALUES
  ('price_minor', '19900'),          -- ₱199.00, in centavos
  ('currency', 'PHP'),
  ('product_name', 'Studex Lifetime'),
  ('max_devices', '1'),
  ('self_transfers_per_year', '3');

-- One row per checkout attempt. A paid order gets exactly one license (licenses.order_id is UNIQUE).
CREATE TABLE orders (
  id                  TEXT PRIMARY KEY,                    -- ord_<random>
  email               TEXT NOT NULL,
  client_ref          TEXT NOT NULL UNIQUE,                -- browser-generated id: a double-clicked Buy reuses the same order
  access_hash         TEXT NOT NULL UNIQUE,                -- HMAC of the secret token in the success-page URL
  amount_minor        INTEGER NOT NULL CHECK (amount_minor > 0),
  currency            TEXT NOT NULL CHECK (currency = 'PHP'),
  edition             TEXT NOT NULL DEFAULT 'lifetime',
  status              TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'paid', 'failed', 'expired', 'refunded', 'disputed')),
  provider            TEXT NOT NULL DEFAULT 'paymongo',
  livemode            INTEGER NOT NULL CHECK (livemode IN (0, 1)),
  checkout_session_id TEXT UNIQUE,
  checkout_url        TEXT,
  payment_id          TEXT UNIQUE,
  payment_method      TEXT,
  license_code_enc    TEXT,                                -- AES-GCM; shown on the success page, wiped after REVEAL_DAYS
  last_checked_at     INTEGER,                             -- last time the success page asked PayMongo directly
  created_at          INTEGER NOT NULL,
  paid_at             INTEGER,
  refunded_at         INTEGER,
  updated_at          INTEGER NOT NULL
);
CREATE INDEX orders_email ON orders (email);
CREATE INDEX orders_status ON orders (status, created_at);

CREATE TABLE licenses (
  id             TEXT PRIMARY KEY,                         -- lic_<random>; public identifier, not a secret
  order_id       TEXT NOT NULL UNIQUE REFERENCES orders (id),
  email          TEXT NOT NULL,
  code_hash      TEXT NOT NULL UNIQUE,                     -- HMAC-SHA256(pepper, normalized code); the code itself is never stored
  code_hint      TEXT NOT NULL,                            -- last 4 characters, for "STDX-••••-K7QF"
  edition        TEXT NOT NULL DEFAULT 'lifetime',
  channel        TEXT NOT NULL DEFAULT 'web_android'       -- where it was bought / what it unlocks
                 CHECK (channel IN ('web_android', 'app_store', 'google_play')),
  status         TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'revoked')),
  status_reason  TEXT,
  max_devices    INTEGER NOT NULL DEFAULT 1 CHECK (max_devices BETWEEN 1 AND 10),
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);
CREATE INDEX licenses_email ON licenses (email);

CREATE TABLE activations (
  id              TEXT PRIMARY KEY,                        -- act_<random>
  license_id      TEXT NOT NULL REFERENCES licenses (id),
  installation_id TEXT NOT NULL,                           -- random UUID made by the app on first launch
  device_key      TEXT NOT NULL,                           -- the installation's Ed25519 public key (base64url)
  device_hint     TEXT,                                    -- hashed app-scoped device id, to recognise a reinstall on the same phone
  platform        TEXT NOT NULL CHECK (platform IN ('android', 'ios', 'web')),
  device_label    TEXT,                                    -- e.g. "Pixel 7 · Android 15", shown to the customer
  app_version     TEXT,
  status          TEXT NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active', 'deactivated', 'replaced', 'revoked')),
  method          TEXT NOT NULL CHECK (method IN ('code', 'email', 'reinstall', 'admin')),
  created_at      INTEGER NOT NULL,
  ended_at        INTEGER,
  end_reason      TEXT
);
CREATE INDEX activations_license ON activations (license_id, status);
CREATE UNIQUE INDEX activations_one_active_install ON activations (license_id, installation_id) WHERE status = 'active';

-- Every PayMongo event, once. The primary key is the idempotency guard against duplicate deliveries.
CREATE TABLE webhook_events (
  id           TEXT PRIMARY KEY,                           -- evt_...
  type         TEXT NOT NULL,
  livemode     INTEGER NOT NULL,
  received_at  INTEGER NOT NULL,
  processed_at INTEGER,
  result       TEXT,
  error        TEXT
);

-- One-time codes and links sent by email (restore purchase, lost license code).
CREATE TABLE email_challenges (
  id          TEXT PRIMARY KEY,
  email       TEXT NOT NULL,
  purpose     TEXT NOT NULL CHECK (purpose IN ('restore', 'reissue')),
  secret_hash TEXT NOT NULL,
  attempts    INTEGER NOT NULL DEFAULT 0,
  expires_at  INTEGER NOT NULL,
  consumed_at INTEGER,
  created_at  INTEGER NOT NULL
);
CREATE INDEX email_challenges_lookup ON email_challenges (email, purpose, created_at);
CREATE UNIQUE INDEX email_challenges_secret ON email_challenges (secret_hash);

-- Device moves beyond the self-service allowance wait here for the admin.
CREATE TABLE transfer_requests (
  id              TEXT PRIMARY KEY,
  license_id      TEXT NOT NULL REFERENCES licenses (id),
  installation_id TEXT NOT NULL,
  device_key      TEXT NOT NULL,
  device_hint     TEXT,
  platform        TEXT NOT NULL,
  device_label    TEXT,
  app_version     TEXT,
  status          TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'approved', 'declined')),
  created_at      INTEGER NOT NULL,
  decided_at      INTEGER,
  decided_by      TEXT
);
CREATE INDEX transfer_requests_status ON transfer_requests (status, created_at);

-- Fixed-window counters. Old windows are deleted by the daily cron.
CREATE TABLE rate_limits (
  key          TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  count        INTEGER NOT NULL,
  PRIMARY KEY (key, window_start)
);

CREATE TABLE audit_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  at         INTEGER NOT NULL,
  actor      TEXT NOT NULL,                                -- system | customer | admin:<email>
  action     TEXT NOT NULL,
  license_id TEXT,
  order_id   TEXT,
  ok         INTEGER NOT NULL DEFAULT 1,
  detail     TEXT,                                         -- JSON, never secrets
  ip_hash    TEXT
);
CREATE INDEX audit_log_at ON audit_log (at);
CREATE INDEX audit_log_license ON audit_log (license_id, at);
CREATE INDEX audit_log_failures ON audit_log (ok, at);

-- Android builds offered for download. The APK itself lives in R2.
CREATE TABLE releases (
  version_code INTEGER PRIMARY KEY,
  version_name TEXT NOT NULL,
  r2_key       TEXT NOT NULL,
  sha256       TEXT NOT NULL,
  size_bytes   INTEGER NOT NULL,
  min_android  TEXT NOT NULL,
  notes        TEXT NOT NULL DEFAULT '',
  published_at INTEGER NOT NULL,
  is_current   INTEGER NOT NULL DEFAULT 0 CHECK (is_current IN (0, 1))
);
CREATE UNIQUE INDEX releases_one_current ON releases (is_current) WHERE is_current = 1;
