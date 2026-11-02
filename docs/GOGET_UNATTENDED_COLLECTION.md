# GOGET unattended collection supervision

This release continues the existing Cloudflare pre-signal service. It does not
start a new collector, alter the research cohorts, change provider cooldowns,
remove historical records, or authorise real trading or additional paid services.

## Current blocker and acceptance boundary

The 2 November 2026 06:53 UTC capacity audit recorded the latest webhook receipt
at 1 November 05:21:37 UTC, 21 raw archive records, zero webhook observations in
the last 24 hours, and 288 successful scheduled research cycles. Execution
success did not establish successful collection. The existing budget guard
reports MONITOR after usage falls without verifying that the deleted provider
subscription has returned. This release independently checks registration; it
never recreates a subscription based only on local event counters.

The 72-hour collection trial has not started successfully. First verify the
registered exact 14-wallet research cohort and actual Helius credit headroom,
restore the authorised source within its existing budget, and establish new
receipts with durable raw evidence. Preserve the separate Deployer Lab's full
25-wallet requirement; this release does not change or implement that lab.

The pilot cutoff remains 8 November 2026 00:00 UTC. The new management audit
makes no Helius calls after that cutoff. Actual credit inspection requires the
existing Helius API key, its project ID and access to the provider's Admin API.
The optional repository variable HELIUS_PROJECT_ID enables the read-only usage
request. Missing or unavailable usage stays explicitly unverified. No API keys
or project identifiers appear in reports. No subscription or billing mutation
exists in this audit.

## Every five minutes

The existing pre-signal cycle adds one bounded read of the latest 200 normalized
receipts and indexed, exact-signature raw-archive existence checks. Shared
signatures across wallets are deduplicated for archival coverage. The check
contains no provider requests, inference, new schema, or additional D1 writes;
it is stored inside the existing run summary. The approximate maximum additional
receipt read volume is 57,600 rows/day plus primary-key raw lookups, separate
from the existing source-window reads. Measure actual Cloudflare usage.

More than 15 minutes without a receipt means NO_RECENT_SOURCE_RECEIPTS. It does
not prove that wallets traded or that the provider disconnected. Missing raw
records mean incomplete sampled archival coverage, not a measured whole-history
loss rate. D1 errors become unknown evidence rather than a healthy empty sample.

Cycle status distinguishes SOURCE_NOT_FRESH, SOURCE_HEALTH_UNVERIFIED and
RAW_ARCHIVE_INCOMPLETE. The existing snapshot and outcome logic still runs so
that previously scheduled labels can finish or become explicitly unpriced.

## Endpoints

- GET /health is public process liveness and explicitly says livenessOnly.
- GET /collection-health is a public, minimal collection alert endpoint. It
  reads one indexed latest run, returns HTTP 503 for stale or missing checks,
  recomputes receipt age and respects the source cutoff. It contains no wallet,
  mint, raw source or credential data. HTTP 200 only means recent receipts and
  complete archival coverage in the bounded sample, not full coverage.
- GET /status requires the existing purpose-separated pre-signal bearer. It
  returns the latest collection check and a bounded rolling 72-hour report.
  It never runs a collector or makes a provider request.

The 72-hour read is bounded to 900 cron records using the existing at index.
Each window expects 864 five-minute slots. Manual runs and duplicate cron runs
cannot substitute for missing periods. Legacy runs without collection evidence
are uninstrumented. A later duplicate cannot erase degraded evidence in its
time slot. A capped read cannot pass the sampled observation gate.

The report always retains continuousCoverageVerified:false. Full acceptance
also requires provider/cohort continuity, documented gaps and recovery, market
quote/outcome availability, and forward signal evaluation. These cannot be
inferred from scheduled run counts or receipt freshness. The observation gate
only describes sampled receipt and archive evidence across the time window.

## Independent best-effort oversight

goget-unattended-watch.yml checks provider registration and saved collection
evidence hourly and after this release. Its report artifacts retain both
successes and failures for 14 days. The provider check is GET-only and verifies
the entire configured cohort. Missing subscriptions fail the workflow instead
of showing a green MONITOR result. The second status step and artifact upload
run even when the provider check fails. GitHub schedules remain best effort;
the actual five-minute supervision stays on Cloudflare.

## Timeout recovery

Candidate discovery retries its initial D1 SELECT once after a timeout or
502/503/504 response. Python's secondary crawler retries D1 SELECT statements
under the same conditions once. Authentication failures, 429 responses,
uncertain writes, market requests and Helius transaction decodes are not
replayed. An unknown write outcome remains a failure for reconciliation.

## Validation

Run all Node regression tests, Python tests, and the offline D1 request-shape
tests. The real SQLite test checks exact raw signature matching, the 200-row
bound, the receipt index and raw primary-key lookup. Production deployment
verification pins the expected build, checks the protected 72-hour endpoint and
tests that public collection HTTP status agrees with the explicit health flag.
Deployment success with a degraded collection report is not a successful trial.

## Independent unattended report acceptance gate

The hourly watcher now tests its own acceptance logic before checking the
provider. A passing latest `/collection-health` result is **not** enough for
the hourly watcher to pass: the saved 72-hour report must also contain all
864 distinct five-minute slots, zero missing, degraded or uninstrumented slots,
an uncapped D1 read, and the matching `SAMPLED_EVIDENCE_WINDOW_COMPLETE` flag.
The watcher independently rejects stale latest checks, stale window timestamps,
contradictory counters and malformed report shapes.

Results are written as `acceptance` alongside the existing source/status
evidence artifact. A pass certifies **only sampled-window monitoring**, not
provider/cohort continuity, full source completeness, independently verified
market outcomes or trading profitability. The separate read-only provider audit
continues to fail on missing subscriptions. No additional Helius calls, D1
migrations, research cohort changes, trading actions or polling changes result.
