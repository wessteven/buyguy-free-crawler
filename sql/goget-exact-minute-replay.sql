-- Exact archived minute-window evidence only; original forward outcome tables unchanged.
CREATE TABLE IF NOT EXISTS goget_exact_minute_replay_budget(
 day TEXT PRIMARY KEY,api_requests_reserved INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS goget_exact_minute_replay_outcomes(
 mint TEXT NOT NULL,bucket TEXT NOT NULL,horizon_min INTEGER NOT NULL,
 due_at TEXT NOT NULL,pool TEXT NOT NULL,checked_at TEXT NOT NULL,
 audit_status TEXT NOT NULL,provider TEXT NOT NULL,
 attempted_calls INTEGER NOT NULL,
 next_retry_at TEXT,
 one_minute_count INTEGER,expected_minute_count INTEGER,
 missing_minute_count INTEGER,matched_candle_at TEXT,
 historical_close_usd REAL,historical_change_pct REAL,
 quality_json TEXT NOT NULL,
 PRIMARY KEY(mint,bucket,horizon_min));
CREATE INDEX IF NOT EXISTS goget_exact_minute_replay_status
 ON goget_exact_minute_replay_outcomes(audit_status,next_retry_at);
CREATE TABLE IF NOT EXISTS goget_exact_minute_replay_runs(
 run_id TEXT PRIMARY KEY,at TEXT NOT NULL,status TEXT NOT NULL,
 source_missing_total INTEGER NOT NULL,source_already_recovered INTEGER NOT NULL,
 total_retrospective_checked INTEGER NOT NULL,
 public_requests INTEGER NOT NULL,accepted_minute_matches INTEGER NOT NULL,
 api_budget_used INTEGER NOT NULL,summary_json TEXT NOT NULL);
