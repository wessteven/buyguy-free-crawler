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
