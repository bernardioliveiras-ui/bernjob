-- Bern Global v0.2: perfis de empresas, publicação moderada e candidatura consentida.
CREATE TABLE IF NOT EXISTS company_profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  legal_name TEXT NOT NULL DEFAULT '',
  website TEXT,
  description TEXT NOT NULL DEFAULT '',
  logo_url TEXT,
  verified INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS company_jobs (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  country TEXT NOT NULL CHECK(country IN ('PT','DE','IE')),
  city TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL,
  requirements TEXT NOT NULL,
  salary TEXT NOT NULL DEFAULT '',
  image_url TEXT,
  document_support TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','published','rejected','closed')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_company_jobs_status ON company_jobs(status,country,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_company_jobs_owner ON company_jobs(company_id,created_at DESC);
CREATE TABLE IF NOT EXISTS company_applications (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES company_jobs(id) ON DELETE CASCADE,
  candidate_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_name TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new','contacted','interview','closed')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(job_id,candidate_id)
);
CREATE INDEX IF NOT EXISTS idx_company_apps_job ON company_applications(job_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_company_apps_candidate ON company_applications(candidate_id,created_at DESC);
CREATE TABLE IF NOT EXISTS company_messages (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES company_applications(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_company_msg_app ON company_messages(application_id,created_at DESC);
