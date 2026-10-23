PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS users(
 id INTEGER PRIMARY KEY AUTOINCREMENT,email TEXT NOT NULL UNIQUE,name TEXT NOT NULL,
 password_hash TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('admin','recruiter','candidate')),
 active INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),expires_at INTEGER NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS jobs(
 id INTEGER PRIMARY KEY AUTOINCREMENT,title TEXT NOT NULL,country TEXT NOT NULL,city TEXT NOT NULL DEFAULT '',
 slots INTEGER NOT NULL DEFAULT 1,years_min INTEGER NOT NULL DEFAULT 0,skills_json TEXT NOT NULL DEFAULT '[]',
 description TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','closed')),
 created_by INTEGER REFERENCES users(id),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS candidates(
 id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,email TEXT,phone TEXT,target_role TEXT NOT NULL,country TEXT NOT NULL,
 years INTEGER NOT NULL DEFAULT 0,skills_json TEXT NOT NULL DEFAULT '[]',status TEXT NOT NULL DEFAULT 'new'
 CHECK(status IN ('new','screening','qualified','interview','manual_review','hired','archived')),
 source TEXT NOT NULL DEFAULT 'manual',consent_at TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS applications(
 id INTEGER PRIMARY KEY AUTOINCREMENT,job_id INTEGER NOT NULL REFERENCES jobs(id),candidate_id INTEGER NOT NULL REFERENCES candidates(id),
 status TEXT NOT NULL DEFAULT 'new',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(job_id,candidate_id)
);
CREATE TABLE IF NOT EXISTS documents(
 id INTEGER PRIMARY KEY AUTOINCREMENT,candidate_id INTEGER NOT NULL REFERENCES candidates(id),
 doc_type TEXT NOT NULL CHECK(doc_type IN ('passport','id','other')),expires_on TEXT,
 review_status TEXT NOT NULL DEFAULT 'pending' CHECK(review_status IN ('pending','review','verified','rejected')),
 flags_json TEXT NOT NULL DEFAULT '[]',review_note TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS screening_questions(
 id INTEGER PRIMARY KEY AUTOINCREMENT,job_id INTEGER NOT NULL REFERENCES jobs(id),
 prompt_pt TEXT NOT NULL,prompt_en TEXT NOT NULL DEFAULT '',prompt_es TEXT NOT NULL DEFAULT '',
 options_json TEXT NOT NULL,correct_index INTEGER NOT NULL,active INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS chat_sessions(
 id TEXT PRIMARY KEY,token_hash TEXT NOT NULL UNIQUE,job_id INTEGER NOT NULL REFERENCES jobs(id),
 language TEXT NOT NULL DEFAULT 'pt',step TEXT NOT NULL DEFAULT 'name',name TEXT,email TEXT,country TEXT,
 years INTEGER NOT NULL DEFAULT 0,skills_json TEXT NOT NULL DEFAULT '[]',question_index INTEGER NOT NULL DEFAULT 0,
 correct_count INTEGER NOT NULL DEFAULT 0,candidate_id INTEGER REFERENCES candidates(id),
 utm_source TEXT NOT NULL DEFAULT 'organic',utm_medium TEXT NOT NULL DEFAULT 'direct',utm_campaign TEXT NOT NULL DEFAULT '',
 consent_at TEXT NOT NULL,started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,completed_at TEXT
);
CREATE TABLE IF NOT EXISTS chat_answers(
 id INTEGER PRIMARY KEY AUTOINCREMENT,chat_id TEXT NOT NULL REFERENCES chat_sessions(id),
 question_id INTEGER NOT NULL REFERENCES screening_questions(id),selected_index INTEGER NOT NULL,
 is_correct INTEGER NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(chat_id,question_id)
);
CREATE TABLE IF NOT EXISTS audit(
 id INTEGER PRIMARY KEY AUTOINCREMENT,actor_id INTEGER,action TEXT NOT NULL,
 entity TEXT NOT NULL,entity_id INTEGER,at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS request_limits(
 rate_key TEXT PRIMARY KEY,count INTEGER NOT NULL DEFAULT 0,window_end INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS ix_candidates_status ON candidates(status);
CREATE INDEX IF NOT EXISTS ix_documents_candidate ON documents(candidate_id);
CREATE INDEX IF NOT EXISTS ix_sessions_expiry ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS ix_chat_sessions_job ON chat_sessions(job_id,started_at);
CREATE INDEX IF NOT EXISTS ix_chat_sessions_candidate ON chat_sessions(candidate_id);
