-- Additive, dedicated Vlad evidence namespace. Never writes to GOGET or other tracking tables.
CREATE TABLE IF NOT EXISTS vladwatch_runs (
 id TEXT PRIMARY KEY, started_at TEXT NOT NULL, completed_at TEXT, trigger_kind TEXT NOT NULL,
 expected_pairs INTEGER NOT NULL, checked_pairs INTEGER DEFAULT 0, partial_pairs INTEGER DEFAULT 0,
 failed_pairs INTEGER DEFAULT 0, state TEXT DEFAULT 'running', error TEXT
);
CREATE TABLE IF NOT EXISTS vladwatch_coverage (
 run_id TEXT NOT NULL, wallet_id TEXT NOT NULL, chain_id INTEGER NOT NULL,
 observed_at TEXT NOT NULL, native_status TEXT NOT NULL, tx_status TEXT NOT NULL, token_status TEXT NOT NULL,
 overall TEXT NOT NULL, native_source TEXT, tx_source TEXT, token_source TEXT,
 native_balance_wei TEXT, native_nonce TEXT, block_hex TEXT,
 attempts_json TEXT NOT NULL, details_json TEXT NOT NULL,
 PRIMARY KEY(run_id,wallet_id,chain_id)
);
CREATE TABLE IF NOT EXISTS vladwatch_checkpoints (
 wallet_id TEXT NOT NULL, chain_id INTEGER NOT NULL, stream TEXT NOT NULL,
 newest_event_key TEXT, updated_at TEXT NOT NULL, baseline_complete INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(wallet_id,chain_id,stream)
);
CREATE TABLE IF NOT EXISTS vladwatch_events (
 chain_id INTEGER NOT NULL, address TEXT NOT NULL, event_key TEXT NOT NULL,
 wallet_id TEXT NOT NULL, tx_hash TEXT NOT NULL, block_number TEXT NOT NULL,
 occurred_at TEXT NOT NULL, discovered_at TEXT NOT NULL, stream TEXT NOT NULL,
 direction TEXT, from_address TEXT, to_address TEXT, token_contract TEXT,
 token_symbol TEXT, raw_amount TEXT, decimals TEXT, classification TEXT,
 trade_verified INTEGER NOT NULL DEFAULT 0, liquidity_verified INTEGER NOT NULL DEFAULT 0,
 source TEXT NOT NULL, baseline INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(chain_id,address,event_key)
);
CREATE INDEX IF NOT EXISTS ix_vladwatch_runs_started ON vladwatch_runs(started_at DESC);
CREATE INDEX IF NOT EXISTS ix_vladwatch_events_seen ON vladwatch_events(discovered_at DESC);
CREATE INDEX IF NOT EXISTS ix_vladwatch_events_wallet ON vladwatch_events(wallet_id,chain_id,occurred_at DESC);