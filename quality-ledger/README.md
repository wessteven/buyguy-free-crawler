# Independent Quality Ledger — version 1

Purpose: detect declining scope and depth across repeated autonomous runs using persisted evidence, not statements in an AI report. This is independent of GOGET trading/discovery, Night Picks simulations, and trackCA collection.

## Already instrumented: trackCA

An independent GitHub Actions job runs hourly (UTC minute 19). It reads existing trackCA D1 source tables and appends requirement-by-requirement audit records into two new namespaced tables: quality_ledger_runs and quality_ledger_checks. Existing data, CRON frequencies, scanner filters and paper-trading logic are not modified. It reuses the existing D1 database instead of consuming another database.

The baseline is frozen at 22 named assets, 10 expected metrics each = 220 checks. If the source watchlist changes silently, the evaluator fails rather than lowering its denominator. For each source run, it checks concrete saved records (exact address joins, exact pool rows, 5m/1h/24h aggregates, holder comparison snapshots) and leaves independent buyers, wallet accumulation, whale flows and executable sell depth UNVERIFIED without supporting primary evidence. Missing or stale runs fail the scheduled action; a drop in observed evidence versus a comparable previous run fails it too. Database writes are insert-only and idempotent.

Status SOURCE_RECORDED is deliberately weaker than VERIFIED: a D1 row exists and passed structural checks, but provider response authenticity, on-chain correctness and exact quote time have not been independently proven. A source-observed timestamp is not a verified quote timestamp. The audited collector's own status is descriptive metadata, never a substitute for actual rows.

The Actions run summary shows per-hour aggregates, and the D1 tables preserve individual missing evidence and longitudinal trends. A completed execution is never considered a complete deep research pass. Tests enforce the original denominator and check stale/future observations, exact address mismatches, holder-delta requirements and regression detection.

## ChatGPT-native scheduled tasks: explicit limitation

Deployer Lab Watch (25 wallets), Robinhood Recovery Radar (21 tokens), and Night Picks 2 Paper Lab have self-audit instructions. However, this external GitHub runner cannot currently read their internal ChatGPT execution traces or provider-call receipts. It would be misleading to claim the ledger has independently verified them. Their status here is NOT EXTERNALLY INSTRUMENTED; a completed ChatGPT automation does not prove completed research.

To bring those three under genuinely independent verification, instrument each required on-chain/provider request in a collector controlled by the audit harness. Record request identity, HTTP result, provider timestamp, unique source identifiers, response hash, and native run ID. Join those receipts against frozen task scope manifests. Native automation output alone must never be accepted as an execution receipt.

## Operation

Local tests: node --test quality-ledger/tests/*.test.mjs

GitHub workflow: .github/workflows/quality-ledger.yml. On pull requests tests only; after merge to main it creates additive tables and runs the first audit, then repeats hourly. Uses existing GitHub repository secrets CF_ACCOUNT_ID, CF_DATABASE_ID and CF_D1_API_TOKEN; missing credentials fail visibly. No Cloudflare secrets are committed.

Read latest verified persisted source audits:

    SELECT audited_at,source_run_id,status,expected,source_recorded,missing,unverified,stale
    FROM quality_ledger_runs WHERE task_key='trackca' ORDER BY audited_at DESC LIMIT 20;

This is a working first layer, not a claim that all three native ChatGPT automations are already independently covered.
