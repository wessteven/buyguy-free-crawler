# GOGET Trader Radar — Phase 2, bounded historical replay

**Status:** manual research foundation; no live trader PnL certification, no historical alpha claim.

## New research-only modules

- `src/trader-radar-replay.mjs`: bounded Helius RPC `getSignaturesForAddress` pagination and `getTransaction` evidence, with strict per-wallet bounds. Opposing SPL token balance changes with a single USDC/USDT leg may become **provisional research trade candidates**. No single-sided transfer, SOL-denominated quote, complex multi-token swap, malformed amount, changed token owner, missing timestamp/signature or failed transaction can be valued as a confirmed trade. Quote amounts are peg-assumed units, not independently verified USD fills. Wallet signer is observed separately.
- `src/trader-radar-forward-study.mjs`: independent historical quote observations may provide delayed-entry, same-pool, positive-liquidity forward gross quote returns. It refuses future-leaking observations, unverified independent signals, missing historical quotes and unavailable exits. No slippage, actual route or statistical alpha is claimed.
- `scripts/trader-radar-historical-research.mjs` with workflow `GOGET Manual Trader Radar Historical Replay`: only manual dispatch with existing Helius secret, reads at most four candidate wallets and twelve signature samples each, and emits sanitized evidence counts and up to three public chain signatures per candidate. No D1, no orders, no schedule and no paid Bitquery request.

## Strict evidence rules

1. A balance-derived candidate is **not confirmed**, because unrelated token movements and third-party routing may produce the same net deltas. It is excluded from `detectTraderConvergence` and from `scoreRealizedPerformance`.
2. `sourceExhausted` only means this bounded signature request returned fewer rows than the page size. It **never** proves complete history, prior acquisition basis, or total wallet PnL. `coverageComplete` deliberately remains `false`.
3. A realized score can only be computed later from genuinely independent, complete and fee-priced execution proof. No FOMO leaderboard claims are converted to verification.
4. An entry in the forward quote study occurs *after* the signal, with explicit latency, requires a matching exact mint and pool and sufficient contemporaneous liquidity, and measures gross marked quotes only. Missing exits are excluded from win rate but shown as unresolved, causing selection bias. No inference of predictive power is allowed without complete observations and a matched control.

## Review gates before production

- Verify FOMO username-to-wallet identity separately.
- Independently deduplicate beneficial owners, bots and wallets funded by the same operator.
- Build complete transaction and transfer-aware FIFO costs, with fee conversions and historical USD prices.
- Record time-stamped pool quotes and executable depth for each candidate, matched baselines, observation coverage and failed-token survivorship.
- Prove genuine predictive power without lookahead on an out-of-sample period, plus costs and loss tails.

**Not connected to scheduled crawler, D1, production scoring, alerting, live trades or paper trading.**
