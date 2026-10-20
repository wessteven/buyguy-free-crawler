# GOGET D1 row-read audit — 2026-10-21

## Verified platform allowance
Cloudflare D1 Workers Free: 5,000,000 rows read/day, 100,000 rows written/day, reset 00:00 UTC. Enforcement began 2026-09-01.
Source: https://developers.cloudflare.com/d1/platform/pricing/
Source: https://developers.cloudflare.com/changelog/post/2026-09-01-d1-free-tier-limit-enforcement/

## Static code audit: hypotheses, not measured D1 usage
1. **Dashboard socials query — fixed in commit 4841626**. Previously `SELECT asset_key, MAX(id) ... FROM research_events WHERE kind='TOKEN_SOCIALS' GROUP BY asset_key` scanned/grouped historical events on every /api/status refresh. Replaced with indexed correlated latest-event lookup for displayed assets. Existing index `research_event_asset_kind_id(asset_key,kind,id DESC)` supports it. Verify with EXPLAIN and D1 meta.rows_read; index planner choice is not guaranteed.
2. **Archive query — high priority**. Every /api/status refresh performs global grouped aggregations over observations (MAX(score)), predictions (COUNT), paper_positions (COUNT), and research_events (COUNT excluding socials), *before* restricting to 500 DEAD assets. Potentially expensive as history grows. First restrict archive candidates (top 500) in a CTE and then perform indexed correlated aggregates for just those candidates; benchmark query plan before deployment.
3. **Green events — medium priority**. /api/status reads the latest 2,000 matching research_events each refresh; index on (kind,id DESC) exists but IN across kinds may still require work. Consider per-asset latest-event retrieval or a materialized latest-evidence table; never drop evidence history.
4. **Quote refresh — medium priority**. Every 10-minute scheduled cycle selects the full retained non-TRASH research universe before selecting at most 25 refresh targets. Review LIMIT pushdown against selectRefreshTargets fairness, and use an index on status/last_seen as justified by actual query plans.
5. **Score journal — lower frequency**. Once hourly reads bounded assets and recent routes, plus due outcome lookups. Existing observation index (asset_key,seen_at DESC) supports outcomes; test plans.
6. **Dashboard repeated refresh**. The page calls /api/status for every manual refresh and login; confirm actual traffic and caching policy before assuming frequency.

## How to measure (requires authenticated account database access)
- Cloudflare dashboard > D1 > buyguy-free-v3 > Metrics > Row Metrics and Insights. Compare rows read over time against cron timestamps and dashboard requests.
- Capture D1 statement `meta.rows_read` and `meta.rows_written` for the /api/status statements in a safe staging test. Do not log passwords, keys, or wallet credentials.
- Run `EXPLAIN QUERY PLAN` on the exact social, archive, and green-events SQL using production-equivalent data; verify SEARCH USING INDEX vs SCAN and compare before/after counts.
- Measure with a fixed representative dataset; a code inspection cannot prove the dominant cause or quantify savings.
- Check indexes have actually been applied to the live D1 database; schema.sql in GitHub is not proof of deployed migrations.

## Guardrails
Never purge historical evidence to reduce row reads. Archive/TRASH affects active scan slots only. Keep OUR SCORE v1 immutable and paper simulation disabled. If D1 quota is exhausted, do not retry repeatedly or fabricate availability.
