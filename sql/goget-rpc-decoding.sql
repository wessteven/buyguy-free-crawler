-- Only isolated research tables. DO NOT alter original forward or restored historic records.
CREATE TABLE IF NOT EXISTS goget_rpc_decode_budget (
 day TEXT PRIMARY KEY,reserved_credits INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS goget_rpc_decoded_signatures (
 wallet TEXT NOT NULL,signature TEXT NOT NULL,source_slot INTEGER NOT NULL,
 checked_at TEXT NOT NULL,decode_status TEXT NOT NULL,
 source_observed_at TEXT,
 decoded_summary_json TEXT NOT NULL,
 provider TEXT NOT NULL,PRIMARY KEY(wallet,signature));
CREATE INDEX IF NOT EXISTS goget_rpc_decode_wallet_time
 ON goget_rpc_decoded_signatures(wallet,checked_at DESC);
CREATE TABLE IF NOT EXISTS goget_rpc_decode_attempts (
 wallet TEXT NOT NULL,signature TEXT NOT NULL,attempts INTEGER NOT NULL,
 last_at TEXT NOT NULL,next_eligible_at TEXT NOT NULL,
 status TEXT NOT NULL,PRIMARY KEY(wallet,signature));
CREATE TABLE IF NOT EXISTS goget_rpc_decode_runs (
 run_id TEXT PRIMARY KEY,started_at TEXT NOT NULL,finished_at TEXT,
 status TEXT NOT NULL,wallets_expected INTEGER NOT NULL,
 wallets_considered INTEGER NOT NULL,requested_rpc INTEGER NOT NULL,
 reserved_credits INTEGER NOT NULL,decoded INTEGER NOT NULL,
 summary_json TEXT NOT NULL);
