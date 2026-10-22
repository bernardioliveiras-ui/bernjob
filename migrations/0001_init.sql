PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK(role IN ('candidate','lawyer','company','admin')),
  password_hash TEXT NOT NULL,
  force_password_change INTEGER NOT NULL DEFAULT 0,
  access_until TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  plan TEXT NOT NULL CHECK(plan IN ('candidate','lawyer','company')),
  expected_amount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  checkout_url TEXT,
  transaction_nsu TEXT UNIQUE,
  invoice_slug TEXT,
  activated_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id,created_at DESC);
CREATE TABLE IF NOT EXISTS job_sources (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL CHECK(provider IN ('greenhouse','lever','ashby')),
  board_slug TEXT NOT NULL,
  employer TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 0,
  terms_reviewed INTEGER NOT NULL DEFAULT 0,
  country_scope TEXT NOT NULL DEFAULT 'MULTI',
  last_fetched_at TEXT,
  last_success_at TEXT,
  last_status TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(provider,board_slug)
);
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES job_sources(id),
  employer TEXT NOT NULL,
  external_id TEXT NOT NULL,
  country TEXT NOT NULL CHECK(country IN ('PT','DE','IE')),
  title TEXT NOT NULL,
  location TEXT NOT NULL,
  job_url TEXT NOT NULL,
  apply_url TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  salary TEXT,
  international_status TEXT NOT NULL DEFAULT 'unknown' CHECK(international_status IN ('confirmed','not_confirmed','unknown')),
  status_evidence TEXT NOT NULL DEFAULT '',
  is_active INTEGER NOT NULL DEFAULT 1,
  first_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(source_id,external_id)
);
CREATE INDEX IF NOT EXISTS idx_jobs_country_status ON jobs(country,is_active,international_status,last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_source ON jobs(source_id,is_active);
CREATE TABLE IF NOT EXISTS job_runs (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES job_sources(id),
  imported_count INTEGER NOT NULL DEFAULT 0,
  fetched_count INTEGER NOT NULL DEFAULT 0,
  result TEXT NOT NULL,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS lawyer_profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  country TEXT NOT NULL DEFAULT 'PT',
  bar_name TEXT,
  registration TEXT,
  languages TEXT NOT NULL DEFAULT 'Português',
  description TEXT NOT NULL DEFAULT '',
  is_verified INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS contact_requests (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lawyer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id TEXT REFERENCES jobs(id) ON DELETE SET NULL,
  contact_name TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  contact_phone TEXT,
  message TEXT NOT NULL,
  consent_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new','contacted','closed')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_requests_lawyer ON contact_requests(lawyer_id,created_at DESC);
CREATE TABLE IF NOT EXISTS login_attempts (
  identity TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL DEFAULT 0,
  reset_at TEXT NOT NULL
);
