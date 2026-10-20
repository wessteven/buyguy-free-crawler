# WHAT'S GOOD? Night Lab — 20–21 October 2026 (Norfolk Island time)

This folder is the **off-D1, append-only research log** for the 12 hourly runs (21:00–08:00 local). The experiment was started at approximately 20:50 local and the initial baseline is `2026-10-20T0850Z-baseline.json`.

## Rules

1. Use exact `chain + mint / contract` identity. Never match by ticker alone. Never reuse a Moby invite code for another token.
2. **Every observation is immutable** and belongs in a separate timestamped file like `2026-10-20T0900Z.json`, `2026-10-20T1000Z.json`. Keep this initial baseline unmodified. Log `null` when data is unavailable.
3. Timestamp source retrieval and the price candle/market observation independently. Link its exact source URL and pool address. If a claimed historical price is estimated, include `reconstruction_method`, `source_interval`, and `confidence` instead of passing it off as a verified tick.
4. The 8 initial contracts were found via DexScreener's **paid promotion / boosts feed**, not unbiased organic trending. Helius resolved Solana mints and indicative USDC prices; private Blockscout PRO authenticated Robinhood Chain contract QVR. **No exact market liquidity, market cap, unique buyers or full independent safety audit was established at first scan.** All score verdicts are pending evidence.
5. The field `implied_fdv_proxy_usd` is derived from the displayed **minted token supply**, decimals and indicative price; it is **not a circulating market cap**. Never silently substitute it into the MY SCORE/OUR SCORE market-cap factor.
6. Use a current snapshot and a historical observation in the **same pool** to compute an *indicative* price return. Missing/changed-pool data remains missing, not zero, not a loss and not a win. Compare 15m / 1h / 6h / 24h where the source resolution permits. Include spread/slippage uncertainties.
7. The main test is **whether independently observed buying, liquidity and sustained interest predict future outcomes**. Split high-conviction leads from lower-scoring controls; keep losers for training and audit survivorship bias.
8. Raw records are research observations only. Do not execute buys or sells, do not invent profit, and do not silently enable simulated real-time trading.
9. When a later run cannot access connected GitHub, provide the full machine-readable record in its task response. When GitHub is available, append a new timestamped file and summarise what changed; do not overwrite historical records.
10. Produce a full overnight review by the final 08:00 local run, including denominator/missing-data rate, observed winners/losers, comparison group, failures, hypothesis revisions and potential improvements to WHAT'S GOOD. Do **not** automatically change production score weights based on a dozen hours of small-sample evidence.

## Source catalogue

- DexScreener promotion discovery: https://api.dexscreener.com/token-boosts/latest/v1
- DexScreener public API reference: https://docs.dexscreener.com/api/reference
- DexScreener pool/token charts: `https://dexscreener.com/<chain>/<contract>`
- Helius `solana_get_asset`: exact Solana mint metadata and token-info quote if available
- Blockscout PRO Reader: chain 4663, per-session authenticated and invalid-key control verified on 2026-10-20T08:50Z; never fall back silently to free 8-call allowance.

## Interpretation

Treat 'discovery_lead' as **requires qualification**, not "BUY" or certified "HOT". Paid boost visibility can be purchased. Source/provider failure is information about observation quality, not information about token success. Archived failed candidates contribute just as importantly as profitable observations.
