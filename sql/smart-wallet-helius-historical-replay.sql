-- Historical Helius enhanced transaction replay, separate from live webhook observations.
-- No synthetic as-of delivery, no trade certification, no corruption of live cursors.
CREATE TABLE IF NOT EXISTS smart_wallet_helius_historical_replay (
 wallet TEXT NOT NULL,
 signature TEXT NOT NULL,
 slot INTEGER NOT NULL,
 block_time TEXT NOT NULL,
 tx_type TEXT NOT NULL,
 tx_source TEXT,
 fee_payer TEXT,
 historical_evidence_json TEXT NOT NULL,
 retrieved_at TEXT NOT NULL,
 provider TEXT NOT NULL,
 PRIMARY KEY(wallet,signature)
);
CREATE INDEX IF NOT EXISTS smart_wallet_helius_historical_replay_window
 ON smart_wallet_helius_historical_replay(block_time DESC,wallet);
