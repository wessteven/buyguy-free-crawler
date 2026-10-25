# Direct Helius radar — initial live proof

25 October 2026. Initial four-cycle test PASSED. One-hour soak RUNNING at the time
this note was written; its result must be read from the workflow, not assumed.

Workflow: https://github.com/wessteven/buyguy-free-crawler/actions/runs/40156994049
Evidence: ../research/helius_fast_initial_proof_2026-10-25.json

## What was proved

Five existing exact pools (MIRLIFE, COIL, SWORDOPE, REMUS and CATTLEAXE) were decoded
as official PumpSwap pools paired with wrapped SOL. Four subsequent snapshots
verified pool ownership/layout, unchanged vault/mint registry, token-program
ownership, initialized vaults, exact mint/authority, initialized mint decimals,
positive integer reserves and a shared confirmed RPC context for each frame.
Fourteen unsupported candidates were reported explicitly, not priced generically.

Confirmed slots: 461098748, 461098890, 461099024, 461099168.
Start-to-start intervals: 30.011, 29.998, 30.000 seconds. Four successful cycles,
zero gaps. Reserve-derived prices changed for SWORDOPE, REMUS and CATTLEAXE;
MIRLIFE and COIL were unchanged during this short sample.

The test took 91.856 seconds. Actual calls: 5 Helius RPC requests, including the
initial registry discovery; 72,660 response bytes. D1 meta reported 547 rows read
and 33 rows written, including table initialization and index overhead. Estimated
standard RPC credits: 5; actual billed Helius credit consumption was not directly
measured. Independent Python Decimal calculations matched all 20 live prices to
within 1.1e-18 SOL/token.

262 JavaScript tests and 7 Python tests passed. New tests cover identity, decimal
scaling, malformed/empty/frozen vaults, changed registry, shared-slot batches,
backward-slot rejection, RPC failures/429 sanitization and recovery after an
injected transient network failure. The injected failure test is OFFLINE; a real
network disconnection was not induced during the initial live trial.

## Price meaning and limits

price_sol is the pre-fee marginal reserve ratio expressed as SOL per token.
It is NOT a last executed trade, fee-adjusted executable quote, verified exit,
contract-safety certification or buyer count. Token-2022 extensions may affect
execution. price_usd is NULL until an independently fresh SOL/USD reference is
attached. No dollar value is invented from stale metadata or an assumed peg.

A current confirmed context slot is evidence of the sampled account state, not
proof that a swap occurred at that time. No absolute upstream lag guarantee has
yet been established by an independent slot/time reference.

Supported now: PumpSwap/wrapped-SOL pools only. Raydium concentrated liquidity,
other AMMs, bonding curves and Robinhood Chain remain explicit separate work.

## Bounded one-hour experiment

The initial job gates a separate 121-cycle, one-hour soak at a thirty-second
cadence. Secrets remain in GitHub Actions; no key is logged or committed.
Each cycle requests pool state, both mints and vaults in one getMultipleAccounts
batch (shared slot). Existing registry pointers are rechecked every frame.
Backward slots or invalid pools fail closed; gaps are recorded rather than filled.

chain_radar_samples is an additive table keyed by chain/pool/minute. It retains
slot, receipt timestamp, native price, exact raw reserves and decoder version,
with at most one stored sample per pool/minute. No existing discovery, score,
asset, wallet or paper-trading table is modified by the experiment.

Projected ordinary RPC use for the soak is 122 calls including setup, plus D1
history writes. Re-read the actual summary to establish the result and usage.
The initial candidate selection read 546 rows; it is intentionally done once per
trial, not every thirty seconds. A production scheduler should cache the registry
and bound reselection frequency.

This experiment runs in GitHub Actions to establish data correctness and cost.
It is NOT yet integrated into the live Cloudflare fast-radar panel. That panel's
older market-provider experiment remains stopped. Do not interpret this trial as
permanent production collection. After the hour passes, reuse the tested module
in the existing Cloudflare Durable Object, add the fresh USD reference, measure
end-to-end lag and recoverable connection gaps, then consider streaming.

References:
- https://github.com/pump-fun/pump-public-docs/blob/main/idl/pump_amm.json
- https://solana.com/docs/rpc/http/getmultipleaccounts
- https://www.helius.dev/docs/billing/credits
