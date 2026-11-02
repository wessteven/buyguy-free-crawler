# trackCA — independent research collector

Separate Cloudflare Worker, five-minute schedule, and namespaced D1 tables. Reuses the available **buyguy-free-v3 D1 storage** without touching GOGET data or production Workers.

Tracked: 20 prior high-drawdown Robinhood Chain tokens; INJOH holding; and MIHAO (ni hao cat) on Solana, exact mint 4CxjZyMNoF1p6eXHXHv1TWpS2X47CuUmLwtGe18spump.

The every-run coverage ledger contains all 22. Eight provisional Blockscout verified-panel address candidates are sampled by exact address and chain, not symbol, while their intended historic token/pool identities undergo cross-checks. Hoodfun remains unresolved. Every candidate is explicitly tagged PROVISIONAL_BLOCKSCOUT in the coverage ledger. Priority tokens get bounded hourly Blockscout holder/transfer samples where available. Exact-address DEX Screener volume/liquidity snapshots run every five minutes, DeFiLlama provides chain-wide DEX data, and MIHAO gets GeckoTerminal one-minute OHLCV samples where its pool identity is confirmed.

**Research is incomplete until independent buyers, full whale trade attribution and realistic Uniswap v3/v4 sell-depth simulations have on-chain evidence.** Transfers do not equal swaps; DEX transaction counts do not equal unique buyers; pool gross liquidity is not executable depth. Failures are marked incomplete, never a clean signal.

Standalone Worker: `trackca-collector`. Additive schema: `trackca/sql/001_trackca.sql`.
Test: `node --test trackca/tests/*.test.mjs`.
Dashboard (after confirmed deployment): `https://trackca-collector.wessteven.workers.dev/`.

No trading, no GOGET production changes, no guaranteed recovery, no alert on price alone.

## Reliability hardening (v0.2)

- Strict D1 bind regression coverage prevents undefined values from crashing hourly coverage rows.
- DEX Screener 403/429 activates a run-wide cooldown rather than retrying every token.
- GeckoTerminal exact-contract and exact-pool fallbacks are bounded to its public limits, and MIHAO's known PumpSwap pool is identity-validated before candle attribution.
- Blockscout 403/429 stops further hourly attempts, marking wallet evidence unavailable; no fake unique-buyer or sell-depth claims.

## Independent secondary quote sampler (v0.3)

Every other five-minute run (at most 144 anonymous calls/day per provider) attempts one Crius batch request for every exact Robinhood Chain token and one DexPaprika exact-mint request for Solana MIHAO. Separate `trackca_token_quotes` observations store provider timestamps, provenance, price and token-aggregate metrics with quality markers.

Neither token price nor token-aggregate 5m/1h/24h volume is represented as exact DEX-pool trading activity. The dashboard shows only exact-pool volume in the pool-volume columns; a token-only price is marked as such. Providers can remain rate-limited. Real-time unique buyers, actual swaps, wallet accumulation and realistic executable sell depth are not yet verified, and scan status remains INCOMPLETE.
