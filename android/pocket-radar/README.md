
## v0.8 — GOGET research pairing (feature branch; production API not deployed)

The existing signed v0.7 app, permanent Android signing identity, TREND and CHASE
screens, widget, and pool chart taps are preserved. v0.8 adds a separate
**GOGET RESEARCH · OUR SCORE** screen without replacing public feeds.

**To pair after the Worker endpoint has been tested and deployed:** open the
authenticated GOGET dashboard in a browser; under WHAT'S GOOD expand
**PAIR POCKET RADAR**, generate a **seven-day limited read-only** token and copy
it. Open the Pocket Radar app > GOGET RESEARCH > PAIR, paste the token. The
device stores only this limited token in private (non-backed-up) app storage.
No dashboard password, cookies or administrator API key go into the APK.
The token is accepted *only* by GET /api/pocket-radar/feed, never write, audit,
paper trading, wallet or administrative routes. It expires after seven days;
re-pairing is needed. Clearing GOGET device access removes its local credential
and research cache without affecting TREND/CHASE.

**Server**: POST /api/pocket-radar/pair requires the existing authenticated,
same-origin dashboard session and explicit pairing action; GET
/api/pocket-radar/feed accepts only a purpose-signed token. The endpoint is
read-only, queries a maximum of 80 recent active Solana assets and 360 recent
research events, and uses a shared five-minute edge cache after authentication
where supported. No scanner invocation, database write, cron change, D1
migration, history reset or paper-trade activity.

**Evidence limitations:** The endpoint ranks the **bounded GOGET research
sample** with the existing OUR SCORE algorithm, recent observation time and
seven-check safety assessment. Because the dashboard can examine a larger
asset/history set, its exact top five can differ from this subset. Missing
evidence remains unknown. Pool identities are stored, not freshly certified;
reported buys/sells are trades, not verified distinct wallets. Observation
times are not independently certified provider quote times. A good score is
not a trade recommendation. The **home widget remains TREND/CHASE** in v0.8;
authenticated widget support should follow successful on-phone API testing.

**Deployment blocker:** the feature branch must pass all CI checks and undergo
a controlled Worker deployment/verification before GOGET ranking fetches work
in the phone app. A valid signed APK alone does not mean the authenticated
server endpoint is live. Do not merge/deploy into production without checking
D1 read budget and verifying the production scanner/cron remain unchanged.

## Permanent signing: update in place from v0.7 onward

Signing-setup verification is performed by the separate secret-gated GitHub Actions workflow. A green run alone is insufficient: the signed-release APK must be uploaded after keytool confirms the alias/password and apksigner verifies the output. Never paste key material into the repository or logs.


**Why the one-time switch?** Prior GitHub Actions APKs are Android debug builds
with temporary randomly generated signing certificates. Android forbids
in-place updates across different signing keys, even when package IDs match.
Those ephemeral private keys were not retained. As a result, switching from
v0.6 (or earlier debug build) to the first **stable-signed** v0.7 requires
uninstalling the old debug install once.

**After the first stable-signed APK is installed**, future releases can use
Android's normal **Update** path. Keep all of the following constant:

- Android applicationId: `dev.whatsgood.pocketradar`
- Signing keystore / alias (`pocket-radar`) / private certificate
- Increase `versionCode` for each release (v0.7 uses versionCode 7).
- Keep the widget receiver `dev.whatsgood.pocketradar.RadarWidget` for continuity.

**One-time owner setup (Windows laptop, Java 17 JDK):**

1. Open `android/pocket-radar/SETUP_SIGNING_WINDOWS.ps1` on a trusted Windows PC.
   It creates a password-protected, long-lived PKCS12 signing key in
   `Documents/PocketRadarSigning/pocket-radar-release.p12` and copies its Base64
   encoding to your clipboard. Run with PowerShell (requires local JDK keytool).
2. In `https://github.com/wessteven/buyguy-free-crawler/settings/secrets/actions`,
   create two **repository secrets**:
   - `POCKET_RADAR_KEYSTORE_BASE64`: paste the copied base64 bytes.
   - `POCKET_RADAR_SIGNING_PASSWORD`: the strong keytool password.
3. Securely back up the private .p12 file and password OFFLINE. Anyone with
   both could impersonate the app publisher; losing them would break updates.
   Never commit, upload them to the repo, send them in chat or include in logs.
4. The separate `Pocket Radar Signed Update APK` GitHub Actions workflow
   produces `pocket-radar-v07-SIGNED-UPDATE` when the two secrets are present.
   The workflow verifies APK signature and package ID. A run with missing
   secrets produces no signed-release artifact. The ordinary
   `Pocket Radar Android APK` debug artifact is **NOT** update compatible.
5. Install the first v0.7 SIGNED UPDATE APK after removing the old debug build
   for the **last time**. Subsequent signed releases (v0.8, v0.9...) install
   in place from the same signing key with higher versionCode, normally
   retaining the widget, app settings and saved data.

Android/CI tool compilation alone does not prove an on-device successful
update. Confirm v0.8 installs atop v0.7 without an uninstall before treating
this workflow as fully field-tested.

The signed-release workflow is separate, uses GitHub Actions secrets, and
cannot be activated until the repository owner creates the secrets. The
connected GitHub tool cannot administer secrets. The key material must never
appear in a public repo or an unprotected artifact.

# WHAT'S GOOD Pocket Radar Android v0.7

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

## Further integration (not yet enabled)

Extend the **home widget** with the authenticated GOGET research source after
controlled production endpoint verification; the v0.8 app screen is only the first stage. Never bake
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
