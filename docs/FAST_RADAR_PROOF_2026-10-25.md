# GOGET five-pool live proof — 25 October 2026

Result: scheduler proven; five-pool live quote feed NOT proven.

## Production observations

The SQLite Durable Object and additive radar_samples table deployed successfully
on Workers Free. No subscription upgrade was made. The existing ten-minute
cron bootstrapped the timed trial; it was not changed to a thirty-second cron.

Authenticated D1 evidence captured six production alarm ticks:

| UTC tick | Accepted updated quotes |
| --- | ---: |
| 02:34:42.234 | 0 |
| 02:35:12.252 | 0 |
| 02:35:42.253 | 0 |
| 02:36:12.254 | 0 |
| 02:36:42.256 | 0 |
| 02:37:12.257 | 0 |

Intervals: 30.018, 30.001, 30.001, 30.002, 30.001 seconds.

Five exact Solana pools were selected: MIRLIFE, COIL, SWORDOPE, REMUS,
CATTLEAXE. No substitute prices or fabricated samples were accepted. The cached
quote array was empty; sample-write reservation was zero.

DEX quote requests hit HTTP 429 and entered cooldown until 03:05:12.252 UTC.
GeckoTerminal was in shared cooldown until 03:00:42.226 UTC. No cooldown was
bypassed. Both were represented as SHARED_COOLDOWN in the recorded snapshot.

A real bug was found and fixed: old discovery-profile cooldowns also blocked
DEX token quotes, despite their documented separate rate buckets. The new code
ignores a legacy profile cooldown ONLY with an exact timestamp-matched recorded
profile-only 429. Unknown scope remains blocked. A separate fast-radar:dex-quotes
lease persists quote-endpoint 429s. After this fix the actual quote endpoint
still returned 429, so the provider constraint is real, not just a scheduler bug.

## Access, safety and validation

GitHub's public-URL checks were blocked by Cloudflare Error 1010. No security
setting was weakened. Internal Worker cron/DO execution and authenticated D1
reads provided production evidence; browser access is not verified by this trial.

The first schema request returned HTTP 400. Sending a clean standalone CREATE
TABLE statement fixed it. No existing tables were rewritten. D1 received a bounded
singleton diagnostic heartbeat during the timed trial, not invented price history.

253 JavaScript tests and 7 Python tests pass. Tests include exact mint/pool and
orientation, null unknowns, provider cooldowns, distinct rate buckets, per-minute
sampling, budgets, authentication, real SQLite deduplication and automatic stop.
The deployment's market-feed proof fails when providers are blocked; a green
unit-test run is not presented as a green live-feed proof.

The trial has a ten-minute automatic stop, and ordinary scheduled scans do not
restart a completed or explicitly stopped trial. Automatic stop was independently verified at 02:40:46 UTC: enabled=false,
error=TRIAL_COMPLETE, last active tick 02:40:12.281 UTC. No ongoing fast alarm
collection remains active. Final evidence is recorded in the same singleton row.

## Implication and next implementation

Cloudflare scheduling can support our target. Paying US$5/month for Workers
would increase platform/D1 headroom, but cannot remove external provider limits.

Before enabling unattended fast updates, provide an independently budgeted feed:
first evaluate batched on-chain pool/vault reads through the existing Helius key
for supported exact pool protocols, with a separate fresh SOL/USD conversion.
Reserve-derived indicative prices must be labeled and must not be called verified
fills or last-trade prices. Verify five supported pools before broadening coverage.
An independent keyed market-data source is another option, subject to its actual
free credits, supported chains and source-data delay. DexPaprika's current Free
pricing allows up to 60 seconds of data delay; it is not proof of <=30s source age.

Production evidence workflow:
https://github.com/wessteven/buyguy-free-crawler/actions/runs/40155159405

Verified stop:
https://github.com/wessteven/buyguy-free-crawler/actions/runs/40155247761

Explicit feed failure:
https://github.com/wessteven/buyguy-free-crawler/actions/runs/40155247756

Sources for endpoint buckets and platform/provider distinctions:
https://docs.dexscreener.com/api/reference
https://developers.cloudflare.com/durable-objects/platform/pricing/
https://dexpaprika.com/api/pricing
