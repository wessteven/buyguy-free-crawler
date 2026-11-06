-- Additive GOGET experiment schema. Does not touch production scanner,
-- original 3-wallet source cursor, original 12-wallet webhook or paper accounts.
-- Raw log signatures persist in pilot Durable Object SQLite; D1 stores bounded
-- audit snapshots, independent reconciliation, and forward-only outcome jobs.
CREATE TABLE IF NOT EXISTS goget_event_pilot_runs (
 run_id TEXT PRIMARY KEY, utc_day TEXT NOT NULL UNIQUE,
 started_at TEXT NOT NULL, ends_at TEXT NOT NULL, completed_at TEXT,
 status TEXT NOT NULL, requested_pools INTEGER NOT NULL, armed_pools INTEGER NOT NULL,
 reserved_credits INTEGER NOT NULL, streamed_bytes INTEGER NOT NULL DEFAULT 0,
 unique_events INTEGER NOT NULL DEFAULT 0, duplicate_events INTEGER NOT NULL DEFAULT 0,
 streamed_estimated_credits INTEGER NOT NULL DEFAULT 0,
 rpc_attempts INTEGER NOT NULL DEFAULT 0,
 provider_billed_credits INTEGER, cloudflare_billed_usd REAL,
 ws_connections INTEGER NOT NULL DEFAULT 0, stream_gap_count INTEGER NOT NULL DEFAULT 0,
 stop_reason TEXT, notes TEXT
);
CREATE TABLE IF NOT EXISTS goget_event_pilot_roster (
 run_id TEXT NOT NULL, pool TEXT NOT NULL, mint TEXT NOT NULL, asset_key TEXT NOT NULL,
 PRIMARY KEY(run_id,pool)
);
CREATE TABLE IF NOT EXISTS goget_event_pilot_windows (
 run_id TEXT NOT NULL,pool TEXT NOT NULL,mint TEXT NOT NULL,
 minute TEXT NOT NULL,cutoff_at TEXT NOT NULL,coverage TEXT NOT NULL,
 raw_mentions INTEGER NOT NULL,prior_four_minutes INTEGER NOT NULL,
 stream_trigger INTEGER,scheduled_trigger INTEGER,
 scheduled_status TEXT NOT NULL,
 scheduled_quote_at TEXT,scheduled_price REAL,
 scheduled_buys_m5 INTEGER,scheduled_sells_m5 INTEGER,
 PRIMARY KEY(run_id,pool,minute)
);
CREATE INDEX IF NOT EXISTS goget_event_pilot_windows_pool
 ON goget_event_pilot_windows(pool,minute DESC);
CREATE TABLE IF NOT EXISTS goget_event_pilot_outcomes (
 run_id TEXT NOT NULL,pool TEXT NOT NULL,minute TEXT NOT NULL,
 horizon_min INTEGER NOT NULL,due_at TEXT NOT NULL,
 start_price REAL NOT NULL, status TEXT NOT NULL DEFAULT 'PENDING',
 checked_at TEXT,outcome_quote_at TEXT,outcome_price REAL,
 return_pct REAL,source TEXT,
 PRIMARY KEY(run_id,pool,minute,horizon_min)
);
CREATE INDEX IF NOT EXISTS goget_event_pilot_due
 ON goget_event_pilot_outcomes(status,due_at);
CREATE TABLE IF NOT EXISTS goget_event_pilot_reconciliation (
 run_id TEXT NOT NULL,pool TEXT NOT NULL,checked_at TEXT NOT NULL,
 status TEXT NOT NULL,rpc_in_window INTEGER,
 websocket_matched INTEGER,missing INTEGER,recall REAL,
 page_size INTEGER,provider_error TEXT,
 PRIMARY KEY(run_id,pool)
);
CREATE TABLE IF NOT EXISTS goget_event_pilot_gaps (
 run_id TEXT NOT NULL,gap_at TEXT NOT NULL,
 reason TEXT NOT NULL,details TEXT,
 PRIMARY KEY(run_id,gap_at,reason)
);
