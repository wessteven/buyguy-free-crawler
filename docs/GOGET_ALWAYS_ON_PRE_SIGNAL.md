# GOGET — Always-on research for pre-explosion signals (v1)

## Mission

Observe emerging Solana token activity 24 hours a day, 7 days a week, accumulate **timestamped evidence before moves happen**, compare against earlier conditions and later outcomes, and learn from failed signals as well as successes.

The six-agent historical research Worker is useful but **not an early alert by itself**. This separate Cloudflare Worker captures prospective features every five minutes using existing Helius webhook evidence and the existing narrow onchain pool-price sample database. It cannot yet detect every new token or every trade: coverage is limited by subscribed wallets, Helius provider-credit limits, event classification, and the number of pools quoted.

## Five-minute live research cycle

1. Read at most **1,200** already-received Helius records over the last 90 minutes. If the source cap is reached, store an explicit incomplete-window run and **do not promote candidates**; never pretend history is complete.
2. Using only source records observed **as of now**, group token inbound transfer and Enhanced SWAP output hints by exact mint.
3. Compare **15-minute activity** with the preceding **75-minute** reference window. Note unique signatures, unique watched wallets, fee-payer-reference wallets and intensity. These are activity hints, not independent owner verification.
4. Mark research-only multiwallet activity acceleration when there are at least **three unique recent transaction signatures, two distinct watched wallets, and a 3x-normalized activity rate**, or no prior observed activity. Activity from one wallet alone can be logged but cannot be promoted to multiwallet. Never claim a buy.
5. Save a bounded max 40-point sample per cycle: up to 20 leading activity anomalies and up to 20 deterministic weak-signal controls. Controls are retained to study false alarms and baseline token performance. This is a partial, explicitly selection-biased sample—not all observed tokens.
6. For each saved mint, try to match the exact Solana mint/pool pair against the existing onchain `chain_radar_samples` within **three minutes before the signal**. No fresh exact-pool quote => `NO_FRESH_MATCHED_POOL_QUOTE`; do not fill with a future price or guess. Initial quotes are indicative **SOL/token**, not executable entry prices.
7. For samples with fresh as-of prices only, enqueue prospective 5-minute, 1-hour, 6-hour and 24-hour outcome checks. At due time, find the first exact-pool quote from 0–10 minutes after due. If coverage fails, record **MISSING_FUTURE_QUOTE_COVERAGE**, not zero return. The labels are observed price change, not backtested executable profits.
8. Persist a concise research summary with timestamp, signal count, negative controls, quote match coverage, missed-source status and future labels. An independent read-only audit checks that actual Cron executions occurred.

## Zero new provider cost

- Independent `goget-pre-signal` Worker, `*/5 * * * *` Cron, **1,000 ms CPU limit** per invocation.
- No new Helius RPC/webhook calls, no LLM inference, no new wallet subscriptions, no real trades, no scanner filter changes or paper account changes.
- At most 40 signal snapshots and 20 forward-label checks per five-minute cycle, plus bounded idempotent outcome jobs. Cloudflare Paid **included allowances still apply to all account services in aggregate**; the setup is not an unlimited or guaranteed fixed-cost system.
- D1 records are idempotent per `(mint,5-minute bucket)` and `(mint,bucket,horizon)`. A short expiring D1 lease prevents overlapping process races.
- Unique mint/source identifiers are stored, but full raw Helius source payloads are archived separately and only where the bounded raw webhook path is successful.
- The existing Helius research webhook is time-limited to **8 November 2026 00:00 UTC**. We must assess provider credits, sources and the expiry before promising uninterrupted collection beyond that date.

## What this does not prove

- A multiwallet cluster is **not** an independently verified buy, or proof those wallets are profitable.
- A token becoming active does not predict an explosion without statistically meaningful forward outcome evidence.
- An onchain reserve snapshot is not an executable trade quote and may be stale/unsupported.
- When only the existing five onchain pools have prices, most token signals may have **unknown future returns**. We must measure and improve quote coverage before claiming efficacy.
- Five-minute Cron is not subsecond discovery. The Helius webhook still receives events earlier, but research categorization happens at the next scheduled cycle.
- Success must eventually be assessed using time-split, forward-only data with false positives, liquidity, execution costs, missing observations and project selection biases.

## Next evolution

Use the signal/outcome journal to measure whether specific activity patterns lead price moves. Compare acceleration vs baseline and controls, and identify why most failed. Add lightweight immediate webhook-side triage when signal quality is demonstrated, then broaden exact-pool quote coverage within Helius budgets, and only then deploy optional local-LLM reasoning specialists for difficult cases.

Verification:
- Worker `https://goget-pre-signal.wessteven.workers.dev/health`
- Workflow `https://github.com/wessteven/buyguy-free-crawler/actions/workflows/deploy-goget-pre-signal.yml`
- Read-only data audit `https://github.com/wessteven/buyguy-free-crawler/actions/workflows/goget-capacity-audit.yml`

The project is for market research and paper-only learning, not financial advice.

## Public market-price enrichment added after the first live test

The first prospective Cloudflare test on 2026-11-01 (GitHub Actions #41261635313) examined 30 webhook records, persisted one early-activity research candidate plus 18 weak/control observations, but matched zero existing onchain pool snapshots. That missing-price problem prevented genuine forward outcome measurement for that first cohort.

To improve *evidence coverage* without using Helius credits, a strictly optional public DEX Screener quote lane is enabled:
- At most **one batched request for 8 priority mints plus 4 controls** and **one batched exact-pool outcomes request** per five-minute Cron execution; max **2 free public API requests per cycle**.
- Uses documented **GET /tokens/v1/solana/{tokenAddresses}** (up to 30 per batch) and **GET /latest/dex/pairs/solana/{poolIds}**, subject to 300 requests/minute API limits: https://docs.dexscreener.com/api/reference .
- Rate limited HTTP 429 immediately triggers a **30-minute local provider cooldown**, and existing GOGET Dex cooldown leases are respected. Non-429 errors back off five minutes, with no immediate retry loop. The existing crawler is unchanged.
- A source quote is the highest-liquidity **explicitly named Solana pool**, with base token address exactly equal to the signal mint. Its origin, receipt timestamp, USD price and liquidity are stored; it is **not proof that the wallet transaction used that pool** and not an executable price.
- Forward 5m, 1h, 6h and 24h price studies are queued from the actual *quote receipt time* and compare only the **same exact pool**, avoiding substitutions with later, more liquid pools.
- Missing future quote coverage stays **unknown**, not zero return. The sampled controls are retained to estimate false positives and provide a reference distribution.
- New isolated D1 tables: `goget_pre_signal_market_quotes`, `goget_pre_signal_market_outcomes`, and `goget_pre_signal_provider_state`.
- There is **no paid Dex API key**, no new Helius calls, no AI-model charges, no buy or paper fill, and no change to the core GOGET scanner. This is a low-volume public-data research adapter, subject to provider throttling or access changes.

Correct efficacy still requires market coverage rates, genuine causal ordering, unseen failed cases, liquidity and exact execution verification. The dashboard must not display these observations as certified profitable trades.
