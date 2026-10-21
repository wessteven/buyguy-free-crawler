# GOGET Trader Radar — Research Journal 006

**Date:** 21 October 2026. **Branch:** `research/goget-trader-radar-foundation` (draft PR #1). **Mode:** read-only research; no trades, production scans, D1 or paper game integration.

## 1. All seven PHP events independently corroborated

The public Solana mainnet `getTransaction` (jsonParsed, maxSupportedTransactionVersion 1) audit matched the exact signature, timestamp, wallet signer, PHP and USDC pre/post token deltas for **all five acquisition-like** and **both disposal-like** movements attributed by third-party FOMO sources to wallet `AH75Bn6QHSt5K2Ad4p1otns3JTwpSJWZTwiwKWNhmnKx`.

The eighth, separate XTV control also matched. Each event remains a verified token-balance movement, **not** a conclusively decoded independent exchange fill or an independently identified human trader. [Raw RPC job](https://github.com/wessteven/buyguy-free-crawler/actions/runs/39577277880). Machine-readable exact signatures, fees, status and caveats: [PHP raw proof register](../data/trader-radar/php-seven-raw-proofs-2026-10-21.json).

The seven PHP signatures paid a total of **14,721,083 lamports = 0.014721083 SOL** in network fees. Of this, buy-like signatures paid 0.010649739 SOL and sell-like signatures 0.004071344 SOL. None of those fees should be counted as zero. A timestamp-aligned SOL/USD conversion, additional DEX and routing costs and independently complete opening inventory are missing.

The previously recorded **1,600.24 USDC gross FIFO matched spread is conditional**, not audited realized PnL. It depends on interpreting all seven raw balance movements as trades and on their being the complete PHP cost basis. The proof register sets verified realized PnL to `null`; the Wallet Radar score must **not** promote the account on this example alone.

## 2. Four-page Helius backscan (400 transactions)

Retrieved four sequential pages of 100 enhanced transactions for the PHP wallet, covering **17 October 2026 02:15 UTC → 21 October 2026 06:15 UTC**. All seven observed PHP movements were in the latest page, and **no other PHP movements were found in the older 300 sampled transactions**. This expands coverage but is not lifetime token-account proof: Helius parsed transfers may omit routes, and the wallet may have earlier inventory or relevant off-chain entries.

### Correction to the earlier funding description

The shorthand in the previous journal about no substantial USDC receipts was insufficiently precise. The expanded analysis identified many **large positive USDC movements outside the PHP trades**. These often occur simultaneously with an outgoing **different** token:

- 21 Oct 05:21:37 UTC: ~4,587.00 net USDC credit and ~1,795,715.40 units of `DvdmEnzt...pump` leaving, with exact transaction signature retained in the linked 400-transaction register.
- 21 Oct 05:15:54 UTC: ~522.55 net USDC credit alongside a ~199,523.93-unit outgoing `DvdmEnzt...pump` movement, signature `5poZLDz1MH52TK2RJuDf9Vaoi8pMuvdthT2rbyvJihr16H7eg9gsp6HdBHbnCHzgDVtTf3BtYBmZGWgKdPjZaJD6`.
- 21 Oct 00:46:59 UTC: ~1,145.94 net USDC credit with outgoing `zi87E9... ` token. These resemble disposals or routed settlement, **not verified independent third-party funding**.

See [400-transaction evidence and precise signatures](../data/trader-radar/php-wallet-400-transaction-history-2026-10-21.json). Direct-funder identification and PHP inventory transfer-origin remain unresolved. Do not confuse USDC sale proceeds with new injected capital.

The new `src/trader-radar-funding.mjs` distinguishes USDC receipts accompanying non-quote token disposals from genuinely unpaired USDC credits, and leaves **all beneficial ownership/funding flags unverified**. `src/trader-radar-php-proof-plan.mjs` validates and deduplicates the complete seven-event research ledger before a bounded raw audit can run. Fixture tests guard against a missing signature, duplicate, invalid time, and false funding/PnL promotion.

## 3. Market evidence and limits

The independent [106-candle PHP pool history](../data/trader-radar/php-pool-ohlcv-2026-10-21T0700Z.json) remains valid as minute-interval OHLCV observations only, not executed prices. A third-party FOMO handle is **not verified wallet ownership**.

There is still **no independently verified multi-wallet buy convergence, no validated contemporaneous pre-signal matched-token cohort, and no reportable predictive alpha**. The other apparent cross-wallet overlap (TRUMP3) was sell-like. Historical liquid-exit depth and transfer-funded opening cost basis remain blockers.

**Decision:** Keep the PHP wallet as an active research prospect. Do not certify its realized PnL, promote it to a copyable smart-money leader, trigger trades, or affect GOGET production scoring.

## 4. Tests and isolation

The new PHP ledger/funding tests run in the dedicated PR tests job, and the same workflow covers all repository JS, Python crawler tests and dashboard syntax. Public data jobs only read on-chain/provider evidence and have read-only GitHub permission. Do not merge draft PR #1 until a separate review resolves historical coverage and wallet independence.
