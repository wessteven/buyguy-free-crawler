-- Isolated GOGET prospective signal research. No trading or edits to production scanner tables.
CREATE TABLE IF NOT EXISTS goget_pre_signal_snapshots (
  mint TEXT NOT NULL,bucket TEXT NOT NULL,created_at TEXT NOT NULL,
  first_recent_at TEXT NOT NULL,last_recent_at TEXT NOT NULL,
  recent_signatures INTEGER NOT NULL,prior_signatures INTEGER NOT NULL,
  distinct_wallets INTEGER NOT NULL,fee_payer_wallets INTEGER NOT NULL,
  intensity_ratio REAL,category TEXT NOT NULL,sample_kind TEXT NOT NULL,
  pool TEXT,quote_minute TEXT,quote_price_sol REAL,
  coverage TEXT NOT NULL,findings_json TEXT NOT NULL,
  PRIMARY KEY(mint,bucket)
);
CREATE INDEX IF NOT EXISTS goget_pre_signal_snapshots_recent
  ON goget_pre_signal_snapshots(bucket DESC,category);
CREATE TABLE IF NOT EXISTS goget_pre_signal_outcomes (
  mint TEXT NOT NULL,bucket TEXT NOT NULL,horizon_min INTEGER NOT NULL,
  due_at TEXT NOT NULL,pool TEXT NOT NULL,reference_price_sol REAL NOT NULL,
  status TEXT NOT NULL,checked_at TEXT,future_quote_minute TEXT,
  future_price_sol REAL,change_pct REAL,
  PRIMARY KEY(mint,bucket,horizon_min)
);
CREATE INDEX IF NOT EXISTS goget_pre_signal_outcomes_due
  ON goget_pre_signal_outcomes(status,due_at);
CREATE TABLE IF NOT EXISTS goget_pre_signal_lease (
  id TEXT PRIMARY KEY,owner TEXT NOT NULL,until_ms INTEGER NOT NULL
);
INSERT OR IGNORE INTO goget_pre_signal_lease(id,owner,until_ms)
 VALUES('runner','',0);
CREATE TABLE IF NOT EXISTS goget_pre_signal_runs (
  run_id TEXT PRIMARY KEY,at TEXT NOT NULL,trigger TEXT NOT NULL,
  status TEXT NOT NULL,observed_rows INTEGER NOT NULL,
  stored_snapshots INTEGER NOT NULL,summary_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS goget_pre_signal_runs_recent
  ON goget_pre_signal_runs(at DESC);
