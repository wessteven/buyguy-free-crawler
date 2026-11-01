# GOGET: Free Six-Agent Smart-Wallet Harness

## Design research (verified on GitHub, 1 November 2026)

| Open-source repo | Reusable engineering lesson |
|---|---|
| https://github.com/langchain-ai/deepagentsjs | Agent harness with planning, context, subagents and working memory |
| https://github.com/langchain-ai/langgraph | Durable state graph, checkpointing and approval boundaries |
| https://github.com/VoltAgent/voltagent | TypeScript supervisor/subagents, tools and tracing |
| https://github.com/crewAIInc/crewAI | Clear specialist roles and delegation |
| https://github.com/pydantic/pydantic-ai | Tool permissions, budgets, memory and durability |
| https://github.com/microsoft/agent-framework | Multi-agent Python/.NET workflow orchestration |
| https://github.com/huggingface/smolagents | Lightweight agents and the need for real code-execution sandboxes |
| https://github.com/ollama/ollama | Local tool-calling language models, no paid hosted-model calls |

Microsoft AutoGen is archived and not recommended for new production work. An open-source agent library is free to use; an LLM API or always-on cloud GPU is not necessarily free.

## Free prototype built here

- `src/goget-six-agent-harness.mjs`: six distinct deterministic research specialists with restricted capabilities and bounded handoffs. Inference calls: ZERO.
- `tests/goget-six-agent-harness.test.mjs`: checks hostile claimed approvals, valid identities, duplicate inputs, timestamps, task limits, and refusal to invent P&L.
- `scripts/goget-six-agent-replay.mjs`: reads at most 60 unreviewed webhook records from existing Cloudflare D1 and appends idempotent analysis into separate `smart_wallet_six_agent_reviews` ledger, key = exact wallet+signature. No Helius RPC requests.
- `.github/workflows/goget-six-agent-harness.yml`: GitHub Actions best-effort six-hour cadence and push-triggered first run, 7-day evidence artifact. No new package dependencies, new cloud provider, LLM API keys or paid subscription.

This is an authentic **agent orchestration harness** with six specialist processors and durable handoffs, but NOT six generative AI models. The distinction is essential: six LLM agents operating unattended require an actual inference runtime. Cloudflare Workers Free does not provide a free always-on GPU. We can add local Ollama reasoning only when a suitable always-on computer is available. The official local tool-calling API is https://docs.ollama.com/capabilities/tool-calling .

## Team

1. **SCOUT** checks wallet/signature identity, timestamp and provenance. It is not authorised to certify buys.
2. **FORENSICS** interprets Helius quantities/transfer hints and explicitly identifies missing independent signer, swap side and pool proof.
3. **WALLET_EDGE** refuses to assume activity proves profit. It requires complete, time-consistent realized net P&L and closed-trade sample before any "smart money" label.
4. **TOKEN_GUARD** tracks mint/freeze controls, owner concentration, LP custody and a genuinely executable sell route; unavailable data stays unknown.
5. **PAPER_STRATEGIST** can consider paper entries only after all prerequisites are verified. Version 0.1 is intentionally blocked for trading, without any wallet or exchange API.
6. **AUDITOR** verifies all five handoffs and creates up to four bounded research tasks. It has research-journal-only write permissions and no trading permission.

The supervisor/harness schedules these six as a fixed graph and is not a seventh agent. Every record gets a timestamped six-stage trace. D1 idempotence lets the next run resume after interruptions. This does not prove GitHub will start every cron exactly on time; scheduled Actions are best effort.

## How to make one autonomous agent

Give each specialist: a precise mission, a schema for trusted/untrusted inputs, only the minimum approved tools, a bounded loop, verified outputs, a source journal and explicit failure states. The FORENSICS specialist in this implementation takes a Helius event, extracts *possible* transfer amounts, and returns UNVERIFIED until independent RPC evidence attests the economic owner and exact swap.

For optional free AI reasoning later, a locally hosted Ollama service exposes a JSON chat/tool calling API at `http://localhost:11434/api/chat`. The harness must validate each tool name and arguments before performing any action, keep private keys unavailable, and enforce source freshness. A local model still uses electricity and hardware and cannot automatically run on Cloudflare's free Worker CPU. We have NOT installed or connected Ollama on any device.

## How to turn one into six

Define the six roles in a registry, assign each an independent input/output contract, arrange handoffs in a fixed dependency graph, persist immutable observations, checkpoint decisions under exact onchain identity, and give a separate auditor power to reject but not override missing evidence. Constrain the number of tool invocations and observations per run. Schedule bounded work, deduplicate keys, measure processing backlog and test fail-closed responses before granting more tools.

### Next upgrades, still free

- Independent Helius signer and true-owner confirmation, exact pool/mint mapping and historical trade outcomes from currently available allowance.
- Proper verified wallet P&L ledger that excludes failures, transfer noise, wash activity and later information.
- R2 full-source archive only if the existing account/bucket permits it without charges or billing upgrade.
- Six specialist tool adapters that read limited source data; enforce independent evidence and avoid LLM hallucinations.
- Optional local Ollama specialist reasoning for exceptional investigations, never per market event.
- Human-reviewed PRs for code development; never autonomous main-branch deployment, new services or real orders.

**Operating cost:** zero new paid LLM services, zero new paid plan actions. The scheduled job and D1 reads/writes still count against existing shared free quotas; if those limits are reached work must fail closed rather than upgrade or charge money.

**Not yet achieved:** six inference-capable LLMs, profitable copy trades, near-live six-agent evaluation, guaranteed scheduled execution, or production raw-transaction replay. This stage is evidence-harness infrastructure, not a validated investment strategy.
