-- Independent coverage journal for a bounded continuation of historical
-- Helius Enhanced wallet replay. This table never updates live wallet cursors.
CREATE TABLE IF NOT EXISTS smart_wallet_helius_gap_wave_coverage (
 wallet TEXT NOT NULL,window_start TEXT NOT NULL,
 window_end_exclusive TEXT NOT NULL,status TEXT NOT NULL,
 pages_read INTEGER NOT NULL DEFAULT 0,
 examined INTEGER NOT NULL DEFAULT 0,
 stored_new INTEGER NOT NULL DEFAULT 0,
 last_signature TEXT,
 last_time INTEGER,
 provider_error TEXT,
 checked_at TEXT NOT NULL,
 PRIMARY KEY(wallet,window_start,window_end_exclusive)
);
CREATE INDEX IF NOT EXISTS smart_wallet_helius_gap_wave_recent
 ON smart_wallet_helius_gap_wave_coverage(checked_at DESC,status);
