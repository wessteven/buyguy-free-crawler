# GOGET overnight cycle 02 — 30 October 2026, 01:00 Norfolk Island (UTC+12)

**Scope:** Same GOGET / BuyGuy / WHAT'S GOOD early Solana discovery engine, draft PR #6, branch research/launchlab-early-birth-poc. This is NOT a new engine or production integration. Preserve draft Android Pocket Radar PR #5, production known-pool 30s collector, 10-minute cron, D1/history, cooldowns, credentials, paper wallet and trading.

## Prior cycle review

Cycle 01 handoff: [cycle-01](GOGET_OVERNIGHT_CYCLE_01_2026-10-30_NORFOLK.md). Its latest commit 6153468c46361fbebc1531363e57bd664a2f0cca passed [full regression](https://github.com/wessteven/buyguy-free-crawler/actions/runs/40870041248) and [archived 30-second offline evidence](https://github.com/wessteven/buyguy-free-crawler/actions/runs/40870041313). It added manual capped historical LaunchLab checkpoint and transaction review, but no live reconnect state machine.

## This cycle: plan and implemented improvements

1. **Opt-in finite WebSocket reconnect research state machine** in src/launchlab-reconnect-session-research.mjs. Inject WebSocket implementation; do not use global sockets implicitly. Subscribe to exact LaunchLab program with confirmed commitment, require matching subscription ACK, reject pre-ACK/mismatched/malformed messages, detect explicit disconnect/error and manually polled stale streams, and reconnect at most 2 times by default. No timers, background loop, D1, production integration or real provider call.
2. **Bounded historical gap review after resubscription.** Reuse cycle-01 reviewLaunchlabReconnectGap with at most 2 review invocations per session, 2 pages × 60 signatures and 6 transaction lookups per review by default. Missing checkpoint, 429, incomplete replay, invalid review output, order violations and exhausted budgets remain explicit gaps. Require detailed replay evidence before treating a bounded review as completed. Never authorize persistent checkpoint advancement or infer complete stream coverage.
3. **Provenance and no lookahead.** Record UTC stream receipt time and monotonic receipt clock, connection generation, subscription ID, review start/end and elapsed monotonic duration. Buffer notices arriving during review; deduplicate signatures across reconnects; mark every notice UNVERIFIED_LOG_HINT. Historical replay births are not live discoveries, and there are no measured device alerts, independent buyers, liquidity, market cap, sellability or live alert latency.
4. **Deterministic negative/replay/chaos tests** in tests/launchlab-reconnect-session-research.test.mjs: initial ACK and duplicate notices, real FLOAT fixture replay through mocked RPC, closed sockets, stale timeout, finite retries, subscription mismatch/pre-ACK notices, malformed JSON, backfill 429, missing checkpoint, forged complete reviews, in-flight stale results, slow review buffer, buffer overflow, reviewer exception and finite session duration.

## CI and fixes

- Initial implementation 8fc1d404e2288950c55a444b20cb2f338896ac04 passed [full regression](https://github.com/wessteven/buyguy-free-crawler/actions/runs/40878128119) and [offline 30s replay](https://github.com/wessteven/buyguy-free-crawler/actions/runs/40878128114). This commit predates the new test file.
- New tests 07b19e61c2089a67d6d1e8e95bae50bed53939da passed [full regression](https://github.com/wessteven/buyguy-free-crawler/actions/runs/40878197393) and [offline replay](https://github.com/wessteven/buyguy-free-crawler/actions/runs/40878197369).
- Hardened provenance and review integrity in fa4d1637099f7eb75a3033e4efdf61f78e13aaa8. Full regression [failed](https://github.com/wessteven/buyguy-free-crawler/actions/runs/40878258682) because the earlier mock safeReview fixture lacked newly required coverage fields. The research code failed closed; this was a test fixture update, not a verified live-stream defect.
- Fixed fixture and added forged-review tests in ce9dd2092af3b4eed6fcf0180ad8df71575b1249. Both [full regression](https://github.com/wessteven/buyguy-free-crawler/actions/runs/40878283006) and [offline 30s replay](https://github.com/wessteven/buyguy-free-crawler/actions/runs/40878282982) passed.
- Expanded negative tests in 46153fe6547415d179aa57bf89f0531c1d8e124b. [Full regression](https://github.com/wessteven/buyguy-free-crawler/actions/runs/40878319104) and [offline 30s replay](https://github.com/wessteven/buyguy-free-crawler/actions/runs/40878319000) were in progress when this checkpoint was written; inspect both before calling the final commit green.

## Limitations, safety, budgets

This is a mockable, manually started research POC, not a deployed 24/7 live stream. Real-time detection remains unverified for this code. Historical FLOAT is replay evidence only. No new actual birth-to-receipt or receipt-to-phone latency, independent beneficial buyers, 50K–150K market-cap entry evidence, quote freshness, liquidity, tradability or executable P&L were measured. buyQualified=false, coverage=UNKNOWN and checkpointAdvanceAuthorized=false are preserved. The WebSocket session only queues unverified log hints; it does not yet classify new live transactions or send alerts. No provider credits, D1 reads, production changes, merges, paper trades, real trades or paid resources were used in this cycle.

## Next hourly cycle

1. **First** inspect latest head and both GitHub CI workflows, especially expanded negative tests at 46153fe6..., and repair any failures.
2. Test a scripted clock-controlled event-loop adapter with delayed socket open/ACK, duplicate ACKs, silent disconnect, in-flight review cancellation, slow/429 RPC, session total budget, and bounded candidate verification. Verify late responses cannot revive a closed session.
3. Add isolated capped live-candidate transaction verifier after ACK with exact signature/slot and LaunchLab instruction matching; distinguish historical backfill, observed live notice and transaction verification. Avoid fabricating device latency.
4. Only after passing tests, consider protocol-identity linkage to 30-second swaps. Keep pool/curve identity, independent-buyer evidence, executable exit and valuations unknown until separately verified. Do not merge or deploy.
