-- GOGET isolated 5-minute 3-wallet read-only Solana source sensor.
-- New tables only: never mutate legacy live cursors, 12-wallet webhook, or historical tables.
CREATE TABLE IF NOT EXISTS goget_rpc_source_budget (
 day TEXT PRIMARY KEY,reserved_credits INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS goget_rpc_source_lease (
 id TEXT PRIMARY KEY,owner TEXT NOT NULL,until_ms INTEGER NOT NULL
);
INSERT OR IGNORE INTO goget_rpc_source_lease(id,owner,until_ms)
 VALUES('runner','',0);
CREATE TABLE IF NOT EXISTS goget_rpc_source_cycles (
 slot_utc TEXT PRIMARY KEY,trigger TEXT NOT NULL,started_at TEXT NOT NULL,
 completed_at TEXT,status TEXT NOT NULL,helius_calls INTEGER NOT NULL DEFAULT 0,
 credits_reserved INTEGER NOT NULL DEFAULT 0,
 wallets_scanned INTEGER NOT NULL DEFAULT 0,
 signatures_saved INTEGER NOT NULL DEFAULT 0,
 source_gaps INTEGER NOT NULL DEFAULT 0,summary_json TEXT
);
CREATE TABLE IF NOT EXISTS goget_rpc_source_wallets (
 wallet TEXT PRIMARY KEY,head_signature TEXT NOT NULL,last_checked_at TEXT NOT NULL,
 last_connected_at TEXT,gaps INTEGER NOT NULL DEFAULT 0,
 status TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS goget_rpc_source_signatures (
 wallet TEXT NOT NULL,signature TEXT NOT NULL,slot INTEGER NOT NULL,
 block_time TEXT,failed INTEGER NOT NULL,observed_at TEXT NOT NULL,
 source TEXT NOT NULL,PRIMARY KEY(wallet,signature)
);
CREATE INDEX IF NOT EXISTS goget_rpc_source_sig_time
 ON goget_rpc_source_signatures(wallet,observed_at DESC);
CREATE TABLE IF NOT EXISTS goget_rpc_source_gaps (
 wallet TEXT NOT NULL,previous_head TEXT NOT NULL,new_head TEXT NOT NULL,
 first_noted_at TEXT NOT NULL,scanned_page_size INTEGER NOT NULL,
 reason TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'UNRESOLVED',
 PRIMARY KEY(wallet,previous_head,new_head)
);
