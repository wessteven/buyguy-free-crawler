# Vlad Public Wallet Watch — independent read-only collector

**Evidence policy:** No tracked address is established as Vlad Tenev's personal wallet. This collector observes public addresses; it must never call a transfer his trade. It does not sign or send transactions and has no trading code. The GitHub candidate comes from an unmerged pull request, not a verified Robinhood ownership declaration.

## Contract and scope

- `rh-demo` `0x42607B2E4fde22e83822d4a86ddAc58d847DC289`: Arbitrum One (42161), Robinhood Chain (4663), Ethereum (1), Base (8453).
- `github-test` `0x4d9302846c057507d32405ba77055473d33beb26`: Robinhood Chain (4663), unverified ownership.
- **Exactly five** address/chain checks each 10-minute UTC cron cycle. Only Cloudflare Worker `vlad-public-wallet-collector`; dedicated `vladwatch_` D1 namespace, *no modification to any existing project's schema or application code*.
- A successful RPC call is **only a native-balance/nonce/block snapshot**, NOT a historical transaction scan. Independent transaction and ERC-20 transfer indexer streams are separate coverage requirements. All three must be checked for an overall checked pair.
- The first observation is a baseline, **not fresh trading activity**. Max six indexed pages per stream/scan, with explicit partial/backfill warnings. A missing prior high-water mark cannot be reported complete. Deduplication by exact chain/address/tx hash, and exact transfer log-index plus token contract.
- Token transfer is never assumed to be a swap. Unsolicited tokens may be spam; verified swaps and liquidity inspections remain **unknown** unless separately proved. There is no order-placing functionality.

## Deployment

The intended safe release is the standalone, path-filtered GitHub Actions workflow. GitHub has existing Cloudflare account/deploy and D1 API secret names (`CF_ACCOUNT_ID`, `CF_DATABASE_ID`, `CF_D1_API_TOKEN`, `CF_DEPLOY_API_TOKEN`), but their runtime availability must be verified by CI. On main after tests, apply **only** additive `vladwatch_` tables to existing D1 and deploy **only** the new Worker. No independent Cloudflare connector was available to deploy directly from this chat.

From a checked out repository locally:

```bash
cd vladwatch
node --test tests/*.test.mjs
python tests/sql_test.py
# Set wrangler.toml database_id to an authorized D1 database UUID.
npm install
npx wrangler deploy --config wrangler.toml
```

Optional Worker secrets: `ETHERSCAN_API_KEY` to enable independent indexed-history fallback, `BLOCKSCOUT_PRO_API_KEY` for Blockscout explorer API (if permitted by the provider), `VLAD_RPC_4663`, `VLAD_RPC_1`, `VLAD_RPC_42161`, `VLAD_RPC_8453` for dedicated HTTPS JSON-RPC URL overrides, and `VLAD_VIEW_TOKEN` to restrict `/api/*` with `Authorization: Bearer ...`. Never put secrets in source code.

**Caution:** On some networks, public Blockscout endpoints may throttle, reject unauthenticated requests, or not exist. A failing provider must be shown as failed. An RPC fallback cannot replace indexed historical transaction coverage. An independent indexed fallback requires a valid Etherscan API key configured as a secret; Etherscan v2 might not support all chains, and this is recorded as a failure rather than masked.

## Verification / status

- `GET /health` is liveness only, `collectionVerified: false` by design.
- `GET /api/status` returns latest D1 run, five ledger rows, raw source attempts, per-stream coverage and baseline-completeness flags.
- `GET /api/events?limit=25` returns structured observed public transactions/transfers, with `baseline` marks and NO inferred swaps.
- Never use a green /health response to claim all chains checked. Required production gate: recent completed run with exactly five coverage rows, no failed or partial streams, and successful direct explorer transaction proof for material alerts.

## Recovery

If Blockscout PRO is 503, Worker independently attempts public REST and, if `ETHERSCAN_API_KEY` exists, Etherscan v2. RPC uses another host when wrong chain, timeout, 429, 503 or DNS failures occur. All actual source attempts are persisted; there is no silent fallback to a shared paid Blockscout key.

Independent verified-source attribution and research into new official wallet disclosures remain responsibilities of the existing ChatGPT automation, not the deterministic chain collector. If both indexed data sources are down, coverage is partial/failed, not “no activity”.