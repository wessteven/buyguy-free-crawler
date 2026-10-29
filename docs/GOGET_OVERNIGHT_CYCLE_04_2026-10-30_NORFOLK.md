# GOGET overnight cycle 04 — 30 October 2026, 03:00 Norfolk Island (UTC+12)

**Project:** Existing GOGET / BuyGuy / WHAT'S GOOD Fast Radar, isolated branch `research/launchlab-early-birth-poc`, draft PR #6. Continue; do not restart. Pocket Radar v0.8 draft PR #5 and all production services remain untouched.

## Baseline and hourly plan

Read the previous [cycle 03 handoff](./GOGET_OVERNIGHT_CYCLE_03_2026-10-30_NORFOLK.md), the existing reconnect state machine, manual live verifier, LaunchLab IDL decoder, 30-second offline acceleration classifier and tests. Verified that previous head `568f331063d053bcd5e9e6cca2365227837460bd` passed [full regression #40888471667](https://github.com/wessteven/buyguy-free-crawler/actions/runs/40888471667) (363 Node + 7 Python) and [offline acceleration #40888471653](https://github.com/wessteven/buyguy-free-crawler/actions/runs/40888471653).

**Plan and completed improvements:**

1. **Propagate caller-owned cancellation to the one-transaction Helius RPC.** Added optional AbortSignal to `loadLaunchlabTransaction` and `verifyLaunchlabLiveCandidate`, with explicit `RPC_ABORTED` classification. A late response from a loader ignoring cancellation cannot become a verified birth.
2. **Enforce a finite manually driven RPC timeout and disconnect cancellation.** Reconnect session now tracks in-flight controllers, aborts on stream disconnect/stop, and caps each manual lookup duration (default 8 s, bounded 1–30 s) via `tick()`. No timers, automatic provider calls, retries or fallback. Timeout and abort counters are explicit; a timed-out result cannot promote a birth.
3. **Prevent hanging verification when a provider ignores AbortSignal.** The research session races the provider promise against its own cancellation event; a never-resolving RPC cannot hold `waitForVerification()` indefinitely after a manual timeout or disconnect. Provider work may still exist externally if it ignores abort; `liveLookupsFinished` means local cancellation settled, **not guaranteed provider termination**.
4. **Add a pure, identity-scoped LaunchLab-to-30-second swap-flow join.** New `src/launchlab-flow-join-research.mjs` requires a verified LaunchLab birth signature/slot, exact mint/curve/program and caller-supplied decoded swap account identity on every event and complete source window. It rejects mixed identity, missing/late receipts, inconsistent event times, unverified birth evidence and any causal lookahead. Its hypothetical acceleration calculation is gated by when source completeness and event receipts actually became available, not backdated to the 30-second window end. **All swap identity proofs are caller-supplied research assertions, not independent on-chain swap verification.** No real live feed was attached.
5. **Add regression and negative tests.** New flow-join suite plus abort, timeout, noncooperative provider, concurrency, disconnect and stale-result cases. Existing tests and offline archival replay preserved.

## Commits and evidence

- `2bca53a87fac100b72e5cb5ff3ba6d3b1eb3b749`: optional AbortSignal in LaunchLab RPC loader.
- `119803e59f88578a909021ad1507d11e2a6b49b7`: aborted lookup fail-closed classification.
- `25c04698810b08c22db41b55a8502d80dbdb39b8`: disconnect/stop/manual lookup timeout in session.
- `52ec028aaafd96ad9f2f18567f85e5bcc34872c9`, `c031d8e2ba80aaa95c92bbd724e1e88d806bb492`: cancellation tests.
- `13920f9762d47cc3dfba5e87cb31bb209000449e`: pure exact-identity offline 30s flow join.
- `a90a7d95674ccaf7416340397fb0a0a325db7e94`: receipt-gated identity and no-lookahead tests; [full regression #40898462646](https://github.com/wessteven/buyguy-free-crawler/actions/runs/40898462646) **375/375 Node + 7/7 Python green**; [offline replay #40898462734](https://github.com/wessteven/buyguy-free-crawler/actions/runs/40898462734) green.
- `cbf225cb3a2c15c40c4a98ece5977819a3ad85a2`: settle cancelled lookups even when provider ignores abort; [full regression #40898568149](https://github.com/wessteven/buyguy-free-crawler/actions/runs/40898568149) and [offline replay #40898568005](https://github.com/wessteven/buyguy-free-crawler/actions/runs/40898568005) green.
- `4a55d2a6e1483400f97df50baf4e9072667cd63a`: tests for never-settling noncooperative provider; **final-code CI verified green**: [full regression #40898587573](https://github.com/wessteven/buyguy-free-crawler/actions/runs/40898587573) **377/377 Node + 7/7 Python passed**, and [offline replay #40898587590](https://github.com/wessteven/buyguy-free-crawler/actions/runs/40898587590) passed. This exact code SHA is the last fully tested code baseline; subsequent documentation-only commits do not change execution logic.

## Evidence boundaries and operational impact

- **No new real live token birth**, 50K–150K valuation, real 30-second trade feed, independent buyer, sellability, liquidity, market-cap quote, actual phone alert, device latency or P&L was observed. Test inputs are deterministic synthetic receipts and historical FLOAT instruction fixtures, not newly captured live events.
- `buyQualified=false`, `coverage=UNKNOWN`, `checkpointAdvanceAuthorized=false`, actual alert latency `null`. The exact-identity flow join does not independently prove the caller's swap decoder or the completeness assertions.
- No Helius/provider credits, new paid services, D1 reads/writes, new production cron, merges, deployments, paper/real trades, alerts or Android changes. The research code is not imported by production.

## Next hourly cycle: review CI first

1. Confirm the latest exact head's full Node/Python regression and offline 30s replay; inspect any failure logs and fix before expanding.
2. Strengthen gap-review cancellation and stale WebSocket subscription behavior with deterministic chaos tests; ensure backfill and live lookup budgets stay separate and no falsely persistent watermarks appear.
3. Build an **independently verified swap transaction decoder fixture** for a known LaunchLab curve with exact transaction signature, program account indices, mint/curve and source-receipt timestamps. Only then elevate the caller-supplied flow join from synthetic identity to replay-backed transaction evidence. Do not claim fee payers are independent buyers.
4. Define a bounded birth-to-flow latency evidence ledger and the additional data needed for 50K–150K valuation, liquidity and executable exits. Avoid invented market-cap values and any live broad scans without a provider budget.
