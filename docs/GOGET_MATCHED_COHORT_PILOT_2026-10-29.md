# GOGET matched-cohort replay — verified partial research, 29 Oct 2026

**No production changes. No trading or financial return claim.**

## Selection

Seven exact-pool Solana assets in the 20 October Night Lab cycle-11 evidence, frozen from main commit 7e201a7fbc88e6bb104a5aca117a91593318aa4a: BORLY, FORKIUS, PIKA, SATOSHI, SUPERCORE, WISP and XMRS. This is a previously curated watchlist, not an unbiased universe or a controlled sample of same-age launches.

The GeckoTerminal historical data experiment queried 19–21 October (UTC) at 15m and 5m granularity. [GitHub Action run #40844899150](https://github.com/wessteven/buyguy-free-crawler/actions/runs/40844899150) stored raw provider JSON, outcomes and request status in artifact **GOGET-MATCHED-COHORT-REPLAY**, ID **12884960383**. HTTP 429 stopped further requests after the sixth attempted call: **partial study**, not complete.

| Token | Valid 15m candles | Valid 5m candles | Frozen MIHAO rule alerts | Conclusion |
|---|---:|---:|---:|---|
| BORLY | 67 | 171 | 0 | Evaluated on available bars |
| FORKIUS | 74 | 206 | 0 | Evaluated on available bars |
| PIKA | 42 | 0 | 0 | 15m evaluated, 5m unavailable |
| SATOSHI | 0 | 0 | Unknown | HTTP 429 censoring |
| SUPERCORE | 0 | 0 | Unknown | HTTP 429 censoring |
| WISP | 0 | 0 | Unknown | HTTP 429 censoring |
| XMRS | 0 | 0 | Unknown | HTTP 429 censoring |

Identical rule to the earlier MIHAO retrospective test: two rising 15m closes, cumulative 30m +12%, close above EMA9 above EMA21, last two bars' average volume at least 1.5 times preceding eight bars, 90-minute episode cooldown. **None of three evaluable controls produced a signal.** Missing four are not negative results.

## Immediate price spikes missed by the slow rule

At 20 Oct **15:14:35 UTC** the existing Night Lab had recorded these three pools. Comparing the **15:15 candle opening quote** with later provider candle highs:

| Pool | Best observed high during next 3h | First +20% observed | Timing caveat |
|---|---:|---|---|
| BORLY | +31.5% | 15:15–15:30 bar | 5m bar 15:20–15:25 crossed 20%; only 10/12 subsequent 15m bars |
| FORKIUS | +25.6% | 15:15–15:30 bar | 5m bar 15:15–15:20 crossed 20%; later within 3h low was around −45% |
| PIKA | +66.0% | 15:15–15:30 bar | No 5m history obtained because of HTTP 429 |

These are *high-watermark candle excursions*, not fills or realistic P&L. Bid/ask, available liquidity, fees, buyers, contract risk, quote lag and on-chain route execution remain unverified. Actual GOGET production first_seen and live alert capability were not reconstructed. Calling these “three successful trades” or a 100% missed-runner rate would be incorrect. The 15m trend rule is structurally too slow to signal at the beginning of a spike during the first 15-minute bar.

## Provider usage and engineering correction

- First cohort study attempted **6** provider API calls and then failed closed on **HTTP 429**. BORLY and FORKIUS returned both requested periods; PIKA returned 15m only.
- The MIHAO export PR workflow was also eligible to re-run during unrelated PR updates, adding public API requests and potentially sharing quota with this cohort job.
- Both research-export workflows were subsequently changed to **manual-dispatch only**, preventing automatic refetch on every draft-PR update. No production CI, scanners, ten-minute cron, D1 schema/history, paper wallet or Android signing was changed.
- For future opt-in research, the cohort script now accepts a whitelist-only COHORT_SYMBOLS subset (e.g. SATOSHI,SUPERCORE), to avoid re-fetching successful pools, and spaces requests by **12 seconds** (5 per minute maximum). Provider cooldown and 429 must still be respected; no key/proxy rotation or quota bypass.
- Note: manual workflow dispatch may only become available after the workflow has been registered on the repository default branch. Do **not** merge unfinished research simply to force a rerun.

## What to develop next

1. Keep FLOAT birth detection separate from MIHAO-style price acceleration.
2. Investigate short **30s/1m volume-and-trade acceleration** when a newly detected pool lacks 21 historical 15m candles. Separate observation from buy qualification.
3. Independent buyer/fee-payer reconstruction and funding graph checks are essential; GeckoTerminal OHLCV cannot certify unique buyers.
4. For a valid failure rate, sample *all contemporaneous births including failed tokens*, not already-followed Night Lab assets. Report exact on-chain creation time, GOGET first observation, and timestamped executable quote availability.
5. Repeat the original unmodified 15m rule across a complete cohort first; report missing histories as censored and time-order ambiguous bars as ambiguous.

Reproducibility: GitHub draft PR #6 contains the frozen 7-token set, pure replay module, negative test cases, bounded provider export and raw response evidence. **No new GOGET alert mode is deployed.**
