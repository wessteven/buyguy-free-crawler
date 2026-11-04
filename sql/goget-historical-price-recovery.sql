-- Retrospective evidence is a SEPARATE dataset: never rewrite GOGET live-forward outcomes.
-- Each row has the exact original candidate mint/bucket/pool/horizon and provenance.
CREATE TABLE IF NOT EXISTS goget_historical_price_recovery (
  mint TEXT NOT NULL,
  bucket TEXT NOT NULL,
  horizon_min INTEGER NOT NULL,
  due_at TEXT NOT NULL,
  pool TEXT NOT NULL,
  reference_price_usd REAL NOT NULL,
  historical_candle_at TEXT NOT NULL,
  historical_candle_close_usd REAL NOT NULL,
  historical_change_pct REAL,
  sample_kind TEXT NOT NULL,
  source TEXT NOT NULL,
  recovered_at TEXT NOT NULL,
  PRIMARY KEY(mint,bucket,horizon_min)
);
CREATE INDEX IF NOT EXISTS goget_historical_price_recovery_recent
  ON goget_historical_price_recovery(due_at DESC);
