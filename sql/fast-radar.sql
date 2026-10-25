-- Additive, opt-in history only. Does not alter existing tables or paper trading.
-- Receipt samples are NOT OHLCV bars and cannot certify execution fills.
CREATE TABLE IF NOT EXISTS radar_samples (
 chain TEXT NOT NULL, pool TEXT NOT NULL, asset_key TEXT NOT NULL,
 minute TEXT NOT NULL, provider TEXT NOT NULL, received_at TEXT NOT NULL,
 source_at TEXT, price REAL NOT NULL CHECK(price>0), liquidity REAL,
 market_cap REAL, fdv REAL, volume_m5 REAL, buys_m5 INTEGER, sells_m5 INTEGER,
 unique_buyers INTEGER,
 PRIMARY KEY(chain,pool,minute)
);
-- No extra index: one primary-key index, bounded range queries by chain+pool+minute.
-- Retention: delete bounded primary-key batches per pool older than 7 days;
-- export/roll up first. Never delete existing GOGET history.
