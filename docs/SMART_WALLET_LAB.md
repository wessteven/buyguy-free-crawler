# GOGET Smart Wallet Lab v0.1 — isolated PAPER-ONLY experiment

**Status:** deterministic rules and chronological offline replay are implemented on a draft PR branch; not deployed or connected to a trading wallet. This is not a live copy-trading service and does not claim a profitable strategy.

## What it does
- Five hard-handoff gates: SCOUT -> FILTER -> ANALYST -> GUARD -> PAPER_SNIPER.
- Only accepts a **normalized, independently enriched VERIFIED_SWAP** record. Raw Helius webhooks, transfers, and unverified screenshots are NOT eligible.
- Restricts candidates to a user-supplied monitored-wallet cohort and validates full Solana event identity.
- Fails closed on unknown true-owner concentration, developer allocation, mint/freeze/Token-2022 controls, LP custody, low liquidity, stale executable quotes, stale security evidence, or future-dated wallet scoring.
- Requires a settled, independently audited wallet history (20 closed trades minimum, positive net realized profits, profit factor >=1.2, reviewed for wash risk), plus a complete buy/sell feed through the observation time.
- Rejects tokens already more than 80% above the witnessed wallet buy price.
- Paper risk: 5% of witnessed wallet trade, $100 max, $250 total exposure, four open positions, $100 daily simulated loss stop, 9% nominal stop and 35% hypothetical target.
- Records *all* kills and reasons, plus observation-to-chain-timestamp delay and simulated paper entries/exits. A verified copied-wallet sale triggers a paper exit and records whether it happened within ten minutes of our paper entry.
- Requires fresh independently verified executable **side-specific** quotes. Adds a conservative adverse-slippage and fee assumption. Quotes are not fills; there is no guarantee that a stop can execute.

## What it does NOT do
- No signer, key, transaction submission, swap API, Helius webhook receiver, smart-wallet ranking service, persistent event store, automatic trading or production deployment.
- The source string `VERIFIED_SWAP` and booleans are **caller-supplied attestations**. The evaluator cannot verify them from raw blockchain data; that must be built and tested as a separate upstream adapter.
- No wallet list of 640 was audited or synced. A list of deployed tokens does not demonstrate profitable wallet performance.
- All replay state is in-memory until a future database-backed collector is approved. Restarting replay reconstructs the state from its entire input file.
- Wallet stats, market risk snapshots and quote evidence must be captured **as they existed at signal time**. Replays using future results are invalid.
- Helius block timestamps can be second-granular; a computed <1s difference does **not** independently prove subsecond alert delivery. Timing requires separately logged receipt and source-slot evidence.
- The daily-loss model is simulated, not a broker-side protective order. A very fast collapse can far exceed a nominal 9% stop.
- Existing production GOGET, its ten-minute discovery cron, Helius fast radar, paper account and Pocket Radar remain untouched.

## Offline replay contract

Provide an independently curated `vetted-wallets.json` containing a JSON array of Solana addresses. This **does not imply** that those wallets have been audited; the scoring must be verified before a proposal can pass.

Provide chronological `events.jsonl`, one JSON object per line. Example (placeholders show structure, **not executable evidence**):

```json
{"observedAt":"2026-10-30T02:00:00Z","event":{"chain":"solana","side":"BUY","wallet":"<verified base58 wallet>","mint":"<token mint>","pool":"<exact pool>","signature":"<valid signature>","source":"VERIFIED_SWAP","confirmed":true,"swapVerified":true,"walletTradeUsd":400,"walletBuyPriceUsd":0.00012,"blockTime":"2026-10-30T01:59:59Z","seenAt":"2026-10-30T02:00:00Z"},"context":{"market":{"mint":"<exact token mint>","pool":"<exact pool>","quotedAt":"2026-10-30T02:00:00Z","riskVerifiedAt":"2026-10-30T01:58:00Z","routeSource":"INDEPENDENT_EXECUTABLE_QUOTE","routeVerified":true,"riskVerified":true,"holderOwnerMappingVerified":true,"mintAuthorityRevoked":true,"freezeAuthorityRevoked":true,"extensionsReviewed":true,"liquidityUsd":56000,"top10OwnerPct":22,"devOwnerPct":2,"lpCustodyVerified":true,"lpStatus":"BURNED","midUsd":0.00013,"askUsd":0.000131,"bidUsd":0.000129},"walletEvidence":{"audited":true,"closedTrades":40,"profitFactor":1.4,"netRealizedPnlUsd":1400,"washRiskReviewed":true,"washRiskDetected":false,"asOfAt":"2026-10-29T23:00:00Z"},"soldSinceBuy":false,"tradeFeedComplete":true,"tradeFeedAsOf":"2026-10-30T02:00:00Z"}}
```

Later rows can have `{"observedAt":"...","kind":"MARK","mint":"...","market":{...}}` to evaluate stops/targets using a new sell-side quote, or include a verified `SELL` event for the same wallet/mint/pool.

Run:

```bash
node --test tests/smart-wallet-lab.test.mjs
node scripts/smart-wallet-replay.mjs --wallets vetted-wallets.json --input events.jsonl --output smart-wallet-results.json
```

The output file is created exclusively; it will not overwrite evidence. No production secrets are read.

## Next research milestones
1. Build an authenticated, rate-limited receiver for Helius **Enhanced SWAP** webhook candidate envelopes. Validate webhooks and deduplicate signatures persistently before processing. A `SWAP` event or wallet fee payer is **not by itself** a proven buy. Derive exact wallet deltas from transaction metadata, not descriptions.
2. Create immutable time-of-event D1 evidence with independent sellable route quotes, wallet accounting over complete historical positions, LP control/true-owner mapping and controls for fake volume/linked wallets.
3. Measure end-to-end detection lag; build a reference cohort plus rejected-signal outcomes. Compare to the existing GOGET momentum strategy, avoiding look-ahead and survivor bias. Only then consider unattended paper runs.
4. Independent safety review and explicit new authorization before any real-money execution; prefer no real trading by default.

Architecture uses the existing project's Helius experience but does **not** assume the tested 30-second *pool-price* collector can observe every wallet trade in <1s.

Source: `src/smart-wallet-lab.mjs`; offline runner: `scripts/smart-wallet-replay.mjs`; tests: `tests/smart-wallet-lab.test.mjs`.
