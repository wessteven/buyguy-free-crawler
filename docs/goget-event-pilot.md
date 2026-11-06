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

## Superseded: Dex aggregate admission investigated on 2026-11-07

The D1 readiness audit found **0** exact Solana pool `observations` fresher than
30 minutes, but **47** with observations within two hours and **5** exact-pool
native candle sources within 30 minutes. Treat the old `observations` age
as a defect/availability limitation; do **not** backdate these snapshots.

The pilot now draws candidate **identities only** from the preceding two-hour
observation window, checks all shared Dex/presignal cooldowns, performs
**at most one** bounded public DexScreener exact-pair lookup (30 pools), and
requires precisely ten exact matching Solana pair + base mint identities
with positive price and reported liquidity >= $1,000. This is one receipt-
timestamped indicative quote, *not* a provider-supplied chain event time,
a guarantee of executable liquidity or proof of a real trade. An unsupported
pair, mismatch, provider 429, timeout, incomplete quote response or fewer
than ten eligible matches **fails closed** without reserving Helius calls.

Admission proof (the exact ten pools, mint, quote receipt and provider
reported liquidity) is stored in the new pilot run's existing `notes` field;
existing scheduled observations are not modified. `/status` and the
one-hour outcome evaluation must still show absent scheduled baseline
data as **unknown**, not infer an answer from this new admission quote.
The user-requested fair stream versus scheduled comparison only exists if
prospective as-of and later exact-pool prices both become available.

## Superseded: public Solana RPC on-chain admission (2026-11-07)

The exact Dex pool validation was **not** successful in production: the provider
returned HTTP 429. We preserve that finding; no Dex cooldowns are shortened or
modified. One independent public Solana `getMultipleAccounts` probe returned
**28 exact owner/layout/mint-verified accounts out of 30**: 25 PumpSwap, 3
Raydium CPMM, 2 unsupported programs, no mint mismatches (source GitHub
workflow: `goget-event-pilot-onchain-probe.yml`).

The active stream admission now:
- Reads up to 30 exact recent existing GOGET pool identities (historical
  observations no older than two hours, identity only).
- Calls public Solana RPC **once**, `getMultipleAccounts`, commitment
  `confirmed`, base64 full state, 16-second timeout and 500k response cap.
  This is not a Helius call and does not alter the separate Dex cooldown.
- Checks Solana account program owner, trusted PumpSwap/Raydium layout
  discriminators and exact original target mint. Raydium pools must have
  swap flag enabled. Requires **ten** matched accounts; otherwise no
  stream starts or Helius credits are reserved.
- Retains all original 200-credit Helius forward reservation, daily caps,
  original webhook-control latch, 10 pools, 60-minute duration and exact
  retrospective RPC reconciliation.
- Records source, confirmed slot, verified program owner, exact mint,
  receipt timestamp and historical baseline observation timestamp in
  the run notes. **No current USD price, vault reserve, executable depth,
  future momentum or trade safety is asserted.**

This displaces, rather than weakens, the rate-limited Dex admission route.
The scheduled comparator must still be supported by fresh original
`observations`; missing comparison rows remain **unknown**.

## Active quota-guarded Helius on-chain admission (2026-11-07, V2)

The **GitHub runner** public RPC check confirmed 28/30 on-chain candidate
pool/mint identities, but the deployed **Cloudflare Worker** could not reach
that public RPC endpoint (HTTP error). The current code now uses the
existing Helius RPC endpoint for the *same one batched*
`getMultipleAccounts` request (up to 30 accounts, 16s/500k caps), relying
on official PumpSwap/Raydium binary layouts and exact pool+mint matching.
It does not call DexScreener or change shared provider cooldown state.

Before the FIRST billable Helius request the one-time admission attempt is
persisted in `goget_event_pilot_runs` for the UTC day. The complete
**200-credit reservation** is atomically made in
`goget_rpc_source_budget`, protecting the original remaining 3-wallet
forward cycles, separate decode reserve, original webhook ARMED control and
20k combined cap. The admission request itself is pre-recorded as
`rpc_attempts=1`, even if the HTTP call fails. The initial verified
roster is written only after ten exact owner/layout/mint proofs succeed.
Every failure remains explicit as ADMISSION_UNVERIFIED / BUDGET_DEFERRED
with no started WebSocket.

At the end, the ledger reports **one Helius admission attempt plus ten
independent archival reconciliation attempts** (maximum eleven calls
total), while always recording provider billing as unknown until actual
project usage is measured. Ten subscriptions still require real ACKs,
continuous minutes and end-of-run independently verified signature
coverage. The current code never equates a pool account, WebSocket
notification or aggregate quote to an executable trade.

A one-day admitted/failed attempt cannot rearm by silently changing a
date or rotating a ledger; this prevents repeated credits from appearing
to be free. The streaming window remains exactly sixty minutes and
paper-only.
