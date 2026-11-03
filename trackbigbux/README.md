# trackBIGBUX — independent public wallet research collector

Independent source folder, Cloudflare Worker, five-minute cron, trackbigbux_-namespaced D1 tables, quality ledger and deployment workflow. Separate from GOGET and trackCA in code, runtime, data namespace and operation. This project never trades, signs, changes balances or updates those two systems.

## Frozen v1 roster: 12 exact on-chain wallets

5 Solana: G4, Polish Batman, Decu, Cented, end837.
7 Robinhood Chain 4663: Unipcs, theveeman, ogle, 0xAvast, AvgJoesCrypto, The__Solstice, Frank DeGods.
Exact IDs, chain and wallet addresses are in src/wallets.mjs. These are candidate identities, not guarantees of ownership or historical profitability. Never silently reduce the denominator.

## Collection

* Every five minutes: Solana Helius RPC address signatures and a Robinhood Chain public-RPC fallback that gathers ERC-20 Transfer logs for the seven exact addresses (incoming and outgoing, bounded blocks, block height, contract and raw token amount). The public Robinhood explorer returned HTTP 403 from Cloudflare; its full transaction history is NOT monitored by the fallback. Every Robinhood flow is classified ERC20_TRANSFER_NOT_SWAP. Robinhood's keyless RPC is rate-limited and not production-grade; failed/rate-limited requests remain visible. An optional private GitHub Actions secret TRACKBIGBUX_RH_RPC_URL (injected only into the dedicated Worker when configured) can point to a dedicated HTTPS Robinhood Chain RPC (for example an account's Alchemy endpoint); the collector verifies chain ID 4663 and never saves its URL or API key in D1. Public RPC requests are spaced by at least 1.2 seconds within an active Worker isolate, with no immediate 429 retry burst; this is not a cross-isolate quota guarantee. Without that credential, HTTP 429 coverage failures may continue; the code cannot promise live RPC recovery.
* Each wallet always gets an independent coverage row, including provider failures, baseline-only status, checkpoint overflow and unknown classification.
* Every attempted provider request gets a bounded receipt with status, number of returned records and response observation time; API keys and full request URLs are never written.
* Every hour: up to 60 Solana signatures are enriched via the Helius Enhanced Transactions parser. Undecoded signatures remain pending and explicitly counted.
* Classification never equates an airdrop, incoming transfer, named profile or mere account participation with a trade. Solana WALLET_SWAP_EVIDENCE requires parsed SWAP and both owned inflow/outflow; Robinhood transactions remain TRANSACTION_NOT_VERIFIED_SWAP until transaction/log-level parsing proves economic exchange.
* Exact-wallet confirmation and profitability reconstruction are independent later research stages. No fabricated P&L, 30/90-day win rates, copyable fills, token rankings or live trading conclusions.

## Collection bounds and data integrity

Solana RPC reads 301 signatures per page, up to five pages per address if the saved checkpoint is absent from the first page; page receipts and a gap are explicit. A missing checkpoint is NEVER advanced, so interrupted history can be retried, but coverage remains incomplete until the exact old checkpoint is recovered. This can increase Helius usage up to 1,505 signatures per high-velocity wallet per five-minute run. Robinhood public RPC checks at most 6000 blocks per wallet per scan, with two shared exact-cohort Transfer-log queries for all seven wallets (rather than fourteen individual queries), with explicit result size caps; each wallet gets a persisted numeric block watermark. Any RPC backlog is explicit; no checkpoint advances on malformed logs or failed requests. The old Blockscout transaction endpoint is retained in code but disabled in the deployed configuration due to HTTP 403. These caps protect provider budgets, but do not mean exhaustive high-frequency coverage. A prior checkpoint not found sets CHECKPOINT_NOT_FOUND and increments a persistent gap counter; the missing interval remains unverified. Initial baselines never qualify as complete history.

The frozen monitoring denominator is always 12 per run. The worker appends trackbigbux_ events, run records, per-wallet source receipts, wallet watermarks and quality results to the pre-existing buyguy-free-v3 D1. No new database is needed. Do not imply writes succeeded until D1 is independently queried.

## Deployment

The standalone Cloudflare Worker is trackbigbux-collector. Configuration is in wrangler.toml. An independent GitHub Actions workflow runs tests on PR and deploys only on a tested push to main. Existing CI secrets CF_ACCOUNT_ID, CF_DATABASE_ID, CF_D1_API_TOKEN, CF_DEPLOY_API_TOKEN and HELIUS_API_KEY are used without copying any values into the repository.

Tests: node --test trackbigbux/tests/*.test.mjs
Syntax: node --check trackbigbux/src/worker.mjs
D1 schema: trackbigbux/sql/001_trackbigbux.sql (idempotent, additive)

## Read-only endpoints, available only after verified deployment

Status: https://trackbigbux-collector.wessteven.workers.dev/api/status
Health: https://trackbigbux-collector.wessteven.workers.dev/health
Wallet events: https://trackbigbux-collector.wessteven.workers.dev/api/events?wallet=sol-g4&limit=100
Dashboard: https://trackbigbux-collector.wessteven.workers.dev/

Successful deployment does NOT prove persisted monitoring. Confirm a completed run, all 12 matching coverage rows, raw events or explicit no-activity receipts, and data freshness.

An independent GitHub Actions auditor (trackbigbux-audit.yml, hourly) compares the frozen 12-wallet manifest against actual D1 coverage rows, receipts, timestamps, activity counts and prior verdicts. The in-worker quality claims alone never count as proof. This external audit verifies persisted execution records, not provider response authenticity or actual trading profitability. The user will request analysis after collection, so no unsolicited trading decisions should be made. The external independent auditor should report partial Robinhood transaction coverage until full on-chain transaction/receipt decoding is available; a successful ERC20 Transfer-log capture does not establish buy/sell decisions or profitable trades.

## Recovery patch — 2026-11-03 (draft, not deployed)

The pending PR adds multi-page Solana checkpoint recovery with a no-watermark-advance guard; a rotating, bounded per-run enrichment caller; and opt-in dedicated Robinhood RPC routing. Regression tests are not live provider proof. The external D1 auditor must still verify 12/12 exact wallets and honest per-source receipts. Even successful ERC20 Transfer-log reads do not constitute full Robinhood transaction history, verified buys or audited P&L. Keep collector and auditor separate from other engines.

## External audit timing and source evidence

Independent D1 auditing checks the newest **finished** source scan. If the latest five-minute scan is still `RUNNING`, the audit separately reports that active scan and evaluates the last finished scan rather than inventing missing wallet coverage from half-written D1 rows. An active scan older than ten minutes is a verification failure. The auditor also includes Helius parser attempt/response counts and actual classified-row totals; source receipts alone never establish trading P&L. The strict 12/12 address, checkpoint and source-call gates remain unchanged.

## Helius parser 404 repair (3 Nov 2026)

The external D1 auditor observed `UPSTREAM_HTTP_404_api-mainnet.helius-rpc.com` from the old `/v0/transactions/` URL and zero successful parser calls. The corrected endpoint uses `/v0/transactions` (matching current Helius SDK); only on HTTP 404 may the collector retry the legacy `api.helius.xyz` URL. Errors such as 401/403/429 are never circumvented by fallback. Source host and sanitized response status are retained as parser receipts. Pending rows remain pending until an actual enhanced array returns and wallet-specific classification succeeds. Live provider success and throughput must be verified by D1 audit before claiming backlog recovery.
