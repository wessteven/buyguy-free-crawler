-- Additive, isolated, time-bounded GOGET wallet webhook storage. Never used as trade certification.
CREATE TABLE IF NOT EXISTS smart_wallet_webhook_events (
 wallet TEXT NOT NULL, signature TEXT NOT NULL, observed_at TEXT NOT NULL,
 block_time TEXT, slot INTEGER, classification TEXT NOT NULL,
 delay_ms INTEGER, fee_payer_observed INTEGER NOT NULL DEFAULT 0,
 evidence_json TEXT NOT NULL,
 PRIMARY KEY(wallet,signature)
);
CREATE INDEX IF NOT EXISTS smart_wallet_webhook_recent ON smart_wallet_webhook_events(observed_at DESC);
CREATE TABLE IF NOT EXISTS smart_wallet_webhook_budget (
 day TEXT PRIMARY KEY, reserved INTEGER NOT NULL DEFAULT 0
);

-- Original provider source archive, one exact transaction signature per payload.
-- Stores only bounded, valid JSON emitted by the authenticated webhook receiver.
CREATE TABLE IF NOT EXISTS smart_wallet_webhook_raw (
 signature TEXT PRIMARY KEY,slot INTEGER NOT NULL,observed_at TEXT NOT NULL,
 byte_length INTEGER NOT NULL,raw_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS smart_wallet_webhook_raw_recent
 ON smart_wallet_webhook_raw(observed_at DESC);
CREATE TABLE IF NOT EXISTS smart_wallet_webhook_raw_budget (
 day TEXT PRIMARY KEY,bytes_reserved INTEGER NOT NULL DEFAULT 0
);
