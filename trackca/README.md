# trackCA — independent research collector

Separate Cloudflare Worker, five-minute schedule, and namespaced D1 tables. Reuses the available **buyguy-free-v3 D1 storage** without touching GOGET data or production Workers.

Tracked: 20 prior high-drawdown Robinhood Chain tokens; INJOH holding; and MIHAO (ni hao cat) on Solana, exact mint 4CxjZyMNoF1p6eXHXHv1TWpS2X47CuUmLwtGe18spump.

The every-run coverage ledger contains all 22. Nine ambiguous Robinhood contracts remain unresolved, never matched by symbol. Priority tokens get bounded hourly Blockscout holder/transfer samples where available. Exact-address DEX Screener volume/liquidity snapshots run every five minutes, DeFiLlama provides chain-wide DEX data, and MIHAO gets GeckoTerminal one-minute OHLCV samples where its pool identity is confirmed.

**Research is incomplete until independent buyers, full whale trade attribution and realistic Uniswap v3/v4 sell-depth simulations have on-chain evidence.** Transfers do not equal swaps; DEX transaction counts do not equal unique buyers; pool gross liquidity is not executable depth. Failures are marked incomplete, never a clean signal.

Standalone Worker: `trackca-collector`. Additive schema: `trackca/sql/001_trackca.sql`.
Test: `node --test trackca/tests/*.test.mjs`.
Dashboard (after confirmed deployment): `https://trackca-collector.wessteven.workers.dev/`.

No trading, no GOGET production changes, no guaranteed recovery, no alert on price alone.
