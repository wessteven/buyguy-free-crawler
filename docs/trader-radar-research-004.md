# Trader Radar research 004 — raw verification, transfer-funded basis and controls

Research date: **21 October 2026**. All work restricted to GOGET draft PR #1, no production D1, crawler or paper-trading changes.

## Independent raw verification status

Solana's canonical `getTransaction` returns per-transaction `meta.preTokenBalances` / `meta.postTokenBalances`, token owners, account indices, signer information and fee in lamports. The Helius enhanced response (earlier research) is an indexer's parsed classification, **not** an independent raw chain verification.

Three fixed transaction signatures have been prepared for independent **public Solana mainnet** JSON-RPC recheck. `scripts/trader-radar-public-raw-probe.mjs` does not access any secrets, orders or D1. Its separate PR workflow is not a permanent scheduler. A failed public RPC request must be reported as unavailable, never corroborated. Until raw probes return successfully, raw execution remains **unverified**. Even a raw token balance match is not certification of a paid DEX swap, a beneficial owner, or historical cost basis.

## Transfer-funded cost basis and indicative PHP sequence

Expanded direct Helius query examined the 100 most recent transactions for each of three candidate wallets, with unequal calendar coverage. The address attributed to @bystevenr yielded five USDC-debit/PHP-credit events (aggregate **2,133.630774 USDC units**) and two PHP-debit/USDC-credit events (aggregate **1,922.833193 USDC units**). The earliest returned transaction predates these PHP movements, but this sample does not prove token launch chronology or complete acquisition history.

A purely hypothetical FIFO exercise over the seven observed two-sided flows estimates **1,600.24 USDC gross matched spread** on the two observed disposals and **29,172,309.30 PHP** remaining. **This is not verified profit.** It assumes all events are actual purchases/sales, all prior inventory was zero, no external transfer-funded lots, valid quote tokens and complete execution costs. Network and priority fees are not priced in USD and DEX route costs may be missing. This illustrative number MUST NOT feed rankings, automated signals, profit trackers, or public performance claims. Documented source data and explicit null verified PnL are in `data/trader-radar/2026-10-21-cost-basis-study.json`.

The address attributed to @bigbabba had six XTV purchase-like token flows totalling **2,086 USDC units** without a matched sell within the last 100 returned wallet transactions. No realized outcome can be computed. Separately, cross-wallet overlap in TRUMP3 was **sell-like**, not a positive accumulation event. FOMO profile ownership is still a third-party association.

## Historical market-data gate

GeckoTerminal documents Solana token-to-pool discovery and timestamped pool OHLCV: https://api.geckoterminal.com/docs/index.html . An exact-mint PHP PumpSwap pool page was found at https://www.geckoterminal.com/solana/pools/YQ4NNeQxHAtdcB8ohx21eJ9U8eTzxNRvGNHkRaA4Pnw . Public API JSON access was unavailable from the active research environment, so **no historical candle values were retrieved**. Intraday highs, lows and latest pool liquidity from third-party web pages are NOT interchangeable with timestamped executable depth.

New offline pure adapters validate exact pool/mint, candle interval close and observation cutoff, and will not invent executable quotes or past liquidity. The matched-control layer uses only pre-signal recorded liquidity, capitalization, token age and protocol from an actual historical universe. With zero independently captured contemporaneous control inputs and historical quotes today, outcomes and predictive alpha remain **unknown**, not positive or negative.

## Safety and ecosystem warnings

The PHP launch has third-party reports of related launch-wallet bundling and adverse creator history (Pumppill, Unhosted). These are unconfirmed risk allegations and cannot be attributed to the wallet being audited without independent tracing. They provide a reason for stricter controller independence tests, not a conviction or a trading recommendation.

All new adapters are opt-in research only; no scheduled production scan or D1 table changes. Tests and PR status must be checked independently after each commit.
