# GOGET overnight development — cycle 01, 30 Oct 2026 00:00 Norfolk Island

**Scope:** Existing draft PR #6, branch `research/launchlab-early-birth-poc`. Research only; production, Android PR #5, 10-minute cron, 30-second known-pool collector, D1/history, paper wallet, secrets, trading and deployment untouched.

## Plan and implementation

1. **Convert checkpoint overlap into bounded transaction evidence:** Added `src/launchlab-gap-review-research.mjs`, a manual, standalone historical gap reviewer calling the existing capped `reconcileLaunchlabCheckpoint`, then at most six `getTransaction` classifications. Each candidate is classified oldest to newest. The recorded real FLOAT initializer is replayed as historical evidence, never misrepresented as a live alert.
2. **Fail closed on gaps and budgets:** Explicit unresolved states for no checkpoint overlap, RPC 429, source-order violations, malformed history, missing transaction, mismatched slot, unknown success/failure, lookup budget exhaustion, and unverified live-seen duplicates. No retries, D1 writes, or persistent checkpoint advancement. `watermarkCandidate` is unpersisted and `advanceAuthorized=false` even on a bounded successful review.
3. **Strengthen source integrity:** Hardened `src/launchlab-reconnect-research.mjs` to reject duplicated RPC history signatures and missing/malformed transaction error fields instead of silently accepting them.
4. **Regression and real replay:** Added `tests/launchlab-gap-review-research.test.mjs` with actual recorded Helius FLOAT transaction fixture and negative tests. Expanded `tests/launchlab-reconnect-research.test.mjs` for malformed/duplicated history. All tests use mocked network; no new provider API calls.

## Evidence and limitations

- Historical FLOAT fixture: transaction `2FudGznjF8iz2kdZ7zhehZU5j2GewzWEd8XFrB8j4yjcwFyJncPFsuf54qv6wFWxRNEFjWJ8g8UxHJX7qhjogFNL`, slot `462635268`, chain time `2026-10-28T21:53:17Z`, expected mint `Bv1a7cEj5aRnJQhMw4kRQqAFesMSd5LwcDnUzq52BMmr`. This is **historical transaction replay**, not a newly observed token or live discovery result.
- Initial new regression at commit `7b940c1d46be995e1eca4c57da06439ef914cdab` failed due to a timestamp-validation regex typo. Fixed in `be25cf4f728d24bbcfa6b752c6cb297631804878`, [full regression passed](https://github.com/wessteven/buyguy-free-crawler/actions/runs/40869828589).
- Hardened reconciliation regression and offline replay **both passed** at commit `0850babf663b50b4ccdfb81fe8edaeb989e1423b`: [full regression](https://github.com/wessteven/buyguy-free-crawler/actions/runs/40869905255), [offline replay](https://github.com/wessteven/buyguy-free-crawler/actions/runs/40869905281).
- Additional strict transaction-result guards and tests committed through `1932a20963012dd8d4fc63efb8a344684fd552b1`; inspect **latest-head CI** before treating them as green.
- **Not built:** Actual WebSocket reconnect loop, backfill stream integration, persistence, production deployment, alert delivery or live false-positive population. This manual offline review is an intermediate component, not a complete reconnection engine.
- **No newly measured live latency**, unique beneficial buyer count, valuation, liquidity or executable exit. `buyQualified=false` throughout. No new provider credits, D1 reads or trades in this iteration.

## Next hourly cycle (priority order)

1. Check latest PR #6 head and **both CI workflows**, investigate and fix any failures first.
2. Add a deterministic **mocked reconnect state machine** around the bounded reviewer: simulate close, stale stream, resubscribe, finite checkpoint backfill, duplicate signatures, and unresolved gap. Preserve strict no-auto-advance, no production integration.
3. Add clock-accurate receipt and verification provenance with negative tests; never use historical block time as measured live alert time.
4. Once replay is stable, consider limited LaunchLab protocol-specific transaction-flow link to the existing 30-second acceleration classifier, but only for verified curve/pool identity and explicit complete source coverage.
