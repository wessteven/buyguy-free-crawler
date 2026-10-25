# GOGET fast radar: 30-second target

Status: deployed on Workers Free and tested in production on 2026-10-25.
The scheduler produced ~30-second intervals; the live feed proof FAILED because
both quote providers were in HTTP-429 cooldown. See
[the measured proof report](FAST_RADAR_PROOF_2026-10-25.md).
The five-pool experiment has a ten-minute automatic stop.

## Architecture and integration choices

Keep existing ten-minute discovery, hard refresh, OUR SCORE, clean-slate cutoff,
30-minute provider cooldown, history and paper trading intact. Add an isolated
Durable Object, exported by the existing dashboard Worker, with a 30-second alarm.
It targets five current ALIVE/STATIC exact pools; reselects targets every five
minutes. This is a hot-pool quote lane, not a claim of whole-universe 30s discovery.
An alarm aims for start-to-start 30 seconds; slow requests or platform scheduling
can cause delays. There is no guaranteed 30-second upstream freshness.

The WHAT'S GOOD page has a separate fast-radar panel. Signed-session/bearer auth
protects GET /api/fast-radar and POST /api/fast-radar/start or /stop. The GET reads
only the singleton Durable Object snapshot, not D1. Background tab polling pauses.
The main rankings are deliberately not overwritten with unverified quote scores.

Use existing DEX Screener direct REST batching (one request per represented chain,
maximum two requests per cycle) instead of installing a third-party MCP wrapper.
Fallback: at most one exact Solana GeckoTerminal pool per minute, rotating gaps.
A successful provider call does not imply upstream prices are new.

Provider juggling means capability-aware budgets, caching, cooldowns and backoff,
not proxy/key/account rotation or bypassing quotas. Both fast-lane providers have
persisted singleton cooldowns; the fast lane also reads existing discovery cooldown
leases and publishes HTTP-429 cooldowns back to those leases. This does not yet
centralize budgets of all older crawler/deep-audit implementations. DEX profiles and token quotes have separate documented rate buckets; a legacy
profile cooldown is distinguished only with an exact timestamp-matched run error.
Unknown scope stays blocked; quote 429s have their own persisted lease.
A full shared provider broker is a follow-up before expanding the hot set.

TradingView official MCP is useful interactively but beta data is delayed and
unattended cloud clients are outside its supported beta scope. CCXT is valuable
for CEX macro data but does not fill the exact DEX pool gap. DexPaprika is a useful
next independent adapter once exact chain/pool coverage has passed live fixtures.
Lightweight Charts is a future UI choice, not a data provider. No new third-party
packages are required for this fast lane.

## Efficient D1 accumulation

Latest quotes, provider health/cooldowns, target list, sample budgets and scheduler
state live in one Durable Object. During the ten-minute trial, a singleton
fast-radar:trial-proof lease records bounded diagnostics for authenticated D1
verification. This adds ~40 index-inclusive row writes per full trial. D1 receives only one sampled quote per exact
(chain,pool,minute), with asset identity, provider, receipt time, nullable source
time, price, liquidity, market cap and FDV separately, five-minute volume and
buy/sell transaction counts. Unique buyers remain NULL, never inferred from buys.
These are sampled quotes, NOT OHLCV or verified trades; do not certify paper fills
or derive unique buyers by subtracting overlapping five-minute counts.

sql/fast-radar.sql adds one isolated table. It never alters existing history.
Primary key supports bounded exact-pool history queries. Do not scan all history
for every page load. Five pools produce at most 7,200 sample inserts/day, usually
14,400 row writes including the primary-key index. Code conservatively reserves
three writes per sample slot: 21,600/day, with a 25,000/day fast-lane budget and a
200,000 reserved sample lifetime ceiling (~28 days with all slots occupied).
The ceiling pauses history, not live snapshots. Failed/empty sample batches may
consume reserved slots; safety is preferred to retry amplification. The budget
is local to this feature, NOT an account-wide Cloudflare spending cap. Read actual
D1 meta.rows_written plus dashboard account metrics to calibrate index overhead.
429 lease writes and other GOGET traffic consume additional account quota.

No raw provider JSON, repeated metadata, full holder lists, deep contract checks,
per-view history writes, fabricated candle bars or private credentials are stored.
Next storage phase: measured 1m/5m aggregates and retention/export, retaining
signal-time snapshots and important events. Do not silently discard existing data.

## Request/cost model (30-day month)

- 2,880 cycles/day; 86,400 alarm cycles/month.
- DEX: up to 5,760 requests/day for two represented chains (four/minute).
- Gecko fallback: at most 1,440/day (one/minute), zero when DEX covers targets.
- D1 target selection every five minutes; two exact-key lease lookups per cycle.
- Dashboard snapshot polls every thirty seconds while visible; no D1 reads.
- DO storage/alarm operations have their own billing/allowances. Benchmark before
  assuming this is entirely inside the $5 base. D1 limits are account-wide.

SQLite Durable Objects are available on Workers Free as well as Paid, so a small
trial does not require buying a plan. Free limits fail closed when exhausted.
Workers Paid starts at US$5/month, not A$5, with usage-based overages. D1 Paid
includes 25 billion reads/month, 50 million writes/month and 5 GB total storage;
Free has 5 million reads/day, 100,000 writes/day and 5 GB total storage (with a
separate per-database limit). Buying Workers does not buy premium provider data.

Sources checked 2026-10-25:
- https://developers.cloudflare.com/workers/platform/pricing/
- https://developers.cloudflare.com/d1/platform/pricing/
- https://developers.cloudflare.com/durable-objects/api/alarms/
- https://developers.cloudflare.com/durable-objects/platform/pricing/
- https://docs.dexscreener.com/api/reference
- https://www.tradingview.com/support/solutions/43000795700-mcp-server-faq/

## Deployment and trial controls

Bindings and SQLite DO migration are now in wrangler.toml. Deployment runs
regression tests, applies the additive radar_samples table, deploys the Worker,
and attempts the market-feed proof. Deployments are restricted to main.

The existing ten-minute cron bootstraps the experiment once. It does not restart
completed or explicitly stopped trials. The authenticated Start button begins a
new ten-minute experiment; Stop deletes the alarm and preserves history. Provider
cooldowns survive stop/restart and are never reset to force requests through.

Because Cloudflare bot protection blocks the GitHub runner's public-URL requests,
the proof reads internal alarm records through authenticated D1. It does not
weaken protection or claim user-browser access is verified. The read-only
Fast radar live status GitHub workflow can report the last bounded trial state.

No billing upgrade was made. Do not widen the five-pool trial or enable permanent
polling until repeated real quotes, source age where available, D1 write cost and
provider budgets have been demonstrated. The observed external HTTP 429s are
not fixed by buying Workers Paid. Disable FAST_RADAR_ENABLED and redeploy for the
persistent kill switch; keep the DO migration and stored history intact.
