# GOGET Trader Radar — research-only foundation

## Scope and controls

This module is **opt-in research**, not a production signal provider. Nothing imports it from the scheduled crawler, D1, the dashboard or paper wallet. The only Actions workflow is **manual workflow_dispatch**, read-only, with no Cloudflare credentials, DB bindings, deployment permissions or order execution. The script uses the existing HELIUS_API_KEY, samples at most five distinct wallets, requests up to three signatures each, and fetches at most one parsed transaction per wallet. It sanitizes errors and never logs credentials or RPC URLs. No paid Bitquery or FOMO API connection is enabled.

## Dated research candidates

data/trader-radar/fomo-candidates-2026-10-18.json holds third-party-reported associations from FOMOAPI profiles dated 18 October 2026. Claims (including displayed PnL and wallet mappings) are **not** evidence of control, independent identities or audited returns. Never translate third-party PnL into internally verified PnL. Wallet ownership requires independent verification. Duplicate wallet/username claims are retained as conflicts rather than counted twice.

## Evidence levels

1. **Third-party candidate:** name, address and dated source only.
2. **Wallet activity observed:** read-only Helius getSignaturesForAddress; no identity or trading claim.
3. **Two-sided balance change:** parsable getTransaction shows two token balance directions; this is swap-like, not a verified USD execution, trader identity or realized profit.
4. **FIFO realized performance:** use only a complete independently verified execution ledger with dollar consideration, quantity, basis and fees for buys and sells; missing historical inventory, transfers or fees prevent a score. Under five closes produces a limited sample score and is not qualified.
5. **Convergence:** requires independent verification flags and distinct controller groups, net positive buy notional for three groups in 15 minutes. Source events must be independently verified and deduplicated by signature. This is still a research signal: pool, liquidity, token contract, sell execution and malicious linkage must be independently checked.

## Optional Bitquery adapter

Bitquery's [FOMO Solana guide](https://docs.bitquery.io/docs/blockchain/Solana/fomo-api/) (reviewed 21 October 2026) identifies signer AgmLJBMDCqWynYnQiPCuj9ewsNNsBJXyzoUhD9LJzN51, filters DFlow DEXTrades, and uses Trade.Buy.Account.Owner for a *probable* user wallet. Bitquery itself warns its mapping is imperfect and FOMO has not confirmed the signer. Its cited trade-level queries are limited to about 12 hours, and a Bitquery token would be needed to query live data. We provide a pure query template and a cautious normalizer only; **no HTTP request, token enrollment or spend**. A FOMO signer match by itself is neither a user buy nor a profitability claim. Treat unknown fee-payer, DFlow mapping and split-route transactions as unverified, never trade-triggering. Unknown or inferred identities may not be counted as independently vetted traders.

## Local tests

node --test tests/trader-radar*.test.mjs for isolation fixtures; standard existing verification remains node --test tests/*.test.mjs plus python -m unittest discover -s tests -v and node --check src/viewer.mjs.

## Future work

After evidence review, optionally: scheduled export to a *separate* research artifact with explicit budget; independent wallet-clustering controls; timestamped per-wallet realized-trade reconstruction and baseline; independent liquidity checks; zero-survivorship-bias historical backtests. Do not connect automatic orders or the existing production scoring pipeline without a separate review.
