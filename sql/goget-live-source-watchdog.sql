-- Independent five-minute Cloudflare trigger evidence. No source or trading rows are changed.
CREATE TABLE IF NOT EXISTS goget_live_source_watchdog_runs (
 run_id TEXT PRIMARY KEY,slot_utc TEXT NOT NULL,trigger TEXT NOT NULL,
 observed_at TEXT NOT NULL,status TEXT NOT NULL,
 last_provider_delivery TEXT,last_normalized_event TEXT,
 provider_delivery_age_minutes INTEGER,normalized_age_minutes INTEGER,
 rpc_expected INTEGER NOT NULL,rpc_found INTEGER NOT NULL,
 rpc_stale INTEGER NOT NULL,rpc_pending INTEGER NOT NULL,
 source_wallets_with_events_24h INTEGER NOT NULL,
 prior_cron_age_minutes INTEGER,
 summary_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS goget_live_source_watchdog_recent
 ON goget_live_source_watchdog_runs(observed_at DESC);
