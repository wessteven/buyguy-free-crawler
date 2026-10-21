# GOGET historical Solana pool-creation evidence (2026-10-21)

Research only. These explorer records are **not** Helius replay results.

## Raydium CPMM — independently observed successful initialize transaction
- Signature: `25mwtoditp55vn7kQtqs4RmEfhvEZ4x4AxGFS68M62vnCSwbeQ7Efg9j4ovMen1XwvLVZNFyMPYBjxdVaTgBSkJv`
- Explorer: https://solscan.io/tx/25mwtoditp55vn7kQtqs4RmEfhvEZ4x4AxGFS68M62vnCSwbeQ7Efg9j4ovMen1XwvLVZNFyMPYBjxdVaTgBSkJv
- Explorer explicitly reports successful Raydium CPMM `initialize`, Jan 16 2026, version 0.
- **Expected pool-state address NOT yet independently confirmed.** Explorer labels `Dw4uLKPb3tvRfuUYNvaiNMZyCk85c4zLffaieVXUDUxF` as 'Market', but do not assume that label identifies the CPMM pool-state account without checking instruction account index 3 on-chain.
- The two 'Pool' accounts `14gc8LotGoQuCEYuCeNWvdhRCVmA88BQm3BptfP78pDSi` and `2AoFuGQ1gxQYmKkiWxpMMzGB5o33iYaBiFbmqWk4Rdjsa` appear to be vault/token accounts, not proven pool-state accounts.
- **Do not submit a guessed expected_pool** to the manual replay workflow.

## PumpSwap — independently observed migration / pool-creation transaction, not proven create_pool discriminator
- Signature: `4NXg3BhMk7VHaa5mWkptwSweHXZCuBeFcL5hqonuFmMTNFbu4sRLkp4i81psZFbBkAJCF18Vbm8kpp8KPmGhF1kx`
- Explorer: https://solscan.io/tx/4NXg3BhMk7VHaa5mWkptwSweHXZCuBeFcL5hqonuFmMTNFbu4sRLkp4i81psZFbBkAJCF18Vbm8kpp8KPmGhF1kx
- Explorer shows successful Pump.fun AMM pool creation via a `migrate` action on Aug 30 2026.
- **Not a verified `create_pool` instruction**; this could be a distinct migration path and is a useful **coverage-gap candidate**, not a positive test for the current `create_pool` discriminator.
- Explorer identifies PumpSwap market/pool-state candidate `6yzJjoxUUrXX8qfnV9mUNqXQHWAqb7mvrkaKm2kJMrkx`; this is NOT yet owner/layout verified via Helius. Distinguish it from the token vaults `1H6GLnCjpRdA53oVAJ3rjag1idqLyPJKvVRNw6Siomxdm` and `2GbqFM6qYeBRkobBDWnYXYHT9TEbjydg1n9EnA2a9ZRwt`.
- Pump.fun `migrate` is a different instruction/program from PumpSwap `create_pool`. **The research decoder now supports migration** using the official pump.json discriminator `[155,234,231,146,236,158,162,30]`, with pool at instruction account index 9 and 25 required accounts; synthetic regression tests pass. Live historical replay is still pending.
- Expected pool-state address remains NOT independently verified through Helius account ownership/layout.

## Validation protocol
1. Retrieve each transaction with authenticated Helius `getTransaction`, `encoding:jsonParsed`, `maxSupportedTransactionVersion:0`.
2. Resolve account index 3 (Raydium CPMM initialize), index 0 (PumpSwap create_pool), or index 9 (Pump.fun bonding-curve migrate) using the transaction's actual instruction accounts, including versioned account lookups.
3. Independently verify pool-state owner and layout before entering `expected_pool`.
4. Run the manual workflow with exact signature and verified expected pool; record positive, negative, or RPC-inconclusive outcomes.
5. Keep separate labels for Pump.fun `migrate` and PumpSwap `create_pool` paths. Do not convert a migration into a create_pool positive fixture.

