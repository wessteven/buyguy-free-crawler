-- Independent GitHub Actions verification, separate from in-worker self-reported quality.
CREATE TABLE IF NOT EXISTS trackbigbux_external_audits (
  audited_bucket INTEGER PRIMARY KEY,
  audited_at TEXT NOT NULL,
  source_run_id TEXT,
  source_started_at TEXT,
  source_status TEXT NOT NULL,
  roster_version TEXT NOT NULL,
  frozen_denominator INTEGER NOT NULL,
  actual_coverage INTEGER NOT NULL,
  verified_request_wallets INTEGER NOT NULL,
  candidate_events_seen INTEGER NOT NULL,
  actual_events_in_run INTEGER NOT NULL,
  parser_pending INTEGER NOT NULL,
  failures_json TEXT NOT NULL,
  verdict TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_trackbigbux_audits_recent ON trackbigbux_external_audits(audited_at DESC);
