-- Independent forensic evidence for originally missing retrospective USD outcomes.
-- NO ALTER/UPDATE/DELETE of original forward-only outcome, replay, or price tables.
CREATE TABLE IF NOT EXISTS goget_historical_pool_activity_audit (
  mint TEXT NOT NULL,
  bucket TEXT NOT NULL,
  horizon_min INTEGER NOT NULL,
  due_at TEXT NOT NULL,
  pool TEXT NOT NULL,
  classification TEXT NOT NULL,
  enhanced_history_complete INTEGER NOT NULL,
  pages_read INTEGER NOT NULL,
  requested_helius_calls INTEGER NOT NULL,
  nearby_tx_count INTEGER NOT NULL,
  exact_pool_tx_count INTEGER NOT NULL,
  labeled_swap_tx_count INTEGER NOT NULL,
  exact_mint_swap_hint_count INTEGER NOT NULL,
  unknown_pool_tx_count INTEGER NOT NULL,
  signatures_json TEXT NOT NULL,
  provider_failure TEXT,
  checked_at TEXT NOT NULL,
  source TEXT NOT NULL,
  reconstructed_usd_price INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(mint,bucket,horizon_min)
);
CREATE INDEX IF NOT EXISTS goget_historical_pool_activity_class
  ON goget_historical_pool_activity_audit(classification,due_at);
