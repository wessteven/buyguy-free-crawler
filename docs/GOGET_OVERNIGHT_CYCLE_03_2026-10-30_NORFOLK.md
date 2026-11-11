# GOGET overnight cycle 03 — 30 October 2026, 02:00 Norfolk Island (UTC+12)

**Project:** Existing GOGET / BuyGuy / WHAT'S GOOD Fast Radar, research branch `research/launchlab-early-birth-poc`, draft PR #6. This is a continuation, not a restart. Pocket Radar v0.8 draft PR #5, production 10-minute cron, 30-second known-pool collector, D1 schema/history, cooldowns, paper wallet, dashboard, secrets and Android signing remain untouched.

## Read and reviewed before coding

- Cycle 02 handoff `docs/GOGET_OVERNIGHT_CYCLE_02_2026-10-30_NORFOLK.md`, current session state machine and reconnect/gap-review tests.
- Latest prior head `af4cba802c3260eaade917c6a8722e2dfe6a1a30` passed [full regression #40878477038](https://github.com/wessteven/buyguy-free-crawler/actions/runs/40878477038) and [offline 30-second acceleration #40878477064](https://github.com/wessteven/buyguy-free-crawler/actions/runs/40878477064). Previous test-fixture failure was resolved.
- No new live stream, price feed, wallet or on-chain provider call in this cycle. All new tests use offline mocks/recorded transaction fixtures.

## Planned and implemented improvements

1. **Strict isolated live transaction verifier:** New `src/launchlab-live-candidate-verifier-research.mjs` verifies one accepted post-ACK LaunchLab log hint with at most **one** `getTransaction` request. It requires matching transaction signature (first signer signature field), exact slot, explicit successful `meta.err=null`, and supported Anchor InitializeV2/InitializeWithToken2022 instruction and IDL accounts. A real historical FLOAT instruction fixture is replayed with an *explicitly synthetic* signature field for positive unit tests; the unmodified trimmed fixture correctly fails live verification because its signature field is absent. No historical replay is called an actual new live observation.
2. **Manual capped session integration:** Extended `src/launchlab-reconnect-session-research.mjs` with explicit `verifyPendingLive()`, `waitForVerification()`, max six live transaction lookups and max two concurrent lookups per session. A WebSocket notice alone **never triggers an automatic RPC call**. Verification is blocked during backfill, unresolved history gaps, and closed sessions. Prior stream timestamps and monotonic receipt clocks are preserved; no auto-checkpoint advancement, D1 writes or alerts.
3. **Race safety, identity and clock integrity:** In-flight results from a disconnected or closed socket generation are discarded, never converted to a live verified birth. Duplicate manual requests share the in-flight work and cannot double-spend the lookup budget. Verified results must preserve exact candidate signature, slot, receipt provenance, unique valid mint/curve/quote addresses, legitimate decoder evidence, nonnegative monotonic timing and non-regressing UTC timestamps. Device alert and actual alert latency remain `null`.
4. **Quota and false-positive regression coverage:** New `tests/launchlab-live-candidate-verifier-research.test.mjs` and `tests/launchlab-live-verification-session-research.test.mjs` cover FLOAT instruction replay, missing/mismatched signature, mismatched slot, failed/missing transaction status, non-birth instructions, no auto lookups, six-call cap, two-call concurrency, 429 rate limiting without retry, stale delayed RPC after disconnect, unresolved backfill, forged verification output, invalid monotonic/wall clocks, duplicate calls and post-backfill live candidates.

## CI evidence

- The full regression and archived 30-second replay workflows passed at `f66f5f16bbbd6136ac3fa3ff0576e04bb0face42`: [full regression #40888271092](https://github.com/wessteven/buyguy-free-crawler/actions/runs/40888271092) **362/362 Node tests, 7/7 Python tests**; [offline acceleration #40888271026](https://github.com/wessteven/buyguy-free-crawler/actions/runs/40888271026) green.
- Additional 429 rate-limit classification and test added at `39abdc3b376a86e3e1d0d05f0e3dff314a30caef`. **Verified green on that exact code SHA:** [full regression #40888333970](https://github.com/wessteven/buyguy-free-crawler/actions/runs/40888333970) **363/363 Node tests and 7/7 Python tests**; [offline 30s replay #40888333951](https://github.com/wessteven/buyguy-free-crawler/actions/runs/40888333951) success. Subsequent documentation-only commits are not a new code baseline.
- Intermediate commits may show red while test expectations were updated; final success must be tied to exact SHA.

## Evidence boundary and unresolved work

This is **research-only, manually invoked and mocked**, not a deployed continuous live collector. No fresh live token births, phone notifications, new 50K–150K valuation opportunities, price/volume data, independently verified buyers, liquidity, executable exits, trade P&L or actual device latency were measured. A verified initializer only proves transaction-level LaunchLab birth instruction evidence, not safety, independent demand or tradability. `buyQualified=false`, `coverage=UNKNOWN`, `checkpointAdvanceAuthorized=false`, and actual alert latency `null` remain mandatory.

**Resource impact:** No new provider credits or D1 reads from the research test suite; GitHub Actions used for offline CI. No deployments, merges, production changes or trades.

## Next hourly cycle: review CI first, then plan next batch

1. Confirm full regression and offline replay on the **latest head** and fix any failures before expanding. Check exact commit SHA, not just green badges.
2. Add **abortable** finite live transaction verification: explicit cancellation on disconnect/stop, and a manually driven timeout/abort test without implicit retry loops. Preserve zero provider fallback and hard session budgets.
3. Add a bounded, read-only, **offline 30-second launch-flow identity join** from a transaction-verified LaunchLab mint/curve to exact swap evidence. Do not treat fee-payer count as independent beneficial buyer count or imply pool liquidity/exit.
4. Evaluate Pump.fun/Meteora program instruction fixtures only with verifiable program IDs and exact account layouts, not generic log strings. No expansion to paid/live broad scans.
