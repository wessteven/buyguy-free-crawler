# GOGET — event-driven Helius webhook receiver v1

**Scope:** independent watch-only research infrastructure. No trading wallet, no signing, no swap API, no paper execution, and no claimed profitable signals.

## Deployment

PR #9 introduces an independent Worker at `https://goget-smart-wallet-hook.wessteven.workers.dev`. It deliberately does **not** modify the GOGET dashboard's existing Worker, Cron schedule, Fast Radar, or paper account.

The protected route `POST /webhook` accepts only JSON with a purpose-separated bearer shared secret; `GET /ready` requires the same secret and verifies a D1 binding is present. The public `GET /health` reveals no research data.

The bearer is derived inside GitHub Actions from existing repository secrets via HMAC-SHA256 with a unique purpose string, then installed as a Cloudflare Worker secret. Neither the webhook bearer nor Helius API key is committed. Helius `authHeader` sends `Authorization: Bearer ...`. Do not reuse a live wallet secret.

## Launch gates

1. All existing GOGET JavaScript tests and receiver tests pass.
2. Apply additive SQL schema to the existing D1 database.
3. Deploy the separate Worker.
4. Install its private bearer token.
5. Require authenticated readiness on the *actual* public Worker URL. If Cloudflare Error 1010, HTTP 403, misconfigured D1, or another error prevents readiness, **do not register a billable webhook**.
6. Only then register or update exactly the GOGET Helius Enhanced SWAP webhook for the three explicitly unvetted pilot wallets. The script will never modify a webhook with a different URL.
7. Inspect Helius subscription listing and actual D1 events independently. A subscription without delivered events is not operational proof.

## Evidence semantics

Webhook events are untrusted source observations. Even if the source says `SWAP`, a watched fee payer may not be the economic trader; transfer hints do not prove a purchase. All records remain unpriced and have **no trade-eligible or paper-eligible flag**.

Data persistence is keyed by exact __(wallet, signature)__, deduplicated across retries. The receiver bounds request size to 96 kB, batch size to 30 transactions, and reserves at most 1,200 event rows per UTC day. This is *not* a Helius account-wide spending limit, nor evidence that events below that quota are complete. The receiver never stores raw webhook JSON; it only preserves bounded transaction identity, source, timing and transfer hints.

As block timestamps are second-granular, their difference from receive time is approximate. Subsecond delivery must be measured using additional evidence, not asserted.

Time-limited pilot: all webhook POST ingestion stops at **2026-11-02 00:00 UTC**. The hourly GitHub cleanup workflow deletes only the matching Helius webhook after expiry and then disables itself; if deletion fails, the scheduled cleanup retries. Verify the actual Helius webhook has been removed — a receiver deadline by itself would not stop provider event charges.

## Operational verification

Workflow: https://github.com/wessteven/buyguy-free-crawler/actions/workflows/deploy-smart-wallet-webhook.yml

Read-only D1 queries using the already configured GitHub/Cloudflare credentials:

```sql
SELECT wallet,signature,observed_at,classification,delay_ms FROM smart_wallet_webhook_events ORDER BY observed_at DESC LIMIT 25;
SELECT day,reserved FROM smart_wallet_webhook_budget ORDER BY day DESC LIMIT 3;
```

Status should clearly differentiate: code merged, Worker deployed, receiver ready, webhook registered, delivery observed, dedup verified, and independently verified exact wallet buys.

## Next: independently verified copy-trade evidence

Combine signer authority, token owner deltas (SOL/WSOL accounting), verified exact pool/mint route, double-sided executable quotes, mint/LP controls and beneficial holder concentration. Build wallet realized P&L *as of signal time* avoiding look-ahead. Only then route verified candidates to the existing forward PAPER engine.

**Never claim** this webhook alone detects purchases within one second or produces any real-money profit.
