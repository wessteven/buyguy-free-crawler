# GOGET Phase 3 — Enhanced Helius evidence and provisional crowding

## Scope
The `src/trader-radar-enhanced.mjs` module consumes previously obtained enhanced Helius transaction objects **without issuing network calls**, without D1 and without triggering production alerts. It nets tokenTransfers by `fromUserAccount`/`toUserAccount` for an exact wallet to detect opposing USDC/USDT and token movements in a single signature. This is a low-confidence proxy, not a certified swap. Token balances can be affected by unrelated actions, royalty flows, LP activity and batched routes.

## 21 October 2026 direct Helius research pass
- Four wallets from the dated 18 Oct unofficial FOMOAPI snapshot; 50 latest returned enhanced transactions per wallet, 200 sampled in total. Partial histories differ substantially in calendar coverage across wallets.
- Provisional opposing quote/token flows: ExactTallTakin 15/50, bystevenr 27/50, end837 36/50, bigbabba 47/50. Total **125** two-sided candidate observations.
- Exact-mint overlap was observed for `6s2umN1sqM8mS8ERRmt9cqcFwAoWu5ofma7DN3KfFiue` (ExactTallTakin and bigbabba), but **both wallets showed sell-like flows** in the examined sample; five sell-like observations from 20 October 23:59 UTC to 21 October 03:47 UTC. These were not a simultaneous buy cluster.
- Other inspected buying-like examples: bystevenr `Cbkg5w7V7W2J2sUmecnyN825CbvwvXwasfhduVtNpump`; bigbabba `6MBf1XdZNSAaDKcxxbnCAngRUxBmwbHS5Ybe2rLRpump`. **No verified multi-wallet early accumulation**, no realized PnL, and no credible historical outcome measurement.
- Amounts such as "100 USDC" are raw USDC token-unit deltas. They are not independently verified executions, USD proceeds or investment recommendations.
- Data were read using connected Helius enhanced-transactions tools. The manual GitHub historical replay workflow was **not** dispatched; workflow dispatch is not exposed by the current GitHub connector and research workflow is not merged to the default branch.

## Safe gates
All provisional events explicitly report `confirmed: false`, `tradeExecutionVerified: false`, `independenceVerified: false`, and no realized PnL. The 15-minute provisional crowding function does not produce a trade-qualified signal, regardless of the number of wallet flows. A research-only overlap is not proof of independent traders, market safety or tradable liquidity. Run targeted raw JSON-RPC transaction verification, independent signer/owner review and valid historical pool quote retrieval before any more ambitious claims.

No production, D1 or paper-trading modules are modified by this phase.
