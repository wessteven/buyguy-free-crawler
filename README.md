# BuyGuy Free Radar — deployed experimental crawler

Live dashboard: https://buyguy-free-radar.wessteven.workers.dev/dashboard

**Live status:** Cloudflare Worker deployed, D1 connected and GitHub scanner operational. Cloudflare ten-minute Cron Trigger is registered and has produced at least one successful independent scheduled scan. Provider rate limits and Free-plan scheduling delays can still interrupt coverage.

## Free shared architecture

- Cloudflare Worker Free: mobile dashboard and light new-pool discovery on `*/10 * * * *` (UTC), with separate DEX Screener fallback when GeckoTerminal rate-limits.
- GitHub Actions public repository: deeper research and prediction tracking, best-effort schedule.
- Cloudflare D1 Free: single token/address directory, observations, predictions, event history, and USD experimental paper ledger.
- No real-money trading or transaction signing under any circumstance.
- The existing original BuyGuy website, real portfolios, and old Night Game simulation ledger are independent of this experimental database.

## Research labels (never confuse them)

- `ALIVE`: market momentum score, **not** evidence of contract safety.
- `STATIC`: weaker momentum or cooling watch.
- `DEAD`: old/quiet but identified, remains archived for reactivation.
- `TRASH`: unresolvable and stale, retained only as a historical record.
- `UNVERIFIED`: no completed on-chain authority assessment.
- `MINT_CONTROL_RISK`: active mint/freeze controls or unsupported SPL mint configuration.
- `MINT_CONTROLS_REVOKED`: legacy partial mint-control result; not a paper-trading approval.
- `TOKEN_2022_REVIEW_REQUIRED`: Token-2022 extension behavior has not been independently verified, even if mint/freeze controls are revoked.
- `HOLDER_CONCENTRATION_RISK`: largest token accounts exceed conservative concentration thresholds (top account >40% or top five >85%). AMM pool accounts and custodians are not unique owner wallets.
- `HOLDER_DATA_UNAVAILABLE`: missing or unusable largest-account RPC evidence.
- `PARTIAL_ONCHAIN_REVIEW`: ordinary SPL mint controls revoked and raw supply/top account screening passed. **Still not certified safe; pool ownership, LP locks, transferability and real swap execution remain unknown.**
- `PAPER_ELIGIBLE`: explicit separately reviewed status needed before any simulated automatic entry. No current automated rule promotes a token into this state.

## Read-only route research

- The optional Jupiter `GET /swap/v1/quote` checks an indicative US$40 USDC-to-mint quote and then the opposite mint-to-USDC quote on the received token amount.
- Keyless access is limited; requests are spaced to respect 0.5 requests/second. A provider error creates `QUOTE_PROVIDER_UNAVAILABLE`, not a fabricated safe result.
- Checks separately require known mint decimals and compare the implied first-leg buy price with the observed DEX quote (rejecting differences above 25%). Checks fail on missing buy/sell routes, price impact above 5%, or a quoted round-trip loss above 12%.
- A quote merely shows that Jupiter produced a *possible route at that instant*. It cannot establish that a later trade succeeds, that LP liquidity is locked, or that a real wallet could sell.
- Route results are saved in `research_events` under `ROUNDTRIP_QUOTE` and displayed on the mobile dashboard. **No current route test automatically grants PAPER_ELIGIBLE or triggers a paper fill.**

## GREEN LIGHT — 7/7 independent evidence screen

**Green is a narrowly defined completed evidence screen, not a guarantee of safety and not buy permission.** In TOKEN DATA, tap a safety cell to inspect each prerequisite and the current pass count. The existing 0–100 numeric evidence score is distinct from these hard gates: a token with 85/100 can still be amber.

