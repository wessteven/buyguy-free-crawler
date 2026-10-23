# GOGET — Free crypto source audit (24 October 2026)

**Status: research branch only; not deployed.** This inventory is a planning and evidence record, not a proposal to automatically buy tokens, change filters, or consume D1 quotas. Reviewed using the main-branch README and relevant source modules on 24 October 2026.

## Existing infrastructure — reuse, do not duplicate

| Source | Observed use in repository | Constraints |
| --- | --- | --- |
| GeckoTerminal | new pools, exact-pool fallback, known-price refresh | Public rate limits and occasional provider failures |
| DEX Screener | profiles, new-token signals, exact-contract quotes | Response trade counts are **not** unique buyers; returned pool may not be canonical |
| Helius RPC | mint/holder/program probes, bounded Solana transaction checks | Credential and quota limits; existing secret must never be printed |
| Jupiter | optional two-way indicative USDC quotes | A possible route is not a proven successful sale; keyless throttling |
| Pump.fun official IDLs/docs | bonding curve and canonical migration verification | Treat upgrades and unfamiliar pool versions as uncertain |
| Cloudflare D1 + GitHub Actions | bounded persisted research, lightweight cron and deeper jobs | D1 Free daily row-read cap; never add unbounded read loops |

Verified main-branch files: README.md, src/viewer.mjs, src/on-demand-audit.mjs, src/hard-refresh.mjs, src/score-journal.mjs, src/discovery-quality.mjs, src/scheduled-research.mjs. In particular, buyerEvidence remains **transaction_counts_only** in discovery quality.

## New candidate resources (incremental value)

