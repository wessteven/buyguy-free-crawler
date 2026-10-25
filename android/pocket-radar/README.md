# WHAT'S GOOD Pocket Radar Android v0.6

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

## v0.6 TREND / CHASE (limited public-data screening)

- **TREND** remains the provider's deduplicated ranked sample, limited to five visible tokens. A tap on a token still opens the same exact GeckoTerminal pool chart (DEX fallback charts open at DEX Screener).
- **CHASE** is a second display mode, switchable in the Android app and directly on the home widget. Switching modes reads local cache only; it does not call providers or affect Cloudflare D1.
- New feed attributes: reported Gecko `transactions.m5.buys/sells`, `pool_created_at`; fallback DEX `txns.m5.buys/sells` and `pairCreatedAt`.
- A pool qualifies for CHASE only when pool age is known and 0–72h, 5-minute buys at least 10 and 1.3x sells, +2% through +30% over 5 minutes, optional 1-hour return not below 0% or above 80%, and public reported liquidity >= $50,000.
- Candidates are ordered by net buys minus sells over 5 minutes, tie-breaking on younger age and then pool liquidity. This is **NOT** a prediction score and is not GOGET OUR SCORE.
- CHASE may legitimately show zero matches. Missing trade counts or unknown age NEVER qualify. Reported transactions are **not proven unique buyers**; wallets may wash trade. This is the provider's trending sample (at most the first page), **not** an exhaustive new-token search.
- Up to 20 bounded deduplicated candidate observations are cached per successful public feed fetch, permitting immediate local mode switches while preserving the existing minimum 60-second request spacing.
- Android widget continues to use its default OS periodic update policy, with manual refresh and immediate mode-toggle UI feedback. This is not continuous 30-second background market data.
- Trading, wallet signing, notifications, private GOGET authentication, scanner/cron/DB schema, and production GOGET queries are untouched.
