# Helius production radar

Production verification PASSED on 2026-10-25: five exact pools, repeated Cloudflare
snapshots at 30.000–30.028-second intervals, ten persisted minute samples, fourteen
rows read for history verification, ten row writes in the last sample batch.
Proof: https://github.com/wessteven/buyguy-free-crawler/actions/runs/40164707795

USD conversion is implemented but no usable fresh Gemini reference was accepted
in the live checks. Native SOL/token collection is working; USD remains NULL.

The direct Helius adapter passed a one-hour test before production integration:
121/121 cycles, zero recorded gaps/errors, 3600.136 seconds, 29.980–30.020-second
intervals, advancing confirmed slots 461099215 through 461116101. The run made
122 RPC calls; D1 reported 546 rows read and 600 rows written. Billed Helius
credits were not independently measured.

Production source: FAST_RADAR_SOURCE=helius in wrangler.toml. The existing
ten-minute cron bootstraps this mode once, then a Durable Object schedules
30-second account snapshots independently. Unlike the old market-provider
experiment, Helius mode continues until Stop, a kill switch, an authentication
failure or resource controls prevent updates. No paid plan was purchased.

Controls: POST /api/fast-radar/stop deletes the alarm. POST /api/fast-radar/start
starts it using the current configured source. Both require the existing signed
session or bearer authentication and same-origin protections. A completed mode
is not silently restarted by cron. FAST_RADAR_ENABLED=false is the persistent
kill switch. Existing discovery cron, filters, rankings and paper trading remain
separate; fresh prices appear in the dedicated fast-radar panel.

## Data and budgets

- PumpSwap/wrapped-SOL pools only, maximum five; unsupported candidates explicit.
- Pools with less than one SOL in their SOL vault are rejected and slots refilled
  from verified candidates. This only excludes dust reserves; it is NOT proof of
  the user's US$50k liquidity requirement or suitability for a buy signal.
  Two old pools in the initial mechanical proof had dust reserves. Their old
  evidence remains intact, but they no longer consume active production slots.
- One confirmed-context batch covers pools, both mints and vaults. Registry is
  reselected at most hourly from forty ranked candidates; every frame checks
  existing registry pointers and exact vault/mint/program/decimal identities.
- Monotonic slots; failed frames keep old quote timestamps, not invented freshness.
- Maximum 3,000 attempted RPC calls per UTC day for this lane. Other account
  consumers remain outside this counter; this is not an account-wide spending cap.
- HTTP 429 backs off thirty minutes; authentication failures stop the collector.
- One D1 native-price sample per pool/minute, 25,000 reserved writes/day and
  200,000 reserved lifetime sample slots. When history reaches a limit, it pauses
  while live quotes can continue within their independent request budget.
- D1 diagnostic heartbeat is bounded to the first ten minutes of activation;
  current snapshots thereafter remain in Durable Object storage. A historical
  diagnostic row is not proof of current liveness; check its timestamp.

USD conversion uses one shared Gemini SOLUSD public last-trade reference, accepted
only if timestamped within sixty seconds and not in the future. If unavailable,
USD is NULL and the panel shows native SOL/token plus "USD unavailable". USD
reference time is retained with each cached quote. Persistent price history stays
native SOL/token; do not infer historical USD P&L from a current conversion.

Prices remain indicative pre-fee reserve ratios, not last trades, executable
quotes, unique buyers, transaction volume or safety certification. Absolute
upstream lag still needs a separate reference check. The one-hour data proof
ran in GitHub Actions; the deployment workflow must separately establish
Cloudflare slot progression and persisted samples. Public URL checks can be
blocked by Cloudflare bot protection; authenticated D1 proof does not certify
that the user's browser rendered the panel.

Validation: 265 JavaScript tests and 7 Python tests pass locally; deployment runs
the full JavaScript suite before releasing. New checks cover integration of
batched states, decimal-aware USD conversion, stale/future reference rejection
and the daily request ceiling. Recovery was tested with an offline injected
network error; a production outage was not deliberately induced.

The dedicated panel is under WHAT'S GOOD → FAST RADAR in:
https://buyguy-free-radar.wessteven.workers.dev
Existing dashboard login protects it. Public automated browser reachability is
still subject to Cloudflare bot protection, and user-browser rendering has not
been directly verified. The data proof was through internal DO state persisted
to authenticated D1 diagnostics, not an unauthenticated public data endpoint.
