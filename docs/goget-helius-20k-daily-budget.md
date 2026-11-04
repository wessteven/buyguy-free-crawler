# GOGET Helius webhook credit guard — 20,000/day

The owner-approved policy is **20,000 estimated Enhanced webhook-delivery credits per UTC day**. Helius publicly documents **1 credit per delivered webhook event**. This is a GOGET webhook-specific event estimate, **not** the Helius account billing balance and **not** a guarantee of a hard maximum.

## Accounting

- `smart_wallet_webhook_credit_estimates.observed_deliveries` is incremented for every event in an authenticated accepted JSON webhook batch **before classification**, including duplicates and events with no selected watched-wallet source evidence.
- The daily threshold is `20,000` observed deliveries (one credit each) **or** `20,000` normalized D1 attempted record reservations, whichever occurs first. The latter is a separate storage protection counter. They are never added together or presented as the same unit.
- The old auto-stop at 350 recorded rows/hour has been **removed**. The hourly row rate is still recorded for visibility.
- The receiver's `storedEventsPerDay` cap is 20,000 normalized records so the former 5,000-row ceiling does not silently defeat the new daily policy.
- The optional original JSON archive retains its **independent 20 MB/day** byte cap and per-event truncation cap; archive completeness can be partial and MUST be reported.
- Helius RPC, Enhanced/Parsed APIs, other projects' webhooks, retries, management API calls and any manually used APIs may consume additional provider credits. Helius is the authoritative source for actual shared-plan credit usage.

## Enforcement / caveats

- The existing GitHub Actions safety guard is scheduled every 15 minutes. GitHub schedule delays and Helius webhook delivery latency can cause overshoot. The receiver cannot prevent a provider charge for an already-delivered event.
- A threshold breach causes a **persistent D1 SUSPENDED latch** followed by deletion of only the exact GOGET-owned Helius subscription; the latch persists across midnight and code deployments until explicitly rearmed through a separately authorized change.
- Both the deployment gate and scheduled guard use the **same** daily credit estimator and D1 reservation policy. Missing or invalid readings fail closed.
- The webhook still stops at `2026-11-08T00:00:00Z`; the user did not ask to extend the pilot here.
- No changes to the 12-wallet live cohort, source history, independent research projects, crawler filters or paper trading.
- A true **account-wide 20,000-credit/day** cutoff would require authoritative provider credit usage access, coordinated budgeting across all projects and closer-to-real-time enforcement. This change does **not** claim that functionality.

## Verification

Run `node --test tests/smart-wallet-budget.test.mjs tests/smart-wallet-webhook.test.mjs` plus the whole JavaScript/Python regression suite. After deployment confirm a budget gate result, authenticated exact Worker build, webhook listing with 12 original addresses, advancing daily delivery estimate, fresh normalized D1 source, completed six-agent processing and intact persistent latch.
