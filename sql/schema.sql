CREATE TABLE IF NOT EXISTS runs (
 id INTEGER PRIMARY KEY AUTOINCREMENT, started_at TEXT NOT NULL, completed_at TEXT,
 state TEXT NOT NULL, discovered INTEGER DEFAULT 0, observed INTEGER DEFAULT 0,
 buys INTEGER DEFAULT 0, sells INTEGER DEFAULT 0, provider_errors TEXT DEFAULT '[]'
);
CREATE TABLE IF NOT EXISTS leases (name TEXT PRIMARY KEY, expires_at INTEGER NOT NULL, token TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS assets (
 asset_key TEXT PRIMARY KEY, chain TEXT NOT NULL, address TEXT NOT NULL, symbol TEXT,
 name TEXT, pool TEXT, provider TEXT, status TEXT NOT NULL DEFAULT 'STATIC',
 risk_status TEXT DEFAULT 'UNVERIFIED', risk_note TEXT,
 first_seen TEXT NOT NULL, pool_created TEXT, last_seen TEXT,
 observations INTEGER NOT NULL DEFAULT 0, misses INTEGER NOT NULL DEFAULT 0,
 score INTEGER NOT NULL DEFAULT 0, momentum_streak INTEGER NOT NULL DEFAULT 0,
 price REAL, liquidity REAL, market_cap REAL, buys_m5 INTEGER, sells_m5 INTEGER,
 tx_m5 INTEGER, change_h1 REAL, volume_h24 REAL, last_action TEXT,
 pinned INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS asset_state_rank ON assets(status,score DESC);
CREATE TABLE IF NOT EXISTS observations (
 id INTEGER PRIMARY KEY AUTOINCREMENT, asset_key TEXT NOT NULL, seen_at TEXT NOT NULL,
 pool TEXT NOT NULL, provider TEXT NOT NULL, price REAL NOT NULL,
 liquidity REAL, buys_m5 INTEGER, sells_m5 INTEGER, score INTEGER,
 UNIQUE(asset_key,seen_at)
);
CREATE INDEX IF NOT EXISTS ob_age ON observations(asset_key,seen_at DESC);
CREATE TABLE IF NOT EXISTS paper_account (
 account TEXT PRIMARY KEY, starting_cash REAL NOT NULL, cash REAL NOT NULL,
 realised REAL NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS paper_positions (
 id TEXT PRIMARY KEY, asset_key TEXT NOT NULL, pool TEXT NOT NULL,
 opened_at TEXT NOT NULL, units REAL NOT NULL, entry_usd REAL NOT NULL,
 cost_usd REAL NOT NULL, stop_usd REAL NOT NULL, target_usd REAL NOT NULL,
 status TEXT NOT NULL DEFAULT 'OPEN', closed_at TEXT, exit_usd REAL,
 realised_usd REAL, evidence TEXT NOT NULL DEFAULT 'INDICATIVE_QUOTE_ONLY'
);
CREATE INDEX IF NOT EXISTS open_positions ON paper_positions(status,asset_key);
CREATE TABLE IF NOT EXISTS paper_trades (
 id INTEGER PRIMARY KEY AUTOINCREMENT, position_id TEXT NOT NULL, asset_key TEXT NOT NULL,
 at TEXT NOT NULL, side TEXT NOT NULL, quote_price REAL NOT NULL,
 execution_assumption REAL NOT NULL, units REAL NOT NULL, cash_delta REAL NOT NULL,
 fee REAL NOT NULL, reason TEXT NOT NULL, evidence TEXT NOT NULL DEFAULT 'INDICATIVE_QUOTE_ONLY'
);
CREATE TABLE IF NOT EXISTS predictions (
 id INTEGER PRIMARY KEY AUTOINCREMENT, asset_key TEXT NOT NULL,
 created_at TEXT NOT NULL, due_at TEXT NOT NULL, horizon_min INTEGER NOT NULL,
 start_price REAL NOT NULL, score INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'PENDING',
 observed_price REAL, observed_at TEXT, change_pct REAL,
 UNIQUE(asset_key,created_at,horizon_min)
);
CREATE INDEX IF NOT EXISTS due_predictions ON predictions(status,due_at);
CREATE TABLE IF NOT EXISTS research_events (
 id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, asset_key TEXT,
 kind TEXT NOT NULL, note TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS observation_ttl ON observations(seen_at);
CREATE INDEX IF NOT EXISTS research_event_asset_kind_id ON research_events(asset_key,kind,id DESC);
CREATE INDEX IF NOT EXISTS research_event_kind_id ON research_events(kind,id DESC);


-- OUR SCORE v1: immutable decision-time snapshots and separately measured forward
-- outcomes. Do not backfill using today's score. No trade execution involved.
CREATE TABLE IF NOT EXISTS score_snapshots (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 asset_key TEXT NOT NULL,
 chain TEXT NOT NULL,
 address TEXT NOT NULL,
 symbol TEXT,
 cohort TEXT NOT NULL DEFAULT 'TOP5' CHECK(cohort IN ('TOP5','COMPARATOR')),
 pool TEXT NOT NULL,
 captured_at TEXT NOT NULL,
 version INTEGER NOT NULL DEFAULT 1,
 entry_price REAL NOT NULL CHECK(entry_price>0),
 our_score REAL NOT NULL CHECK(our_score>=0 AND our_score<=100),
 market_score REAL,
 safety_score REAL,
 liquidity REAL,
 market_cap REAL,
 buys_m5 INTEGER,
 sells_m5 INTEGER,
 quote_seen_at TEXT NOT NULL,
 UNIQUE(asset_key,captured_at,version)
);
CREATE INDEX IF NOT EXISTS score_snapshots_capture ON score_snapshots(captured_at DESC);
CREATE TABLE IF NOT EXISTS score_outcomes (
 snapshot_id INTEGER NOT NULL,
 horizon_min INTEGER NOT NULL,
 due_at TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'PENDING',
 observed_at TEXT,
 observed_price REAL,
 return_pct REAL,
 PRIMARY KEY(snapshot_id,horizon_min)
);
CREATE INDEX IF NOT EXISTS score_outcomes_due ON score_outcomes(status,due_at);
