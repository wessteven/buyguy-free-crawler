-- GOGET legacy RPC gap replay. New isolated, idempotent tables only.
-- Existing webhook, live cursors, historical replay and Cloudflare source rows are immutable.
CREATE TABLE IF NOT EXISTS goget_legacy_rpc_replay_budget (
 day TEXT PRIMARY KEY, reserved_credits INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS goget_legacy_rpc_replay_journal (
 wallet TEXT PRIMARY KEY,
 legacy_cursor TEXT NOT NULL,seed_head TEXT NOT NULL,
 before_signature TEXT,last_slot INTEGER,
 pages INTEGER NOT NULL DEFAULT 0,examined INTEGER NOT NULL DEFAULT 0,
 inserted INTEGER NOT NULL DEFAULT 0,
 status TEXT NOT NULL DEFAULT 'NOT_STARTED',
 last_checked_at TEXT NOT NULL,
 completed_at TEXT
);
CREATE TABLE IF NOT EXISTS goget_legacy_rpc_replay_signatures (
 wallet TEXT NOT NULL,signature TEXT NOT NULL,
 slot INTEGER NOT NULL,block_time TEXT,failed INTEGER NOT NULL,
 retrieved_at TEXT NOT NULL,provider TEXT NOT NULL,
 PRIMARY KEY(wallet,signature)
);
CREATE INDEX IF NOT EXISTS goget_legacy_rpc_replay_sig_slot
 ON goget_legacy_rpc_replay_signatures(wallet,slot DESC);
CREATE TABLE IF NOT EXISTS goget_legacy_rpc_replay_runs (
 run_id TEXT PRIMARY KEY,started_at TEXT NOT NULL,finished_at TEXT,
 status TEXT NOT NULL,all_wallets_planned INTEGER NOT NULL,
 all_wallets_complete INTEGER NOT NULL DEFAULT 0,
 rpc_calls INTEGER NOT NULL DEFAULT 0,credits_reserved INTEGER NOT NULL DEFAULT 0,
 checked_rows INTEGER NOT NULL DEFAULT 0,new_rows INTEGER NOT NULL DEFAULT 0,
 summary_json TEXT
);
