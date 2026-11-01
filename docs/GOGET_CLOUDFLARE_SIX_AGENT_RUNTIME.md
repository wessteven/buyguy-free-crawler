# GOGET six-agent Cloudflare runtime — Workers Paid

## Purpose

The paid Workers plan lets the existing six deterministic, paper-only research processors execute on Cloudflare's **five-minute UTC cron** rather than relying on a GitHub schedule that frequently runs late. This uses the existing 14-wallet Helius webhook and existing Cloudflare D1 database. It does **not** change subscription costs, expand the Helius cohort, add a paid LLM API, or enable trading.

Cloudflare docs:
- https://developers.cloudflare.com/workers/configuration/cron-triggers/
- https://developers.cloudflare.com/workers/platform/pricing/
- https://developers.cloudflare.com/d1/platform/limits/

## Code

- `src/goget-cloudflare-agent-worker.mjs`: independent Worker named `goget-six-agent`, with `scheduled()` (5-minute interval), `GET /health` and bearer-protected `POST /run`.
- `wrangler.six-agent.toml`: D1 binding, schedule and explicit CPU cap. Uses deployment-time database ID substitution; never commits account IDs, API tokens or keys.
- `sql/goget-six-agent-worker.sql`: additive idempotent tables. Existing `smart_wallet_six_agent_reviews` is reused; `smart_wallet_agent_lease` serializes runs with a three-minute TTL, and `smart_wallet_agent_runs` records the processed/inserted/backlog counts and specialist findings.
- `.github/workflows/deploy-goget-cloudflare-agents.yml`: test, migrate, deploy, install private HMAC-derived control token and verify a real remote run.
- `tests/goget-cloudflare-agent-worker.test.mjs`: lease, 200-event bounding, repeat-safe writes, authenticated control, fake-buy refusal, no external calls.

## Strict limits and cost containment

- At most **200 new historical source rows** per invocation; max **20** bound parameterized D1 insert statements (10 rows each) plus status/lease writes.
- Five-minute cron = 288 potential invocations/day. Even a hypothetical sustained max of 57,600 review rows/day is far below the Paid plan's included 50 million D1 rows written/month. It is not a hard total account budget; actual data, extra indexes, and any other GOGET Workers also contribute.
- Workers request and CPU overages are separately metered beyond the included monthly allowances. This workload does not need a GPU, remote AI inference, or additional Helius network requests.
- No finance permissions, paper execution, code deployment tools, web-browsing tools, wallet signing, or secrets provided to the six agents.
- D1 work is idempotent on `(wallet, signature)`; overlapping cron and manual run calls are blocked by a three-minute expiring D1 lease.
- D1 indexed joins still consume row-read allowance. Monitor usage in Cloudflare and throttle cron if reads or paid CPU climb.
- The Worker remains active even after the current Helius webhook pilot cutoff (8 November) to process historical backlog. It does not extend the Helius subscription.

## How to verify

1. Workflow `GOGET Cloudflare Six-Agent Runtime — deploy` must complete all stages.
2. `GET https://goget-six-agent.wessteven.workers.dev/health` should return `PAPER_ONLY_NO_LLM` and the enabled flag.
3. Deployment workflow calls authenticated `POST /run`, verifies modelCalls=0, heliusCalls=0, realTrades=0, paperBuys=0, at most 200 rows, and nonnegative backlog.
4. `smart_wallet_agent_runs` contains timestamped summaries. The exact number of completed scheduled invocations must be checked after cron propagation (up to ~15 minutes), not inferred from deployment success.
5. Disable only the prior GitHub six-agent *schedule* after the new Cloudflare deployment is proven; retain manual GitHub fallback, with no duplicate scheduled processing.

## Later upgrades

Create real evidence-driven assignments: independent signer/owner attestation, exact swap path, token-control/sellability checks, historic wallet realized P&L with look-ahead prevention, and forward paper outcomes. Only then permit specialist reasoning to produce research hypotheses or paper decisions. This deployment deliberately processes and labels available source evidence rather than calling it investment alpha.

Cloudflare Workers Paid does not include unlimited Helius credits. Continue monitoring the separate Helius free-plan budget and its configured webhook cutoff.
