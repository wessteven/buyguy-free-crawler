# GOGET Trader Radar — Research Journal 005

**21 October 2026. Research only.** This journal supersedes the raw/price evidence status in journal 004 without erasing the earlier uncertainty log.

## Independent raw Solana checks

Three fixed mainnet transaction signatures passed the public Solana `getTransaction` read-only checker. The wallet signer flags and exact pre/post SPL token deltas matched the Helius enhanced observations: PHP initial buy-like, PHP later sell-like, and XTV buy-like. Raw transaction network fees were 3,327,724, 2,788,602 and 20,826 lamports respectively. [Source run](https://github.com/wessteven/buyguy-free-crawler/actions/runs/39567529623).

These are **verified raw token movements**, not verified complete swap execution, FOMO social ownership, transfer-funded cost basis or realized trading profit. The two PHP network fees alone are 0.003327724 SOL and 0.002788602 SOL; the USD equivalent at the transaction moment and additional route costs are not independently reconciled.

## Historical PHP pool pricing

An exact PHP mint and pool match was obtained from GeckoTerminal's public API. The provider returned 107 minute bars; 106 passed interval integrity and 07:00 UTC cutoff validation. The [full price evidence](../data/trader-radar/php-pool-ohlcv-2026-10-21T0700Z.json) is retained, with the [source job](https://github.com/wessteven/buyguy-free-crawler/actions/runs/39567442019).

Later candle closes at 05:16, 05:24, 06:08 and 06:17 UTC were $0.0000676005, $0.0000746318, $0.0002469076 and $0.000251857 respectively. These are **minute-candle closing prices AFTER wallet events**, not historical executable bids/asks, not trader transaction prices and not proof of actual realized wallet returns. Historic minute-level liquidity/depth was not established; live or hourly liquidity cannot be silently backfilled.

## Cost basis and funding

The 100-transaction sample of the wallet attributed to bystevenr showed five PHP acquisition-like movements (2,133.630774 USDC units) and two disposal-like movements (1,922.833193 USDC units). A strictly conditional FIFO exercise over those seven movements yields an illustrative gross matched spread of 1,600.24 USDC, but **verified realized PnL remains NULL** because several transactions, opening inventory, other transfer-funded holdings, full execution route costs and fees require independent work. Do not use this scenario as a trader score.

No isolated USDC inflow greater than 25 units appeared in the inspected latest 100 enhanced transactions for either the PHP or XTV wallet. This is bounded absence, **not evidence that wallets are self-funded** or that their opening cost basis is zero.

## Matched-control result

The sampled candidate wallets had no independently verified three-wallet positive accumulation. Earlier shared TRUMP3 flow was sell-like. The matching engine has no adequately timed ex-ante universe of peer tokens with comparable token age, liquidity and capitalization, nor reliably timestamped executable depth. Therefore **matched control pairs = 0** and **predictive alpha = unknown**. Fixture-based matching tests demonstrate code gates, not actual performance.

Third-party PHP screens report potentially bundled or linked launch-wallet activity and adverse creator history. Treat these reports as unconfirmed risk allegations, not proof of wrongdoing or wallet attribution.

## Safety and checks

All work resides in draft PR #1; production scans, D1, dashboard and paper trading are untouched. Current evidence file: [verification-summary JSON](../data/trader-radar/2026-10-21-verification-summary.json). Latest checked GitHub suite: 48/48 Trader Radar JavaScript tests, 276/276 full JavaScript tests and 7/7 Python tests, all passing. No auto trades, paid API commitments or production alerts were enabled.