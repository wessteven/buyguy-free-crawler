# GOGET historical Solana pool-creation evidence (2026-10-21)

Research only. These explorer records are **not** Helius replay results.

## Raydium CPMM — independently observed successful initialize transaction
- Signature: `25mwtoditp55vn7kQtqs4RmEfhvEZ4x4AxGFS68M62vnCSwbeQ7Efg9j4ovMen1XwvLVZNFyMPYBjxdVaTgBSkJv`
- Explorer: https://solscan.io/tx/25mwtoditp55vn7kQtqs4RmEfhvEZ4x4AxGFS68M62vnCSwbeQ7Efg9j4ovMen1XwvLVZNFyMPYBjxdVaTgBSkJv
- Explorer explicitly reports successful Raydium CPMM `initialize`, Jan 16 2026, version 0.
- **Expected pool-state address NOT yet independently confirmed.** Explorer labels `Dw4uLKPb3tvRfuUYNvaiNMZyCk85c4zLffaieVXUDUxF` as 'Market', but do not assume that label identifies the CPMM pool-state account without checking instruction account index 3 on-chain.
- The two 'Pool' accounts `14gc8LotGoQuCEYuCeNWvdhRCVmA88BQm3BptfP78pDSi` and `2AoFuGQ1gxQYmKkiWxpMMzGB5o33iYaBiFbmqWk4Rdjsa` appear to be vault/token accounts, not proven pool-state accounts.
- **Do not submit a guessed expected_pool** to the manual replay workflow.

## PumpSwap — independently observed migration / pool-creation transaction, not proven create_pool discriminator
- Signature: `4NXg3BhMk7VHaa5mWkptwSweHXZCuBeFcL5hqonuFmMTNFbu4sRLkp4i81psZFbBkAJCF18Vbm8kpp8KPmGhF1kx`
- Explorer: https://solscan.io/tx/4NXg3BhMk7VHaa5mWkptwSweHXZCuBeFcL5hqonuFmMTNFbu4sRLkp4i81psZFbBkAJCF18Vbm8kpp8KPmGhF1kx
- Explorer shows successful Pump.fun AMM pool creation via a `migrate` action on Aug 30 2026.
- **Not a verified `create_pool` instruction**; this could be a distinct migration path and is a useful **coverage-gap candidate**, not a positive test for the current `create_pool` discriminator.
- Explorer identifies PumpSwap market/pool-state candidate `6yzJjoxUUrXX8qfnV9mUNqXQHWAqb7mvrkaKm2kJMrkx`; this is NOT yet owner/layout verified via Helius. Distinguish it from the token vaults `1H6GLnCjpRdA53oVAJ3rjag1idqLyPJKvVRNw6Siomxdm` and `2GbqFM6qYeBRkobBDWnYXYHT9TEbjydg1n9EnA2a9ZRwt`.
- Pump.fun `migrate` is a different instruction/program from PumpSwap `create_pool`; the existing binary decoder does not handle this route. Treat as a **known migration coverage gap**, not as a failed `create_pool` decoder fixture.
- Expected pool-state address remains NOT independently verified through Helius account ownership/layout.

## Validation protocol
1. Retrieve each transaction with authenticated Helius `getTransaction`, `encoding:jsonParsed`, `maxSupportedTransactionVersion:0`.
2. Resolve account index 3 (Raydium) or 0 (PumpSwap create_pool) using the transaction's actual instruction accounts, including versioned account lookups.
3. Independently verify pool-state owner and layout before entering `expected_pool`.
4. Run the manual workflow with exact signature and verified expected pool; record positive, negative, or RPC-inconclusive outcomes.
5. Keep separate labels for PumpSwap `migrate` and `create_pool` paths. Do not convert a migration into a create_pool positive fixture.