1. Recognized Solana token program, revoked mint/freeze authority and recent verified mint details (Helius).
2. No unreviewed mint-level transfer restrictions (Token-2022 hooks, freeze controls and other extensions fail closed).
3. Top token-account distribution inside stringent thresholds; **token accounts are not unique wallet owners**.
4. Independent beneficial-owner attribution with pool vaults/custody excluded. **Not implemented as a trusted passing verification source yet**.
5. Fresh exact-pool quote with >=US$50,000 reported USD liquidity.
6. Independent on-chain pool custody, administrative controls and liquidity-lock duration. **Not implemented as a trusted passing verification source yet**.
7. Recent indicative US$40 USDC → exact mint → USDC route with capped loss, impact and market-price discrepancy. **A route is not an executed sale**.

The green gate is calculated afresh by the Worker using timestamped D1 evidence, exact asset keys and fail-closed freshness limits. It never sets `risk_status=FULL_REVIEW_PASSED`, `PAPER_ELIGIBLE`, or `PAPER_SIMULATION_ENABLED`, never moves paper money, and never signs a real transaction.

The optional Helius owner-cluster and pool-program probes are active only when configured, rate-bounded and **always record provisional evidence**. They cannot certify LP locks or vault-excluded owner distribution. No 🟢 should appear until both independent proof producers exist and all seven checks are current. Robinhood Chain requires its own chain-specific verified implementation; Solana evidence is never reused for Robinhood contracts.

[BuyGuy live green-audit run history](https://github.com/wessteven/buyguy-free-crawler/actions/workflows/green-audit.yml)

## Paper-wallet engine

- Starting balance US$1,000 with no deposits or withdrawals from real wallets.
- US$40 per experimental position; eight maximum; stop 12%, target 35%, modeled adverse slippage 2% each way, modeled fee 0.3% each way.
- Refuses stale quotes, unknown pools, unreviewed contracts, price-less pools, duplicate open positions and entries during six-hour post-exit cooldown.
- D1 transaction batches keep cash, position and trade journal synchronized; tests execute against actual SQLite.
- Unrealized P&L is unknown (never made up) when a current usable quote cannot be established.
- The operational execution switch is **OFF by default**: `PAPER_SIMULATION_ENABLED` must explicitly equal `true` in the deployed Worker environment, and candidates must still pass `PAPER_ELIGIBLE` risk status. It must not be enabled until contract, pool and fill verification are fully integrated and the ledger is independently reviewed.
- No trades have been placed by this stage.

## Optional Helius integration

The ChatGPT Helius connector and GitHub/Cloudflare workers do not automatically share authentication. Helius authenticated mainnet reads have been verified. The Worker now performs **read-only** mint authority and top-token-account checks using Helius JSON-RPC; its key is stored only in secrets. To enable without exposing credentials in GitHub source or chat:

The user's `HELIUS_API_KEY` is already configured as a private GitHub Actions secret. Deployment injects `HELIUS_RPC_URL` securely into Cloudflare. Periodic authority and concentration reviews remain partial and never mark a token paper eligible.

**Robinhood contract checks through private Blockscout PRO are not yet integrated into the unattended engine.** The private Blockscout connector inside ChatGPT cannot be silently reused by GitHub. No shared free API allowance is used as a fallback.

## Deployment and tests

- GitHub Actions `BuyGuy V3 Tests` runs Python discovery tests, JavaScript mint-risk and simulated-ledger tests, and a real SQLite integration test.
- The dashboard deployment reruns the JavaScript/SQLite tests before publishing to Workers Free.
- Cloudflare may block GitHub's automated HTTP access to `.workers.dev` with Error 1010. That is reported as an external reachability warning, not conflated with deployment or D1 failure. The dashboard is already known to open on the user's phone.
- Periodic checks can fail on HTTP 429/other upstream outages; fallback is labeled in `runs.provider_errors` as `PARTIAL`, never synthesized as successful price evidence.

[Cloudflare Worker cron](https://developers.cloudflare.com/workers/configuration/cron-triggers/) · [Cloudflare D1](https://developers.cloudflare.com/d1/) · [GitHub Actions](https://docs.github.com/en/actions)
