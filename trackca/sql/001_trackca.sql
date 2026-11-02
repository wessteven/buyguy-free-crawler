-- Isolated additive trackCA tables. Existing GOGET schemas are untouched.
CREATE TABLE IF NOT EXISTS trackca_runs (
bucket INTEGER PRIMARY KEY,run_id TEXT NOT NULL,started_at TEXT NOT NULL,completed_at TEXT,status TEXT NOT NULL,
assets_total INTEGER NOT NULL DEFAULT 0,assets_identified INTEGER NOT NULL DEFAULT 0,assets_with_pools INTEGER NOT NULL DEFAULT 0,
snapshots_written INTEGER NOT NULL DEFAULT 0,warnings TEXT NOT NULL DEFAULT '[]');
CREATE TABLE IF NOT EXISTS trackca_pair_snapshots (
run_id TEXT NOT NULL,asset_id TEXT NOT NULL,chain TEXT NOT NULL,token_address TEXT NOT NULL,pool_id TEXT NOT NULL,
dex TEXT,observed_at TEXT NOT NULL,price_usd REAL,liquidity_usd REAL,volume_m5_usd REAL,volume_h1_usd REAL,volume_h24_usd REAL,
buys_m5 INTEGER,sells_m5 INTEGER,buys_h1 INTEGER,sells_h1 INTEGER,buys_h24 INTEGER,sells_h24 INTEGER,
change_m5_pct REAL,change_h1_pct REAL,change_h24_pct REAL,source TEXT NOT NULL,quote_time_status TEXT NOT NULL,
PRIMARY KEY(run_id,asset_id,pool_id));
CREATE INDEX IF NOT EXISTS ix_trackca_pairs_recent ON trackca_pair_snapshots(asset_id,observed_at DESC);
CREATE INDEX IF NOT EXISTS ix_trackca_pairs_pool ON trackca_pair_snapshots(chain,pool_id,observed_at DESC);
CREATE TABLE IF NOT EXISTS trackca_coverage (
run_id TEXT NOT NULL,asset_id TEXT NOT NULL,token_address TEXT,identity_status TEXT NOT NULL,market_status TEXT NOT NULL,
five_min_status TEXT NOT NULL,hour_status TEXT NOT NULL,day_status TEXT NOT NULL,unique_buyer_status TEXT NOT NULL,
holder_status TEXT NOT NULL,wallet_status TEXT NOT NULL,whale_status TEXT NOT NULL,sell_depth_status TEXT NOT NULL,
note TEXT NOT NULL,PRIMARY KEY(run_id,asset_id));
CREATE TABLE IF NOT EXISTS trackca_chain_metrics (
run_id TEXT PRIMARY KEY,observed_at TEXT NOT NULL,volume_24h_usd REAL,volume_7d_usd REAL,change_7d_pct REAL,
tvl_usd REAL,source TEXT NOT NULL,quality TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS trackca_ohlcv (
asset_id TEXT NOT NULL,chain TEXT NOT NULL,pool_id TEXT NOT NULL,minute_ts INTEGER NOT NULL,
open_usd REAL,high_usd REAL,low_usd REAL,close_usd REAL,volume_usd REAL,source TEXT NOT NULL,
PRIMARY KEY(asset_id,pool_id,minute_ts));
CREATE INDEX IF NOT EXISTS ix_trackca_ohlcv_latest ON trackca_ohlcv(asset_id,minute_ts DESC);
CREATE TABLE IF NOT EXISTS trackca_holder_snapshots (
asset_id TEXT NOT NULL,observed_at TEXT NOT NULL,holders_count INTEGER,source TEXT NOT NULL,status TEXT NOT NULL,
PRIMARY KEY(asset_id,observed_at));
CREATE TABLE IF NOT EXISTS trackca_transfer_events (
event_key TEXT PRIMARY KEY,asset_id TEXT NOT NULL,contract TEXT NOT NULL,tx_hash TEXT NOT NULL,observed_at TEXT NOT NULL,
occurred_at TEXT,sender TEXT,recipient TEXT,raw_value TEXT,token_decimals INTEGER,
source TEXT NOT NULL,classification TEXT NOT NULL DEFAULT 'TRANSFER_NOT_SWAP');
CREATE INDEX IF NOT EXISTS ix_trackca_transfers_recent ON trackca_transfer_events(asset_id,occurred_at DESC);
