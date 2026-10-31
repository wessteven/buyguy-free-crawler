# GOGET — persistent accumulation upgrade (31 October 2026)

## Live evidence and baseline

A read-only Cloudflare D1 audit at 2026-10-31 04:15 UTC (GitHub run #41167800740) confirmed:
- Database file size: 35,213,312 bytes (33.58 MiB), including all GOGET tables and indexes.
- 96 stored webhook observations, from two monitored addresses, during the prior 24 hours.
- Total 25 stored polling classifications; 96 webhook event evidence JSON payloads contained 80,938 bytes.
- Last delivered event in that audit: 2026-10-31 04:00:40.618 UTC.
- Cloudflare billing/plan could not be verified from the available account API permissions. GraphQL D1 request returned zero groups; do not interpret that as zero usage.

The 3-wallet source is far too small to validate a winning strategy, and the old webhook saved mostly mint/transfer hints, not quantities.

## Changes in this branch

- Helius Enhanced webhook receiver v2 retains bounded quantitative token transfers, native SOL transfers, raw token amount hints, fee lamports, and swap-side source observations in versioned JSON. Evidence remains **unverified** for trader ownership, execution and sellability. Values are Helius-reported, NOT certified on-chain deltas.
- Raised the defensive receiver envelope from 96kB to 512kB per request, 30 to 64 events per batch, 1,200 to 5,000 attempted storage reservations per UTC day. D1 Free remains limited to 100,000 account-wide rows written per day. Reservation quota can be consumed by duplicates; this is not a Helius credit budget.
- Maximum configured wallet-list capacity grows to 32, but the active subscription remains at **three public research wallets until a real cohort is vetted and Helius usage measured**.
- New pool-signer discovery runs at most every six hours, with a hard limit of six existing D1 pools, eight recent signatures/pool and 36 transaction decodes/run. It stores signer+pool+signature+slot provenance in isolated D1 and provides seven-day JSON artifacts. A signer in a PumpSwap transaction is not necessarily the buyer, and certainly not proof of a profitable wallet.
- Pilot and cleanup cutoff extended to **2026-11-08 00:00 UTC** (12:00 Norfolk Island). GitHub hourly cleanup deletes only our exact own webhook after that cutoff. A missed scheduled cleanup is an operational risk.
- No production dashboard change, no authorized wallet trading or external paid-plan upgrade.

## Published Cloudflare pricing checked 31 October 2026

The Cloudflare **Workers Paid** plan has a US$5/month account minimum; the Cloudflare zone Pro plan is unrelated.
- Workers requests: 10 million included/month, then $0.30/million; Worker CPU: 30 million milliseconds included/month.
- D1: 25 billion rows read/month and 50 million rows written/month included, 5 GB storage included. After allowance: $0.001 per million rows read, $1 per million written, $0.75/GB-month beyond 5GB.
- R2 Standard (separate product): 10 GB-month storage, 1 million Class A and 10 million Class B operations/month free; overages $0.015/GB-month, $4.50/million Class A, $0.36/million Class B. R2 is not yet provisioned for this project.
- Workers Free: 100,000 incoming requests/day, D1 5 million reads/day, 100,000 rows written/day, 5 GB storage; exceeding free D1 limits makes operations fail until reset/cleanup.

Pricing source: https://developers.cloudflare.com/workers/platform/pricing/ and https://developers.cloudflare.com/d1/platform/pricing/ and https://developers.cloudflare.com/r2/pricing/

Helius publishes Free: 1 million credits/month and 10 RPC requests/sec; Developer: $49/month for 10 million credits and 50 RPC requests/sec. Helius webhook references list one credit per delivered event, separate from RPC calls. Current account consumption and credits remain unverified and must be checked before raising the monitored wallets to 25/50/100.
See https://www.helius.dev/pricing and https://github.com/helius-labs/core-ai/blob/main/helius-plugin/skills/build/references/webhooks.md.

## Architecture we should build next

A. **Write once:** Real-time Enhanced webhook receipt -> authenticated Worker -> D1 event index + bounded normalized evidence, with explicit error logging, idempotence, provenance and original receipt timestamp.

B. **Raw archive:** After R2 binding is provisioned, add versioned **full webhook/transaction JSON payloads** to R2 in hourly or 64–256KB compressed shards. D1 stores the object key/hash, wallet, signature, pool/mint, slot, time, parser version, validation and rejection codes. This is critical for reprocessing historical cases as parsers improve. R2 is cheaper than storing unbounded JSON blobs in D1. A verified raw archive is **not yet active**.

C. **Build forward labels:** Confirm trader authority, owned token/native deltas, exact pool and route using independent RPC. Mark unavailable data as unknown; don't rewrite old observations to imply foresight. Track future outcomes for ALL candidates, including failures and vanished liquidity. Retain 1m and 5m OHLCV as native SOL price with timestamp and source where supported; never call pool quotes exact execution prices.

D. **Scale safely:** First measure source event/credit rates from six-hour trial, then add 10–25 documented wallets (not random creator wallets). Before growing to 640, add provider-credit watchdog and cohort-priority controls, wallet scoring with realized P&L, and storage retention budgeting.

E. **Data contracts:** Separate observed signature count, independently verified buys, paper fills, quote age, missed signatures, market/regime outcomes, ingestion lag, and billed source usage. Do not infer profitability from token increases or successful GitHub Actions jobs.

## Operational verification

GitHub workflow logs and D1 metrics provide ground truth. Check these:
- [Cloudflare capacity audit](https://github.com/wessteven/buyguy-free-crawler/actions/workflows/goget-capacity-audit.yml)
- [Webhook deployment and expiry cleanup](https://github.com/wessteven/buyguy-free-crawler/actions/workflows/deploy-smart-wallet-webhook.yml)
- [Pool signer candidate discovery](https://github.com/wessteven/buyguy-free-crawler/actions/workflows/goget-wallet-candidate-discovery.yml)
- [Wallet live polling and webhook receipts](https://github.com/wessteven/buyguy-free-crawler/actions/workflows/smart-wallet-live.yml)

For storage billing, read Cloudflare dashboard Billing > Billable Usage and Workers & Pages > D1 > GOGET database > Metrics. An actual account Paid/Free entitlement and total spend cannot be inferred from the repository.

## Research-only cohort expansion — 31 October 2026

A real-time Helius discovery scan [#41168150512](https://github.com/wessteven/buyguy-free-crawler/actions/runs/41168150512) examined six pool accounts, decoded 36 confirmed transactions and submitted 36 signer+pool+signature provenance records to the isolated D1 research table, with zero provider errors. Candidates are **signed-PumpSwap-transaction activity**, not proven buyers, smart money, or profitable wallets.

The Helius **webhook** cohort is enlarged from 3 to **15 unvetted research wallets**, using 12 clearly identified candidates from that first scan plus the three prior watch subjects. The existing slow polling cohort remains 3 to avoid increased RPC consumption. Configuration is checked for exact equality between the committed worker list and Helius subscription before registration.

The separate hourly provider credit guard queries D1. If it finds at least 350 stored webhook records in the last hour or 2,200 attempted webhook storage reservations in the UTC day, it **deletes only the GOGET-owned Helius webhook** to avoid further event credits. No other provider webhooks may be altered. GitHub Actions schedules can be delayed, so this is a soft operational guard, **not a hard billing cap**. Cloudflare Worker itself continues with an independent 5,000 attempted reservation/day cap and stops at 8 November UTC unless explicitly renewed.

This cohort is intended to collect enough evidence to *test whether each wallet is worth tracking*, rather than presupposing that all activity is profitable. Once a first 24-hour rate sample is measured, introduce 25 or more addresses only after an actual Helius credit-usage audit and explicit risk-cap review.
