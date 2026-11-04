-- Separate retrospective native SOL/token transfer-leg evidence.
-- Never substitute into the original forward USD outcomes or price recoveries.
CREATE TABLE IF NOT EXISTS goget_historical_native_ratio_audit (
 mint TEXT NOT NULL,
 bucket TEXT NOT NULL,
 horizon_min INTEGER NOT NULL,
 due_at TEXT NOT NULL,
 pool TEXT NOT NULL,
 status TEXT NOT NULL,
 tx_signature TEXT,
 tx_block_time TEXT,
 direction TEXT,
 sol_per_token REAL,
 wsol_flow REAL,
 token_flow REAL,
 source TEXT NOT NULL,
 as_of TEXT NOT NULL,
 usd_price_reconstructed INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(mint,bucket,horizon_min)
);
