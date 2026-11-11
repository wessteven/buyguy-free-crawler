# GOGET overnight cycle 06 — 30 October 2026, 05:00 Norfolk Island (UTC+12)

**Project continuity:** GOGET / BuyGuy / WHAT'S GOOD Fast Radar, repository `wessteven/buyguy-free-crawler`, isolated branch `research/launchlab-early-birth-poc`, draft PR #6. Preserve draft Pocket Radar v0.8 PR #5. This is research only; no restart, production change, merge, deployment or trading.

## Prior cycle / CI first

Read [cycle 05](./GOGET_OVERNIGHT_CYCLE_05_2026-10-30_NORFOLK.md) and verified its final documentation-head CI green: [full regression #40907973376](https://github.com/wessteven/buyguy-free-crawler/actions/runs/40907973376) and [offline 30-second replay #40907973407](https://github.com/wessteven/buyguy-free-crawler/actions/runs/40907973407) on `b033a1580ebac3fab83c3cd355182be3e1c988cf`. Previous cancellation and bounded gap-review behavior retained.

## Hourly plan and completed engineering

1. **Decode raw LaunchLab swap instruction identity, not caller assertions.** Added `src/launchlab-raw-swap-research.mjs`, a pure, read-only decoder of all four `buy_exact_in`, `buy_exact_out`, `sell_exact_in`, `sell_exact_out` discriminators, using actual 8-byte Anchor instruction data and 15-account IDL ordering. Supports successful top-level and inner CPI instructions. Requires exact transaction signature, successful `meta.err=null`, valid slot/block time, real receipt-time field, fee payer and trader signers, exact program, token programs, and all referenced instruction accounts present in the transaction message account-key list. Malformed/failed/missing-signer instructions are **not** accepted. Records `requestedQuoteUnits` only as *instruction intent*, not executed transfer amount.
2. **Causal 30-second receipt ledger.** Added `src/launchlab-raw-receipt-ledger-research.mjs`. Accepts raw `getTransaction`-shaped records, a separately verified LaunchLab birth and exact mint/curve/quote identity. Applies strict `asOf` cutoff to actual caller-supplied receipt times, checks two contiguous, aligned 30-second source windows, rejects inconsistent source-window receipt timestamps, mismatched identities, duplicate conflicts and multi-swap signatures. Counts only decoded buy/sell *transactions* and distinct **fee payer accounts**; outputs offline research hypotheses only. All quote volumes, market caps, reserves, independent beneficial buyers, exits and live alerts remain unknown.
3. **Pin authoritative protocol layout.** Fetched Raydium's official `raydium-io/raydium-idl` LaunchLab v0.2.0 JSON at immutable source commit `e7e0c96fe77bcf6a020b84a44c47a722aac8e359`, [source](https://github.com/raydium-io/raydium-idl/blob/e7e0c96fe77bcf6a020b84a44c47a722aac8e359/raydium_launchpad/raydium_launchpad.json). Committed a minimal pinned mapping as `tests/fixtures/raydium-launchlab-swap-idl-pinned-2026-10-30.json`. Tests generate swap bytes from this independently pinned fixture, not a duplicate copy of decoder constants. **This verifies IDL mapping, not current live on-chain program behavior.**
4. **Adversarial replay/regression.** Added `tests/launchlab-raw-swap-receipt-research.test.mjs`, covering all four swap variants, inner CPI, signer/fee-payer distinction, missing message account keys, wrong mint/curve/program, failed transactions, wrong signatures, unsupported Token-2022 safety assumptions, duplicate/multi-swap conflicts, future receipts, coverage contradictions, invalid/forged birth evidence and input caps. Synthetic transaction fixtures are clearly **synthetic**, and the pre-existing real FLOAT fixture covers **birth only**, not a real swap.

## Commit and CI audit

- `a614904d1f6c5fc719c10099633bbf41bf6441ad`: raw LaunchLab swap instruction decoder.
- `8f6615c367517a899b2941347dc6ddfac849b2e7`: receipt-gated 30-second raw transaction ledger.
- `ba906aa665d149718d5af714532c51d3da49ee2e` / `fee524ce89b840febd0bdce7c25c43436cf25c17`: remove overclaims of independent source verification, reject contradictory receipt timing and conflicting duplicate details.
- `385d6f193dff3c1e94e0a02b7c590a396b4aaa1e`: initial 13 synthetic adversarial tests. [Full CI #40917935657](https://github.com/wessteven/buyguy-free-crawler/actions/runs/40917935657) **399/399 Node + 7/7 Python passed**, [offline #40917935554](https://github.com/wessteven/buyguy-free-crawler/actions/runs/40917935554) passed.
- `f36cced53e389a7130be8988a25c082697efd9ae` and `895eb77f2cfa98a127e2ad625156686b082f395d`: pinned official IDL and fixture-driven tests.
- `05b996ba2a11a94eaceefca8b2137a03f202acbe`: strengthened raw account-key membership validation. **Interim CI #40918130896 failed 10 tests** because synthetic fixtures did not yet include all real message account keys; no production failure. Corrected fixture and added a forged-account regression in `7a651477d36fb2c2a03d1910568696c6c458987a`.
- **Final tested code commit `7a651477d36fb2c2a03d1910568696c6c458987a`: [full regression #40918151791](https://github.com/wessteven/buyguy-free-crawler/actions/runs/40918151791) passed 401/401 Node tests + 7/7 Python tests. [Offline 30-second replay #40918151809](https://github.com/wessteven/buyguy-free-crawler/actions/runs/40918151809) passed.**

## Important evidence boundaries

**No real raw LaunchLab swap transaction fixture was available in the existing repository.** This run pinned the official IDL and tested synthetic transaction-shaped cases, but did **not** independently verify a real swap signature, transaction balances, TradeEvent, transfer fees, pool reserves or executed amounts against live on-chain evidence. The existing real FLOAT fixture is an initializer, not a swap. Source window completeness is **caller-attested, not independently proven**. The decoder does not make a claim about unique beneficial buyers even when many distinct fee payers exist.

No new live birth, sustained live coverage, 50K–150K valuation, new collector-to-alert/device latency, independent buyers, executed SOL quote volume, safety or executable exit was established. Every episode remains `buyQualified=false`, `actualLiveAlertLatencyMs=null`, `executedQuoteSol=null`, `independentBuyers=null`. No provider calls/credits, D1 reads/writes, production cron changes, production alert, paid resources, paper/real trades or Pocket Radar changes were made.

## Morning report and next research gate

For the **06:00 Norfolk Island** report, include cycle 06 exact tested code SHA, full and offline CI, interim failed-then-fixed test story, pinned upstream IDL, limitations, and progress across cycles 01–06. Do not present this as a deployed live engine.

Highest-value next step: obtain **one exact real LaunchLab swap signature and its raw `jsonParsed getTransaction` payload** using a deliberately bounded provider read (or a previously archived record), independently cross-check account mapping, token transfers and optional `TradeEvent`, freeze the immutable fixture, then run the new decoder and ledger against real evidence. Only after verified raw trades and independently measured source-window completeness should any research episode be considered for real-time alerts. Preserve production and PR #5.
