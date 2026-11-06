# GOGET event-driven Solana pilot (independent, paper-only)

This branch introduces a **separate**, opt-in, single-run 60-minute experiment with
10 fresh exact Solana pool accounts. It does not touch the GOGET dashboard Worker,
scanner, existing Fast Radar or quote providers, 12-wallet webhook, historical
restoration, paper positions, or the three-wallet five-minute archival RPC cursor.

## Two competing, concurrent signals

1. **Event-driven**: `logsSubscribe` with **exactly one pool account** per
   Solana subscription, `confirmed` commitment. The event signal is
   **raw successful pool-mention acceleration**: at least five unique
   signatures received in one minute and 3x the previous four-minute
   per-minute average. This is **not** a buyer count, decoded swap,
   executable price, profit prediction or proof of a buy.
2. **Scheduled baseline**: latest **decision-time** GOGET
   `observations` record for the *same* pool/asset, at most ten minutes
   old, using preexisting `buys_m5` and `sells_m5`: at least six buys
   and buys >= 2*(sells+1). Missing/stale observations produce **unknown**,
   never zero. The signals measure different behaviors and must not be
   represented as equivalent raw features.

Every fully covered minute gets **ten windows** including negative controls
(no signal). Window-level evidence is written separately to
`goget_event_pilot_windows`; raw signatures and slots live in the new
SQLite Durable Object `event_pilot_events` table and are never relabeled
as trades. Before each prospective 5m, 1h and 24h outcome the as-of
scheduled price must be fresh, exact-pool and recorded before the minute
cutoff. Outcomes use only a later *exact-pool* GOGET `observations` quote
recorded between due time and due+10m. No valid future quote means
`MISSING_FUTURE_PRICE_COVERAGE`, not a winning or losing signal.

The `/status` endpoint shows a paired 1h comparison only when both
signals and their exact-pool outcome are observed and source coverage is
continuous. It reports alert counts, >=5% positives and hit ratios on
the same eligible pool/minute cohort, plus unknown denominator.
No slippage-adjusted order fills or statistical significance are claimed.

## Source completeness is a gate, not a slogan

- All ten live subscriptions must be acknowledged. No complete one-minute
  coverage without a persisted continuous subscription segment.
- All ten pools are reconciled independently by one bounded archival
  `getSignaturesForAddress(limit=100)` request each.
- A page of 1,000 still inside the pilot interval, a missing block timestamp,
  a provider error, a disconnect, a worker restart, stream parse errors, or
  missing one-minute windows means **partial / unverified coverage**.
- WebSocket events are de-duplicated by exact pool + signature in SQLite
  and persisted before counting. D1 receipt rows are inserted idempotently.
- Any D1 write error fails loudly; a minute cursor advances only after all
  ten of its windows and eligible forward-outcome jobs have been persisted.
  The stop routine cannot silently skip an unflushed complete-minute backlog.
- The independent three-wallet signature archive remains untouched and
  retains its full original three-wallet denominator.

## Cost and admission control

This experiment is **not free simply because it uses WebSockets**.
Outbound WebSockets prevent Durable Object hibernation and incur
Cloudflare duration costs; Helius charges for streamed bytes. The pilot
has a hard 60-minute runtime, 4,000,000-byte receive cap, 12,000 unique
event cap, maximum ten archival reconciliation calls and exactly ten
subscribed pool addresses. Its conservative Helius reservation is
**200 credits total** (up to 80 estimated for streaming bytes + 100
for archival calls + 20 contingency). The remaining 3-wallet five-minute
cycle reservations through UTC midnight and the independent decoding
reservations are checked before admission against the original 9,000
shared RPC cap; original webhook control must be ARMED and the combined
20,000 local daily safeguard respected. No budget headroom -> **do not
start**; do not weaken the existing controls.

D1 records reserved credits, bytes measured, estimated stream credits,
reconciliation attempts and source quality. Actual Helius invoiced
credits and actual Cloudflare USD costs remain **unverified** until
reconciled with the providers' billing/usage dashboards: no local
estimate will be mislabeled as provider-measured spending. The outgoing
subscription's total duration is bounded operationally by a Durable
Object alarm and a separate five-minute cron; an unexpected failure
to execute alarms may still prolong an outgoing connection, so verify
runtime metrics after deployment.

## Deployment / observing results

`wrangler.event-pilot.toml` defines a wholly separate
`goget-event-stream-pilot` Worker and SQLite Durable Object with the
**existing** D1 database. The new D1 SQL applies only six isolated
tables and two indexes. The GitHub workflow:

1. Runs the full existing JavaScript and Python regression suites and
   repeated in-memory schema validation.
2. Migrates only the isolated D1 tables, deploys the new Worker and
   installs narrowly scoped credentials. No private keys, orders,
   approvals, or trading.
3. Verifies `/health` against the exact expected build.
4. Attempts one authenticated `POST /start`. It fails closed unless it
   finds **ten fresh exact pools**, all original budget gates pass and
   all credentials exist. A failed admission is **not a live pilot**.

Authenticated `GET /status` exposes the run, costs, independent
reconciliation and paired one-hour outcomes. Pending 24-hour outcomes
are evaluated by the new D1-only five-minute scheduler after the stream
ends. Do not claim success before checking live subscription ACKs,
received events, independent RPC coverage for **all 10** pools, complete
outcome denominators, and both provider usage ledgers.

## Acceptance criteria

- **Implementation:** source, tests, isolated schema, deployment and
  safety controls all green.
- **Live reception:** ten active ACKed subscriptions, new signatures,
  fresh slots, zero unexpected disconnects and a growing durable ledger.
- **Proven coverage:** all ten archival source checks performed, no
  truncated or malformed pages, no reconciliation misses, no invalid
  one-minute coverage. If unattainable, explicitly report the failed
  pool(s) and downgrade the result.
- **Usable comparison:** matched, contemporaneous baseline and stream
  features, separately matured 5m / 1h / 24h exact-pool outcomes,
  no price leakage, unknowns counted separately. A 60-minute pilot is
  not enough to establish predictive advantage.
- **Real costs:** reconcile measured Helius usage and Cloudflare
  billed usage before scaling above ten pools or extending the runtime.

## GO

Go only after the above checks. The original collector and project
coverage must never be silently reduced to make room for this pilot.
