# WHAT'S GOOD Pocket Radar Android v0.5

A **read-only Android home-screen widget** with a public Solana trending-pool ticker.
It is **not** the authenticated GOGET shortlist, buy/sell signals, real-time tick data,
or an automated trading app. Safe, separate module under `android/pocket-radar`.

## Build / install

Build from repository root with `gradle -p android/pocket-radar :app:assembleDebug`
(Java 17, Gradle 8.9, Android SDK platform 35); or download the debug APK artifact
from the **Pocket Radar Android APK** GitHub Actions workflow after it succeeds.
On Samsung, install the APK with Android's normal install permission prompt,
then long-press home screen > Widgets > WHAT'S GOOD Pocket Radar.

## Data and limitations

- Public HTTPS GeckoTerminal Solana trending pools with DexScreener paid-boost fallback; up to five unique qualified token identities
  (preferred higher-liquidity pool when duplicate) (estimated reserve >= USD 50,000, valid pool address, price and 5m change).
- Prices are **provider-derived**, not audited trade fills; pool reserves aren't
  independent sell-depth evidence, and a trending label isn't a safe-buy rating.
- App foreground refresh trigger 30 seconds, and transparent per-provider error details; provider request throttle 60 seconds
  to match approximate API cache freshness. Widget on tap and OS periodic
  ~30 minutes (Android can defer background work). Snapshot age and errors shown.
- Each coin opens its specific GeckoTerminal pool; GOGET button opens the
  existing authenticated dashboard in the device browser. No credential or
  session extraction, wallet permissions or production D1 reads.
- No changes to GOGET's existing scanner, cron, cooldown, D1 or paper ledger.

## Next integration (NOT enabled)

Add a bounded, authenticated, rate-limited, server-cached GOGET widget endpoint,
using an explicit user-issued expiring read-only credential. Never bake
dashboard cookies/API keys into APK; never expose private shortlist via
anonymous unauthenticated endpoint. Render quote timestamps independently
from local fetch time. Add tests before production use.

On feed failure, the widget keeps the last successful quote, visibly marks stale data and shows sanitized provider errors. On an initial failure it does **not** pretend the market has no pools. A provider fallback based on boosted listings is prominently labeled marketing-based. This build has no change to the underlying GOGET scanner.

### Connection doctor

The app includes a user-triggered network self-test for INTERNET permission, active validated network type, neutral public DNS, both provider domains, and the existing GOGET dashboard domain. It never overrides Private DNS/VPN or sends personal data. A provider DNS error is not a signal that no pools exist. If all domains fail, check internet/Private DNS; if only provider domains fail, investigate DNS filtering. No automatic connection changes.

## v0.5 mobile field-test checklist

- **Identity:** Gecko's base-token relationship (plus `included=base_token` when supplied) deduplicates repeat pools by exact provider token identity. Where the relationship is absent, pool-only identity is retained and cannot be treated as proven mint dedup. Different token identities sharing a display ticker remain separate and get distinguishable suffixes.
- **Momentum:** Shows 5-minute and 1-hour provider-reported percentage changes; a missing 1h change appears as a dash. Never synthesize price movement.
- **Valuation:** Shows market cap (MC) when supported; otherwise FDV is **separately labeled** instead of substituting it for market cap. Pool liquidity (LP) is not actual exit depth.
- **Compact widget:** 3 rows on a small widget; 5 on a taller widget with automatic rerender after resizing (Samsung launcher behavior may vary). The full application still shows 5 rows.
- **Health:** Previous provider fallback, error/stale state, no private keys, read-only permission profile and 60-second request floor remain.
- **Release:** An APK passing JVM parser tests/CI is **not** proof of functional performance on Samsung. Compare the widget and full app on the same timestamp before calling it field-tested.
- **GOGET:** No production scans, schema, D1, cooldowns, paper trades or trading features changed. No fabricated OUR SCORE from market momentum.
