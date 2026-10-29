# GOGET / WHAT'S GOOD — FLOAT-to-Early-Launch Radar audit (29 October 2026)

Status: **isolated draft research POC**, not active token discovery. No production deployment,
new cron, D1 migration, historical reset, market-score change, or Android modification.

## Evidence-backed gap

- Current production `src/light-scan.mjs` retrieves page 1 of GeckoTerminal Solana new pools
  at the existing ten-minute cron, requires price > 0 and at least US$15k provider-reported
  liquidity, sorts by a score with liquidity and activity biases and saves at most eight pools.
  This is a *ranked sampled feed*, not guaranteed coverage of all Solana births.
- `src/fast-radar.mjs` and `src/helius-fast-quotes.mjs` observe up to five **already known**
  PumpSwap/wSOL pools every approximately 30s. The documented 121-cycle one-hour soak passed.
  These snapshots are reserve-derived indicative prices and do not detect new launches.
  `docs/HELIUS_PRODUCTION_RADAR.md` describes the verified live integration.
- Existing opt-in `src/helius-discovery-experiment.mjs` targets PumpSwap and Raydium CPMM
  pool initialization and verification. LaunchLab bonding curves and their initializer
  instructions are not covered. `src/pool-protocol.mjs` explicitly marks unsupported pools.
- Pocket Radar PR #5, Android v0.8, is draft and has not been merged/deployed for pairing.
  This POC does not touch it.

## FLOAT retro-audit (supplied third-party snapshots, not reconstructed candles)

Token: `Bv1a7cEj5aRnJQhMw4kRQqAFesMSd5LwcDnUzq52BMmr`.

| UTC Oct 28 | Indicative market cap | Elapsed from reported 21:53 launch | What is NOT proved |
|---|---:|---:|---|
| 21:53 | ~$20k | 0m | On-chain instruction/signature, actual executable quote |
| 22:15 | $145,770 | 22m | Whether GOGET polled/received this specific curve |
| 22:33 | $884,200 | 40m | Historical fills, buyer identity, provider quote time |
| 22:37 | ~$1.6m | 44m | Successful exit at the displayed headline valuation |
| Later | ~$2.2m | Unknown | Exact time, liquidity and price path |

Sources supplied in the handover are third-party snapshots, **not** an independently
reconstructed historical time series. A separate market tracker identifies the first
FLOAT pool as Raydium LaunchLab, with subsequent graduation:
https://www.solanaterminal.com/solana/token/float/Bv1a7cEj5aRnJQhMw4kRQqAFesMSd5LwcDnUzq52BMmr

A ten-minute scheduler can miss an initial period even with perfect upstream
coverage (0–10 minutes between scan opportunities, ignoring processing delays);
its top-eight cap, >$15k liquidity gate, provider pool indexing and non-graduated
curve support make the actual historical miss probability **unknown**. No archived
D1 or RPC receipt evidence was read in this POC to reconstruct FLOAT's
actual first GOGET observation. Do not claim GOGET definitely saw or missed FLOAT.
A later creation of the CPMM pool is not equivalent to LaunchLab birth.

## Cheapest bounded step: LaunchLab creation instruction detection

A manually dispatched, 90-second Standard WebSocket `logsSubscribe` for the verified
LaunchLab program ID `LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj`.
Potential `InitializeV2` or `InitializeWithToken2022` log lines trigger an **exact**
`getTransaction` check (confirmed, jsonParsed, v0). The classifier requires:

1. Successful transaction (not a failed attempt).
2. Exact LaunchLab program ID and the Anchor initialize variant discriminator.
3. Enough correctly positioned IDL accounts: creator[1], curve/pool_state[5],
   base mint[6], quote mint[7], all syntactically plausible and non-aliasing.
4. Attribution to signature, slot and blockTime only when actually returned.

Outputs explicitly leave valuation, liquidity, unique buyers, safety, tradability,
actual creator control, and all project claims **unknown**. Logs alone never
establish an event; an instruction establishes a *birth evidence lead*, not that
the curve was a safe executable trade. A known signature may be replayed through
`FLOAT_REPLAY`; merely entering a transaction signature does not prove it
belongs to FLOAT. Historical market cap reconstruction is not provided.

**Limits per manual live run:** one subscription; max 90s (hard cap 120s); max 300
incoming log notifications; up to six transaction RPC lookups; zero D1 requests
or writes; zero paper/real trades; no production background service. The number
of Helius streaming credits and missed messages is unmeasured. A 90s watch does
not make the system 90-second token discovery. Heavy program traffic, gaps,
reconnects, expiry, null transactions, RPC lag and rate limits make completeness
unknown. This is a research viability and evidence-integrity experiment only.

### Run and validation

- Unit: `node --test tests/launchlab-birth-research.test.mjs`.
- Entire repo regression: `node --test tests/*.test.mjs` and
  `python -m unittest discover -s tests -v`.
- Manually dispatch GitHub Actions **GOGET LaunchLab birth POC** from this
  research branch. `LIVE` records a bounded window; `FLOAT_REPLAY` requires
  one independently sourced historical signature. Helius key stays in Actions secrets.
  A run that finds no births is *inconclusive*, not proof there were no launches.
- Verify the actual GitHub CI run and live sample before presenting numerical
  detection rate, streaming credit cost or operational readiness.

### Before any production integration

- Verify live LaunchLab transactions with independent RPC/account reads and
  observe failure/false-positive rates across graduated and failed launches.
- Measure the **birth-to-receipt delay**, actual bytes/credits and dropped events;
  provide a reconnect/backfill/watermark plan with bounded catchup budgets.
- Validate current LaunchLab IDL (especially Token-2022) and pool account state;
  support Pump.fun and Meteora with separate verified decoders.
- Add repeated non-overlapping 30s/1m/5m on-chain trade aggregation for exact
  curves, with verified unique buyers and wallet clustering. Do not treat
  provider transaction counts as independent buyers.
- Historical replays require independently sourced signatures plus timestamped
  quotes or raw swaps, and comparison to failed launches. Store evidence that
  existed at signal time; never optimize using future peak information.
- Gate EARLY / ACCELERATING as research-only, document score/calibration and
  safety (holder concentration, withdrawals, quote route). Reusing the 30s
  known-pool lane requires adding verified curve support, not simply adding
  a curve account to its PumpSwap registry.
- Do not deploy PR #5's paired backend or modify production cron, D1 schema,
  cooldowns, paper wallet, history, or Android signing during this experiment.

Technical references:
- Raydium LaunchLab init/account lifecycle:
  https://github.com/raydium-io/raydium-docs-v1/blob/main/products/launchlab/overview.mdx
- Helius LaunchLab parsed instruction account order:
  https://www.helius.dev/parsed-data/raydium/launchlab
- Helius standard WebSockets:
  https://github.com/helius-labs/core-ai/blob/main/helius-plugin/skills/build/references/websockets.md
