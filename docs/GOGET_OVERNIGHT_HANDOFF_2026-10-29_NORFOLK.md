# GOGET overnight engineering handoff — 29 October 2026, Norfolk Island time

**Timezone:** `Pacific/Norfolk`, UTC+12 on 29–30 October 2026. User is in **Norfolk Island, not Sydney**. Scheduled development cycles: 30 October 00:00, 01:00, 02:00, 03:00, 04:00 and 05:00 Norfolk local time. Morning report: **06:00 Norfolk local time**.

**Mission:** GOGET / BuyGuy / WHAT'S GOOD Fast Radar is **one ongoing project**. Detect credible new Solana launches *before* early explosive moves. Preserve existing project, no restart.

Source of truth: repo `wessteven/buyguy-free-crawler`, branch `research/launchlab-early-birth-poc`, draft PR #6: https://github.com/wessteven/buyguy-free-crawler/pull/6. Existing Pocket Radar draft PR #5 must not be merged/disrupted.

## Verified baseline before overnight

1. FLOAT real LaunchLab birth 2026-10-28 21:53:17 UTC; its first market-cap trajectory remains partly third-party/unverified.
2. Real LaunchLab **TOMMY** birth detected live: 2026-10-29 10:57:43.086 UTC Helius WebSocket receipt, verified by confirmed transaction at 10:57:43.147 UTC (~61.17 ms after notification). Approximate block-to-notice ~1.09 s, single sample only. Source [GitHub run #40861572445](https://github.com/wessteven/buyguy-free-crawler/actions/runs/40861572445). No Android device notification or sustainable coverage measured. TOMMY subsequently showed Token-2022 transfer fee and mutable metadata; never buy-qualified.
3. Pure 30-second early acceleration prototype run on pre-existing WiSP and PIKA transaction fixtures; it made **retrospective** hypotheses only, not actual live alerts, and fee payers are not independently verified beneficial buyers. [Offline audit](../docs/GOGET_30S_ACCELERATION_OFFLINE_PROOF_2026-10-29.md).
4. MIHAO 15m replay demonstrated early 17:45 potential momentum window but only one historical winner among four *same-token* alerts, not a validated predictive population. A seven-token cohort was partly censored by GeckoTerminal 429. Never claim its aggregate candle highs are executable returns.

## Pre-midnight development completed (night of 29 Oct)

- New `src/launchlab-reconnect-research.mjs`: read-only, quota-bounded `getSignaturesForAddress` checkpoint-overlap reconciliation, up to 3 pages × 100 signatures, with precise failure states for 429, missing checkpoint, invalid page, out-of-order slots, failed checkpoint or mismatching checkpoint slot. Candidates are `UNCLASSIFIED_TRANSACTION` until a later exact-transaction classifier verifies them. **This is a building block, not a live reconnect implementation or complete coverage guarantee.**
- New `tests/launchlab-reconnect-research.test.mjs` exercises overlap, pagination, unverified gaps, 429 without retries, malformed history and failure cases.
- Initially two regression cases failed because terminal checkpoint mismatch errors were overwritten by a later history-exhausted label. Fixed in commit `d3bbe7ce0d148f59c145d946b43f9bb7928cc740`.
- **Verified after fix:** [full regression GitHub run #40863924365](https://github.com/wessteven/buyguy-free-crawler/actions/runs/40863924365) passed; [offline research run #40863924380](https://github.com/wessteven/buyguy-free-crawler/actions/runs/40863924380) passed. No production changes, no new live API run, no D1 writes, no real/paper trades.

## Priority for each hourly cycle

Review last CI and previous changes **first**, then make a plan with a batch of all feasible related improvements, implement and regression-test them, and document actual results. No arbitrary limit of one improvement/hour. When CI is still running, the next cycle must check and fix it before expanding.

Recommended next engineering sequence:

1. Integrate checkpoint reconciliation into a separate **mocked/test-only** stream reconnection state machine with bounded backfill queue and source-watermark tracking. Fail closed on unresolved gaps; avoid duplicate processing. No production deploy.
2. Decode bounded backfill signature candidates with exact LaunchLab program instruction evidence; distinguish a replayed birth, already-observed birth, and unclassified transaction. Preserve actual provider receipt and observed-live timestamps separately.
3. Validate shutdown, WebSocket disconnects, half-open / stale streams, expired checkpoints, zero history, slow RPC and 429 with deterministic regression/chaos tests. Measure time and API call budget.
4. Connect short 30-second swap evidence to only verified curve/pool identities in research, with no look-ahead, wallet concentration warning, and no invented sellability/unique buyers.
5. Consider Pump.fun and Meteora initialization coverage after verifying exact programs and account layouts; add replay fixtures and confidence boundaries.

**Hard boundaries:** No production merge/deployment, no D1 schema/history changes, no production cron changes, no provider cooldown changes, no Android signing or PR #5 modifications, no trades, no keys exposed, no paid resources, no uncontrolled subscriptions. Keep all PR #6 changes draft and testable. The 06:00 report must distinguish verified tests, actual live metrics, unverified hypotheses and skipped/failed runs.
