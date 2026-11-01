-- Isolated, idempotent GOGET six-agent Worker tables (same existing D1 DB).
-- Reviews table already exists in current production. No data is deleted or modified.
CREATE TABLE IF NOT EXISTS smart_wallet_six_agent_reviews (
  wallet TEXT NOT NULL,signature TEXT NOT NULL,
  source_observed_at TEXT NOT NULL,reviewed_at TEXT NOT NULL,
  verdict TEXT NOT NULL,trace_json TEXT NOT NULL,
  PRIMARY KEY(wallet,signature)
);
CREATE TABLE IF NOT EXISTS smart_wallet_agent_lease (
  id TEXT PRIMARY KEY,owner TEXT NOT NULL,until_ms INTEGER NOT NULL
);
INSERT OR IGNORE INTO smart_wallet_agent_lease (id,owner,until_ms)
VALUES ('runner','',0);
CREATE TABLE IF NOT EXISTS smart_wallet_agent_runs (
  run_id TEXT PRIMARY KEY,started_at TEXT NOT NULL,completed_at TEXT NOT NULL,
  source_rows INTEGER NOT NULL,persisted_rows INTEGER NOT NULL,
  backlog INTEGER,summary_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS smart_wallet_agent_runs_recent
  ON smart_wallet_agent_runs(started_at DESC);
