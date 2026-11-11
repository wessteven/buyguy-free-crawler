# GOGET 72-hour live research protocol — 30 October 2026 (Pacific/Norfolk UTC+12)

Status: **PROPOSED, NOT RUNNING**. User authorized implementation and several days of read-only live testing. Do not claim collection has started until an actual running job and persisted measurements are verified.

## Gates
1. Obtain one real successful LaunchLab swap signature and raw jsonParsed getTransaction record, cross-check program/account ordering, actual token balance deltas, quote transfers, and fee handling. Preserve signature and immutable sanitized fixture; fail closed on mismatch.
2. Run the existing isolated birth proof with bounded duration and provider limits; record provider credits, errors, event timestamps and receipts. Keep PR #6 draft.
3. Only after gate 1 passes, run a bounded standalone read-only collector with explicit 72-hour stop, reconnect/backfill, duplicate suppression, monotonic receipt timestamps, persistent checkpoint and gap flags. Avoid claiming complete coverage during disconnects.
4. Capture 30-second windows with event-time and receipt-time separated; log first-seen, birth verification, first qualified research signal, and notification delivery independently. Never use future data in retrospective alerts.
5. Log provider requests/429s/credits, CI/runtime costs, D1 reads/writes (zero if unused), coverage gaps, false positives, unmatched trades, distinct fee payers (not unique humans), liquidity/exit uncertainty and 1m/5m/15m/1h/24h outcomes.
6. Summarize hourly and report daily at 06:00 Pacific/Norfolk; only report verified measurements and link exact commits/runs. 72-hour evaluation: detection recall against independent reference, p50/p95 latencies, signal precision, drawdowns and survivorship bias.

## Safeguards
No real or paper trades. No production deploy, merge, cron/D1 schema changes, Pocket Radar modifications, or paid provider upgrades. Cap provider usage, abort on errors or cost thresholds, avoid exposing credentials, and preserve privacy. Stop after 72 hours unless explicitly renewed.

## Existing foundation
Draft PR #6 includes bounded WebSocket birth detection, reconnect/backfill and offline 30-second receipt ledger. Cycle 06 tests: 401/401 Node, 7/7 Python; no real swap fixture yet. A green offline test is not live verification.

## Operational status
No always-on runner has been provisioned or started by this documentation commit. A GitHub Actions workflow alone is not a guaranteed 72-hour uninterrupted process. Choose an explicitly authorized persistent runner before claiming launch. First next action: real-swap validation and bounded live proof.
