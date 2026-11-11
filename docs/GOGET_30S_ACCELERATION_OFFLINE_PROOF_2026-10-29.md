# GOGET / WHAT'S GOOD — 30-second early acceleration evidence proof (29 Oct 2026)

**Status: ISOLATED OFFLINE RESEARCH, NOT DEPLOYED.** Separate from the working GOGET production 10-minute cron, existing known-pool 30-second price collector, D1/history, paper trading, and draft Pocket Radar v0.8 PR #5.

## Why this exists

The prior MIHAO causal 15-minute replay requires 21 completed 15-minute bars to warm up EMA21 (~5 hours 15 minutes). It cannot identify a newly created Solana curve during its first minutes. The 20 Oct Night Lab cohort showed brief intrabar highs before two 15-minute closes could confirm trend.

We now have a deterministic, bounded **30-second swap-activity research classifier** requiring just two complete back-to-back 30-second windows. The threshold selection is a **hypothesis** for later calibration, not a buy rule or profitability claim.

## Exact prototype rules (not calibrated)

- Two adjacent, source-complete **30-second windows** (the first 60 seconds of comparable observations), not 5+ hours of EMA history.
- First window ≥3 buy-classified transactions; second window ≥5 buys.
- Second/first buy-count acceleration ≥1.3×; latest-window buys/sells ≥1.5×.
- ≥5 distinct *fee payer accounts* across both windows; these are **NOT verified independent beneficial buyers**.
- Largest fee payer contributing >50% of buy transactions receives a concentration warning.
- 120-second research-episode deduplication; all transaction signatures deduplicated and conflicting duplicates flagged.
- Missing source coverage, unrecognized transactions, invalid signatures or incomplete windows do **not** become positive evidence.
- Outputs never claim independently verified unique buyers, safety, confirmed liquidity, current price, or executable exit. **No buy qualification**.

Thresholds above are provisional and were not optimized against this sample.

## Offline live-data-source replay

**Source:** existing archived Helius-enhanced transaction evidence already in repository main (frozen prior to this detector), no Helius API request:

- WiSP, `data/night-lab/2026-10-20/2026-10-20T1518Z-cycle11-wisp-paginated-raw-swaps.json`.
- PIKA, `data/night-lab/2026-10-20/2026-10-20T1611Z-cycle12-pika-sampled-trades.json`.

Result: [GitHub Actions run #40860362607](https://github.com/wessteven/buyguy-free-crawler/actions/runs/40860362607), artifact `GOGET-30S-REPLAY-RESEARCH`, artifact ID `12891556081`. Tests: [full regression #40860362822](https://github.com/wessteven/buyguy-free-crawler/actions/runs/40860362822), all passed.

| Archived pool | Normalized signed observations | Complete 30s windows | Raw hypothesis windows | Deduplicated research episodes |
|---|---:|---:|---:|---:|
| WiSP | 699 | 10 | 2 | 2 |
| PIKA | 200 | 20 | 4 | 3 |

**WiSP:**
- 15:12 UTC retrospective hypothetical first calculation: 21 → 35 buys in consecutive half-minutes; latest buy/sell 35:8, fee payer diversity 20, **concentration warning**.
- 15:14 UTC hypothetical second calculation: 5 → 11 buys, latest buy/sell 11:5, seven payer accounts, **concentration warning**.
- But original research archive was only retrieved **15:16:00.541 UTC**. The 15:12 signal thus is **not** evidence of a 15:12 GOGET alert. The archive receipt lag relative to hypothetical window end was roughly 241 seconds, and about 121 seconds for the second.

**PIKA:**
- Hypothetical window ends 16:05, 16:07, 16:09:30 UTC; three distinct episodes from four raw hits, without concentration warnings under this rule.
- However the archived sample was retrieved at **16:10:12.076 UTC**. The 16:05 hypothetical signal was retroactively calculable, not observed by GOGET in real time.
- Recorded fee payer count is not independent-beneficial-buyer verification, and no price/exit execution was tested.

The entire analysis is research on previously *selected* WiSP and PIKA. **Neither an empirical false-positive rate nor probability of catching a new runner is established.**

## Speed targets, not performance claims

Proposed measured event path (only on eligible protocols with active streams):

1. `birth_tx_chain_time`: transaction first observed on-chain, preserve signature and slot.
2. `collector_received_at`: actual Helius source payload receipt time; measure chain-to-provider delivery, not assumed.
3. `first_eligible_window_end`: after sufficient contiguous 30-second windows, at least 60 seconds of evidence; depending on alignment and completeness can take 60–90+ seconds.
4. `classification_at`: actual processing completion timestamp; target less than 2 seconds after the second eligible complete window.
5. `alert_emitted_at` / `device_received_at`: record transport and Android push delay separately; target under 5 seconds for delivery once evidence exists, not currently measured.

A separate **birth-only watch** can arrive sooner than a two-window acceleration hypothesis. Do not present a 30-second price refresh or historical window end as actual 30-second discovery. Real WebSocket gaps, reconnect/backfill, provider subscriptions, quota, Android notification delays and unsupported protocols remain open blockers.

## Engineering constraints

- Pure module: `src/micro-acceleration-research.mjs`, strictly no network or D1.
- Regression tests: `tests/micro-acceleration-research.test.mjs`; provenance and no-lookahead, duplicate rejection, complete windows, payer concentration, and recorded historical fixtures.
- Offline runner: `scripts/replay-micro-acceleration-research.mjs`; archival evidence only.
- Artifact workflow: `.github/workflows/micro-acceleration-research.yml`, **no provider calls or credentials**.
- Preserve draft PR #6; no merge/deploy, new cron or production alert enabled.

**Next gate:** a read-only time-stamped WebSocket observation with actual receipt, source freshness and gap metrics; separate verification of curve-state/reserve liquidity; then fixed-threshold replay across a population containing all launch outcomes, not just selected movers.
