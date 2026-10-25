# WHAT'S GOOD Pocket Radar Android v0.2

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

- Public HTTPS GeckoTerminal Solana trending pools; only first five qualifying
  pools (estimated reserve >= USD 50,000, valid pool address, price and 5m change).
- Prices are **provider-derived**, not audited trade fills; pool reserves aren't
  independent sell-depth evidence, and a trending label isn't a safe-buy rating.
- App foreground refresh trigger 30 seconds; provider request throttle 60 seconds
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
