# GOGET Smart Wallet LIVE watch-only pilot — 30 October 2026

**First verified production run:** GitHub Actions [#41024550922](https://github.com/wessteven/buyguy-free-crawler/actions/runs/41024550922) completed successfully at 08:09 UTC on 30 October. It made 9 Helius RPC calls and 14 successful D1 API operations, recorded 6 baseline transaction classifications, found 0 verified trade signals, and flagged all three sampled wallets as incomplete because the bounded signature window exceeded the per-wallet decoding limit. This is real baseline collection, NOT a proven complete or low-latency trading feed.

## Operational scope

- Real Helius confirmed Solana JSON-RPC calls: `getSignaturesForAddress` and `getTransaction` (jsonParsed).
- GitHub Actions scheduled every five minutes, but actual job start times can be delayed. Also runs on main branch deployment of the workflow and manual dispatch.
- Three *unvetted*, already-known public addresses in `research/smart-wallet-live-cohort.json`. This is a connectivity cohort, not a list of profitable smart money.
- Hard limits of three signature RPC calls + six transaction RPC calls per cycle, at most two decodes per wallet, and a 16-signature sampling window. Gaps/overflows are reported, not repaired with invented data.
- Separate Cloudflare D1 tables `smart_wallet_live_cursors` and `smart_wallet_live_events`. A run also uploads a JSON evidence artifact with seven-day retention.
- Existing production GOGET, real wallet, fast-radar, Pocket Radar, original paper account and 10-minute discovery cron remain untouched. No trade sending capability exists.
- **Automatic end:** 2026-11-08 00:00 UTC. The workflow then skips all remote Helius/D1 calls. To stop earlier, set `SMART_WALLET_LIVE_ENABLED` to false in the workflow.
- Only signatures with signer identity and independent transaction metadata are classified. If a wallet is merely referenced, it is not a copied trader.
- `AMM_INVOCATION_WITH_TOKEN_INCREASE_UNPRICED` is NOT a verified buy: an AMM program ran in the same transaction as a positive token balance delta, but the exact spending route, pool and sellability remain uncertain.
- Every observation is `tradeEligible:false`, `paperEligible:false`. Nothing invokes the paper-sniper until a future independently verified enrichment adapter exists.
- No private keys, trading wallet authorization, RPC order submission, or trading APIs.

## Evidence inspection

Workflow page: https://github.com/wessteven/buyguy-free-crawler/actions/workflows/smart-wallet-live.yml

Read-only D1 verification queries (using existing private credentials):

```sql
SELECT wallet,last_polled_at,status,gaps FROM smart_wallet_live_cursors ORDER BY wallet LIMIT 3;
SELECT observed_at,wallet,signature,classification,baseline FROM smart_wallet_live_events ORDER BY observed_at DESC LIMIT 20;
```

The initial run creates baseline cursors. Historical reference transactions are explicitly labelled baseline. Subsequent runs sample newly observed signatures. If more new signatures exist than the decode budget, status is `INCOMPLETE_WINDOW`, not complete coverage.

## Budget

Nine Helius RPC requests maximum per five-minute cycle, ~2,592 calls/day if the GitHub scheduler fires exactly every five minutes. Conservative archival upper bound: 10 credits/call -> 25,920 credits/day, but actual credit costs and other GOGET consumers must be checked at the provider. Helius Free advertises 1M credits/month. This is a local lane cap, not an account-wide limit.

## Steps still needed for credible forward paper-copy P&L

1. Independently attest a full wallet signer/swap record, exactly owned token and native SOL/WSOL deltas, inner instructions, and exact pool identity; correlate actual trader rather than blindly accepting fee payer.
2. Build authenticated event-driven ingestion for sub-minute monitoring, replay and robust deduplication. GitHub cron is not a subsecond feed.
3. Audit real *realized* wallet P&L from complete trade histories, accounting for failures, fees, wash activity, and missing illiquid exits.
4. Verify beneficial holder concentration, mint controls, LP custody, exact sell route, and independently priced executable bid/ask quotes at the decision timestamp.
5. Link **only fully independently verified** events to the existing five-stage paper engine. Compare results against plain GOGET momentum over a forward test. No real-money trading without additional explicit authorization.


### Accumulation update — 31 October 2026
The active bounded collection pilot was extended to 8 November UTC. The webhook can retain quantitative transfer and native SOL movement hints; these are not independent verified executions. The configured three-wallet cohort is unchanged until measured growth is approved. A separate 6-hour signer-candidate research scan is configured, with a persisted D1 provenance table. See `docs/GOGET_DATA_ACCUMULATION_PLAN.md`.
