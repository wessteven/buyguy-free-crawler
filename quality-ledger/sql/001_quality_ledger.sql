-- Additive, independent, append-only quality audit. Never alter GOGET or trackCA tables.
CREATE TABLE IF NOT EXISTS quality_ledger_runs (
  audit_id TEXT PRIMARY KEY,
  task_key TEXT NOT NULL,
  version TEXT NOT NULL,
  audited_at TEXT NOT NULL,
  source_run_id TEXT NOT NULL,
  source_status TEXT NOT NULL,
  source_started_at TEXT,
  expected INTEGER NOT NULL,
  source_recorded INTEGER NOT NULL,
  stale INTEGER NOT NULL,
  missing INTEGER NOT NULL,
  unverified INTEGER NOT NULL,
  ambiguous INTEGER NOT NULL,
  status TEXT NOT NULL,
  previous_recorded INTEGER,
  comparison TEXT NOT NULL,
  warning TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_quality_ledger_runs_task_time ON quality_ledger_runs(task_key,audited_at DESC);
CREATE TABLE IF NOT EXISTS quality_ledger_checks (
  audit_id TEXT NOT NULL,
  requirement_key TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  requirement TEXT NOT NULL,
  status TEXT NOT NULL,
  evidence_ref TEXT NOT NULL,
  note TEXT NOT NULL,
  PRIMARY KEY(audit_id,requirement_key),
  FOREIGN KEY(audit_id) REFERENCES quality_ledger_runs(audit_id)
);
CREATE INDEX IF NOT EXISTS ix_quality_ledger_checks_failed ON quality_ledger_checks(status,audit_id);
