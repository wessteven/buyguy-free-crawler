-- trackBIGBUX: independent, additive D1 schema. No foreign GOGET or trackCA references.
CREATE TABLE IF NOT EXISTS trackbigbux_runs (
  bucket INTEGER PRIMARY KEY,run_id TEXT NOT NULL UNIQUE,roster_version TEXT NOT NULL,
  started_at TEXT NOT NULL,completed_at TEXT,status TEXT NOT NULL,
  expected_wallets INTEGER NOT NULL,attempted_wallets INTEGER NOT NULL DEFAULT 0,
  complete_wallets INTEGER NOT NULL DEFAULT 0,first_baselines INTEGER NOT NULL DEFAULT 0,
  partial_wallets INTEGER NOT NULL DEFAULT 0,events_seen INTEGER NOT NULL DEFAULT 0,
  events_staged INTEGER NOT NULL DEFAULT 0,enhanced_parsed INTEGER NOT NULL DEFAULT 0,
  parser_backlog INTEGER NOT NULL DEFAULT 0,warnings_json TEXT NOT NULL DEFAULT '[]'
);
CREATE INDEX IF NOT EXISTS ix_trackbigbux_runs_recent ON trackbigbux_runs(started_at DESC);
CREATE TABLE IF NOT EXISTS trackbigbux_wallet_state (
  wallet_id TEXT PRIMARY KEY,chain TEXT NOT NULL,address TEXT NOT NULL,
  newest_tx_id TEXT,last_completed_run TEXT,
  last_seen_at TEXT,updated_at TEXT NOT NULL,
  gap_count INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS trackbigbux_activity (
  wallet_id TEXT NOT NULL,chain TEXT NOT NULL,tx_id TEXT NOT NULL,
  occurred_at TEXT,height TEXT,observed_at TEXT NOT NULL,
  category TEXT NOT NULL,initiated TEXT NOT NULL,source TEXT NOT NULL,
  evidence_json TEXT NOT NULL DEFAULT '{}',
  PRIMARY KEY(wallet_id,chain,tx_id)
);
CREATE INDEX IF NOT EXISTS ix_trackbigbux_activity_recent ON trackbigbux_activity(occurred_at DESC,wallet_id);
CREATE INDEX IF NOT EXISTS ix_trackbigbux_activity_wallet ON trackbigbux_activity(wallet_id,observed_at DESC);
CREATE INDEX IF NOT EXISTS ix_trackbigbux_activity_unparsed ON trackbigbux_activity(chain,category,observed_at);
CREATE TABLE IF NOT EXISTS trackbigbux_coverage (
  run_id TEXT NOT NULL,wallet_id TEXT NOT NULL,chain TEXT NOT NULL,
  expected_address TEXT NOT NULL,provider TEXT NOT NULL,
  status TEXT NOT NULL,started_at TEXT NOT NULL,completed_at TEXT NOT NULL,
  fetch_calls INTEGER NOT NULL,rows_received INTEGER NOT NULL,
  rows_staged INTEGER NOT NULL,checkpoint_matched INTEGER NOT NULL DEFAULT 0,
  source_latest_tx TEXT,source_latest_at TEXT,
  error TEXT,PRIMARY KEY(run_id,wallet_id)
);
CREATE INDEX IF NOT EXISTS ix_trackbigbux_coverage_wallet ON trackbigbux_coverage(wallet_id,completed_at DESC);
CREATE TABLE IF NOT EXISTS trackbigbux_receipts (
  run_id TEXT NOT NULL,wallet_id TEXT NOT NULL,seq INTEGER NOT NULL,
  source TEXT NOT NULL,request_kind TEXT NOT NULL,
  observed_at TEXT NOT NULL,result_status TEXT NOT NULL,
  response_records INTEGER NOT NULL DEFAULT 0,details TEXT,
  PRIMARY KEY(run_id,wallet_id,seq)
);
CREATE TABLE IF NOT EXISTS trackbigbux_quality (
  run_id TEXT PRIMARY KEY,observed_at TEXT NOT NULL,roster_version TEXT NOT NULL,
  frozen_denominator INTEGER NOT NULL,covered INTEGER NOT NULL,
  complete INTEGER NOT NULL,baselines INTEGER NOT NULL,partial INTEGER NOT NULL,
  parser_pending INTEGER NOT NULL,classification_notice TEXT NOT NULL
);