| Priority | Resource | Practical use | Free/operational caveat | Decision |
| --- | --- | --- | --- | --- |
| 1 | [GoPlus Node SDK](https://github.com/GoPlusSecurity/goplus-sdk-node) / [API](https://docs.gopluslabs.io/reference/api-overview) | Independent token-security evidence on [Solana](https://docs.gopluslabs.io/reference/solanatokensecurityusingget) and [Robinhood chain 4663](https://docs.gopluslabs.io/changelog/token-security-api) | Apache-2.0 SDK; public documented 30 calls/min; endpoint may rate-limit, require auth, or return partial results | **Isolated proof-of-concept** |
| 2 | [Solana Token-2022](https://github.com/solana-program/token-2022) | Better interpretation of extensions, transfer hooks, authorities | Apache-2.0 workspace; verify what existing mint-risk code already decodes | **Gap audit first** |
| 3 | [Meteora DLMM SDK](https://github.com/MeteoraAg/dlmm-sdk) | Liquidity bin concentration and executable sell-depth modelling | Free source, RPC and protocol-specific complexity; product coverage is not universal | **Research only** |
| 4 | [Raydium SDK V2](https://github.com/raydium-io/raydium-sdk-V2) | Raydium pool reserves/liquidity distribution | Repository package declares GPL-3.0: do license review before bundling; no Raydium CPMM in repo's 35-pool survey | **Defer** |
| 5 | [TradingView Lightweight Charts](https://github.com/tradingview/lightweight-charts) | Better charts for recorded snapshots/outcomes | Apache-2.0 plus TradingView attribution/NOTICE requirement; historical data still required | **UI-only research** |
| 6 | [DefiLlama Free API](https://github.com/DefiLlama/api-docs/blob/main/llms-free.txt) | Historical chain/protocol TVL context | Public no-auth routes; not a per-mint buyer feed | **Low-priority context** |
| 7 | [Freqtrade](https://github.com/freqtrade/freqtrade) | Backtesting methods, leakage/bias checks | Free source; exchange infrastructure/model mismatches mean not a plug-in GOGET trading engine | **Methodology only** |

## One-shot zero-dependency probe

File: research/free-source-probe.mjs. It compares a token's DEX Screener exact-contract/pool evidence with GoPlus **independent risk fields**. No SDK installation, API key, RPC call, wallet connect, D1 access, transactions, background schedule, or production imports.

Run explicitly, never via cron:

    node research/free-source-probe.mjs solana TOKEN_MINT [POOL_ADDRESS]
    node research/free-source-probe.mjs robinhood 0xTOKEN_CONTRACT [0xPOOL_ADDRESS]

Budget: **exactly two HTTP GET attempts per run** (one DEX Screener, one GoPlus), each with an 8-second timeout, no retry. Strictly allowlisted hosts and validated chain-specific addresses. A missing supplied pool means unverified pool selection; a supplied but mismatched pool fails closed. The local retrieval time is **not** provider quote freshness. GoPlus fields are never converted into a safe/buy rating. HTTP 401/403/429, missing results and incomplete/invalid payloads remain visible and do not fill absent data. DEX buy/sell counts do not prove independent wallets, and quoted liquidity does not establish executable depth.

Provider docs: [DEX Screener API](https://docs.dexscreener.com/api/reference), [GoPlus response statuses](https://docs.gopluslabs.io/reference/api-status-code), [GoPlus rate limits](https://docs.gopluslabs.io/reference/support). These describe limits at review time, not guaranteed future free service.

## Validation and promotion gates

1. Run the deterministic no-network tests: `node --test research/free-source-probe.test.mjs`.
2. Confirm no code imports this module from production Worker, scheduler, dashboard or D1 stage.
3. Run a **single manually initiated** live probe of an exact mint with a known pool. Treat HTTP 429, forbidden access and missing data as blockers, not healthy responses.
4. Compare its evidence to existing on-demand audits for the same exact mint and pool. Investigate conflicts; never silently override a prior security determination.
5. Before any product integration: measure actual request costs, historical coverage, unique buyer verifiability, rate limits, branch licensing and impact on D1 reads.
6. Production promotion is **not authorized** by this branch or its tests. Any later implementation needs a separate reviewed change and quota-safe regression suite.

Preservation contract: scanner filters, 30-minute cooldown, ten-minute cron, D1 schema/data/history, OUR SCORE and paper trading remain untouched.

## Live verification — 23 October 2026 UTC (24 October local)

The GitHub Actions **one-shot public evidence workflow** completed with no credentials, writes, D1 access, swaps or transactions. Results are immutable snapshots of third-party responses; they are not current-price promises or on-chain safety certification. The **temporary workflow was removed** after data collection to eliminate repeated PR-triggered API probes. Evidence logs: [first exact-pool comparison](https://github.com/wessteven/buyguy-free-crawler/actions/runs/39963787428) and [post-parser-fix comparison](https://github.com/wessteven/buyguy-free-crawler/actions/runs/39964114499).

| Chain/token | DEX Screener result | GoPlus result | What remains unknown |
| --- | --- | --- | --- |
| Robinhood 4663, SINJOH/INJOH, `0x2cc0fac44b8252f6b10208b091aff2c94b4da77d` | Supplied pool `0xB09fa4f04032b9d9e690ac4a1d29523b5f9A72DC` matched exactly. Quoted price $0.0024, reported liquidity $197,423.27, 0 buys and 0 sells within 5m | Token address matched. Seven of seven tracked contract-safety capabilities reported: `is_honeypot=0`, `cannot_sell_all=0`, `is_mintable=0`, `is_open_source=1`, `is_proxy=0`, `is_blacklisted=0`, `transfer_pausable=0`; buy and sell taxes each 0; `holder_count=6015` | Whether the quote can execute at size, lock/vault evidence, actual beneficial owner concentration, independent sell simulation, and the user's separate wallet valuation issue |
| Solana, Aura Final Boss/Kimchi mint `Am8iBffqgaedfdK5XhtorbcRrKzwH9nyL3ySikQfpump` | Without a supplied pool, a PumpSwap pool `6f1HD3hodH3A8zHSL4ddA5yB6TjGYpidwiZVHJJRBn5M` was returned: price $0.0001812, liquidity $52,351.76, 0/0 5m buys/sells. **Not canonical-pool verification**. Previously supplied Meteora DLMM pool `9LhZzwwRhkXwdtdSgCNeNTbzjMV8Xpq3KgvUVeqDUFvg` was **absent** from the exact-pool DEX request, not proven closed or empty | Mint matched. All eight parsed *nested* `{status}` flags returned 0: `mintable`, `freezable`, `closable`, `metadata_mutable`, `transfer_fee_upgradable`, `default_account_state_upgradable`, `balance_mutable_authority`, `transfer_hook_upgradable`; `non_transferable=0`; holder_count=4709 | Whether Meteora pool remains tradeable elsewhere, true executable depth in each pool, controller/funding links, unique buyers and full authority/account proof |

**Critical parser finding:** GoPlus Solana API returns capability checks as nested objects such as `mintable.status`, not flat EVM-style `is_mintable`. The first prototype retained only scalar fields and therefore incorrectly labelled this mint as having *partial* risk evidence. The parser has been corrected using [official Solana response documentation](https://docs.gopluslabs.io/reference/response-detail-1); the later live run returned 8/8 statuses. Unit tests cover nested 0/1 values, missing statuses and no leakage of authority addresses.

Interpretation: these provider flags did not identify the tracked hazards at the observation time. They do **not** prove absence of all risks. DEX 5-minute buys/sells are aggregate transactions rather than proof of distinct counterparties. Provider response retrieval time is not authenticated quote timestamp.

**Usefulness to GOGET:** This probe demonstrated incremental Robinhood contract screening and a viable Solana security cross-check, and it independently exposed missing/changed pool coverage. Prefer integration *as a labelled independent evidence layer*, **not** a purchase gate or OUR SCORE change, until production-safe D1 quota modelling, coverage sampling, upstream failure handling and provider-specific caveats are reviewed.

## Verified CI
The research-only Node 22 GitHub Actions run [39964114276](https://github.com/wessteven/buyguy-free-crawler/actions/runs/39964114276) finished **13 tests passed, zero failed** after Solana nested decoding. The branch comparison contains only five new research/CI/doc files, no Worker, scheduler, schema or paper-trading edits. Do not merge or deploy as part of this audit.

## Independent Robinhood contract cross-check (authenticated Blockscout PRO)

The user's private Blockscout PRO Reader was **independently authenticated** in this session at 2026-10-23T13:50:24Z using a successful Robinhood Chain research call and a deliberately rejected invalid-key control; **the shared allowance was not used**. Credentials and raw authentication material were not retained.

[INJOH contract on Blockscout](https://robinhoodchain.blockscout.com/address/0x2cC0FAC44B8252f6B10208B091aFf2c94B4da77D?tab=contract): Blockscout PRO reports name `PonsLauncherToken`, Solidity v0.8.30, fully verified, non-proxy, with 18 decimals and one-billion whole INJOH in total supply. Public constructor args set `maxWalletBps=500`, `maxTxBps=550` and `restrictionBlocks=2`; the verified source explains these 5%/5.5% limits apply to **canonical pool buys only during the initial launch window**, not perpetual limits on ordinary transfers. Its constructor calls `_mint(msg.sender,supply_)`; the inspected main contract declares no public/external mint function. These narrow findings are consistent with GoPlus `is_mintable=0`, `is_proxy=0` and `is_open_source=1`. Blockscout does **not** report the contract as formally certified/audited.

PRO's token holder count was **6014**, versus GoPlus **6015**, fetched within minutes. That one-holder discrepancy is evidence of separate indexing/capture points, not proof either is wrong; preserve source and observation times instead of silently preferring one.

This cross-check supports useful independent contract evidence but **does not certify** the pool's available exit depth, beneficial ownership, other linked Sinjoh/PONS contracts, governance outside the token, off-chain data feeds or the wallet-home valuation discrepancy. Keep all trading disabled and existing gates unchanged.