## Latest verification status (2026-10-21)
- GitHub Actions BuyGuy V3 Tests passed for owner/layout regression commit `a17bffd9`, owner/layout flags `97ed8f8e`, and manual replay logging `c2cd51fc`.
- Connected Helius enhanced transaction reader returned activity involving candidate `6yzJjoxUUrXX8qfnV9mUNqXQHWAqb7mvrkaKm2kJMrkx`, but **did not provide raw `getAccountInfo` owner or binary state** and did not retrieve the exact historical migration signature. This does not verify the fixture.
- Manual replay **not executed**; no ground-truth positive, negative or RPC-inconclusive result for the historical signature exists yet. The manual workflow requires an authenticated Helius RPC and confirmed expected pool.
- Separate production crawler workflow run `39552534028` failed in its crawler execution step; this is not a historical replay failure. No production remediation performed under this research task.

## Read-only investigation checkpoint — 2026-10-21
- Latest Trader Radar PR Tests, Public RPC Verification and Public Historical Candles jobs for commit `5dcbce0f` all completed successfully. Their successful execution does not certify the historical Pump.fun pool fixture.
- Reviewed `src/helius-binary-pool.mjs`: Pump.fun bonding-curve `migrate` uses its own program ID, discriminator, and account index 9. `src/helius-discovery-probe.mjs` processes binary instructions before parsed-program filtering, so the separate Pump.fun program is not automatically excluded from historical classification.
- Historical migration signature `4NXg3BhMk7VHaa5mWkptwSweHXZCuBeFcL5hqonuFmMTNFbu4sRLkp4i81psZFbBkAJCF18Vbm8kpp8KPmGhF1kx` remains **not retrieved through raw getTransaction** in this session. Candidate `6yzJjoxUUrXX8qfnV9mUNqXQHWAqb7mvrkaKm2kJMrkx` remains **unverified** by raw getAccountInfo owner and layout. Do not claim successful replay or confirmed pool.
- Production crawler failure run `39552534028` logged only `HTTP Error 400: Bad Request` in `src/engine.py`. The exception arises from `urllib.request.urlopen`, which is used for both Cloudflare D1 requests and market-provider requests; the log does not identify the failing URL. No root cause established and no production files or D1 modified.
- Next safe diagnostic: an isolated mocked `urllib.error.HTTPError` test against a non-production diagnostic helper that redacts tokens and reports only allowlisted host, request class, and HTTP status. Do not alter the production crawler until failure origin is independently established.

## HTTP 400 offline triage helper (2026-10-21)
- Added `research/http400_triage.py` and `research/test_http400_triage.py` as independent Python research artifacts, with mocked HTTP errors only. No production engine import, API call, D1 access, workflow modification or trading integration.
- Tests assert that known provider categories are safely labeled without emitting URLs/secrets; unlabelled historical crawler logs remain `UNCLASSIFIED` rather than inventing a source.
- These tests require explicit `python -m unittest discover -s research -p 'test_http400_triage.py'` to execute; existing JavaScript CI passing does **not** establish these Python tests have run.
- Historical Pump.fun migrate signature and candidate pool still require authenticated raw `getTransaction` and `getAccountInfo`; no independently verified pool-state data available in this pass.

## Recurrent production crawler HTTP 400 — independent confirmation (2026-10-22)
- Latest scheduled production crawler run `39593590740`, job `119200336391`, on commit `7948199e` failed with exact log `BuyGuy crawler error: HTTP Error 400: Bad Request`, exit code 1.
- Earlier production crawler run `39552534028`, job `119064742729`, on commit `a4bf53c8` emitted the same exact exception. This establishes recurrence across two commits; neither log identifies the request URL or call site.
- General `BuyGuy V3 Tests` for commit `7948199e` passed (run `39575799732`); offline `GOGET HTTP 400 Research Tests` passed 4/4 (run `39575799569`). These do not exercise the live crawler network or establish the HTTP 400 root cause.
- Next diagnostic should obtain non-secret response metadata and a sanitized request category from an explicitly approved diagnostic path; avoid production crawler edits under the research-only constraint. No live D1 access or writes made here.
- The historical Pump.fun migration candidate remains without authenticated raw historical `getTransaction` accounts and raw pool `getAccountInfo` ownership/layout; no pool verification claim is justified.
