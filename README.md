# BuyGuy Free Radar — deployed experimental crawler

Live dashboard: https://buyguy-free-radar.wessteven.workers.dev/dashboard

**Live status:** Cloudflare Worker deployed, D1 connected and GitHub scanner operational. Cloudflare ten-minute Cron Trigger is registered and has produced at least one successful independent scheduled scan. Provider rate limits and Free-plan scheduling delays can still interrupt coverage.

## Free shared architecture

- Cloudflare Worker Free: mobile dashboard and light new-pool discovery on `*/10 * * * *` (UTC), with separate DEX Screener fallback when GeckoTerminal rate-limits.
- GitHub Actions public repository: deeper research and prediction tracking, best-effort schedule.
- Cloudflare D1 Free: single token/address directory, observations, predictions, event history, and USD experimental paper ledger.
- No real-money trading or transaction signing under any circumstance.
- The existing original BuyGuy website, real portfolios, and old Night Game simulation ledger are independent of this experimental database.

## OUR SCORE calibration journal (20 October 2026)

Research only, no live or simulated trading. Added `src/our-score-core.mjs` (frozen version-1 factor formula, regression-checked against the dashboard), `src/score-journal.mjs`, `score_snapshots` and `score_outcomes` tables.

- **Once per UTC clock hour**, independent Cloudflare Worker research stage selects up to five top-ranked tokens and three rotating lower-ranked comparison tokens meeting fresh quote, exact chain-contract identity, pool, minimum liquidity, minimum 5m transactions and known-risk exclusions. Scores and market conditions are **recorded at decision time**; they are never rewritten using later information.
- Quotes are measured at the **first observed matching-asset pool** within 30 minutes after each 15-minute, 1-hour, 6-hour or 24-hour due time. Observations use the existing indexed price-history ledger. No candles or prices are invented if provider data are missing.
- `EVALUATED`: same pool, price observed; outcome is indicative percentage change of the raw quote. `POOL_CHANGED`: the quote belongs to a different pool, **not** a measured return. `MISSED_DATA`: no valid future quote by the 45-minute outcome deadline. Otherwise `PENDING`.
- **Outcomes** dashboard tab distinguishes top-five and lower-ranked comparison samples, displays the immutable score at snapshot time and each horizon's return/status, and shows the mean observed 1-hour price change per group only when both cohorts have measured quotes. Partial samples are prominently labelled **not proof of predictive accuracy**. These figures ignore slippage, price impact, fees and real-world sellability. The separate paper-wallet experiment remains **disabled**.
- Hourly ledger reads are intentionally bounded (up to 120 active market records, 100 latest route events, eight snapshots including controls, and at most 12 outstanding horizon evaluations per scheduled run). Journal failures are isolated from market discovery and on-chain audits. If the schema isn't initialized, the stage reports `SCHEMA_PENDING`, not fabricated historical results.
- **Live activation is pending:** Cloudflare D1 Free daily row-read quota is exhausted. The existing hourly GitHub crawler reruns the idempotent `sql/schema.sql` initializer; database migrations and real journal data cannot be confirmed until Cloudflare's quota resets and a complete verified run succeeds.

No weights are automatically retrained at this stage. The experiment first needs credible forward outcomes and a sufficient, unbiased sample.

## D1 Free row-read budget and recovery (20 October 2026)

The automated Cloudflare D1 deployment check exposed a hard provider limitation: **the account exceeded its free-tier daily rows-read allowance**. The dashboard Worker can be published independently, but live D1-backed rankings are **unavailable** until Cloudflare resets the allowance at **midnight UTC**. Do not claim this as an operational successful end-to-end deployment while reads are blocked.

Improvements to prevent a repeat:
- Active token social links and historical archive summaries use **grouped passes and joins** instead of scanning research-event history separately for every asset.
- Added `research_event_asset_kind_id` and `research_event_kind_id` indexes. The crawler's idempotent schema initializer automatically applies them on its next successful run; **schema changes are not yet confirmed active in production until D1 accepts queries again**.
- Deployment checks read a single indexed row from each required table rather than issuing growing full-table `COUNT(*)` queries. A real provider quota error remains a failed check, with safe diagnostic output.
- **Cloudflare Cron remains every 10 minutes**. Duplicate GitHub Actions scanning is reduced to **hourly fallback**; manual `workflow_dispatch` remains available.
- The WHAT'S GOOD? UI explicitly shows **LIVE RANKING UNAVAILABLE** on data errors, rather than inventing a top five, and never treats a read-quota outage as an absence of interesting tokens.

Verify live Cloudflare D1 status, the schema/index migration, and real charted shortlist once the daily quota resets. Automated tests run without live D1 and cannot prove quota recovery.

## WHAT'S GOOD? research front page (20 October 2026)

The logged-in dashboard now opens to **WHAT'S GOOD?**, a five-candidate shortlist calculated locally from the same authenticated /api/status data as TOKEN DATA. It does not run another external crawler, change ledger data, place a trade, or expose private dashboard data publicly.

- Rank top five **eligible** ALIVE/STATIC tokens by OUR SCORE (min 35), using the exact chain-specific token address. Missing/invalid price, market cap or quote; quote age over 30 minutes; pool liquidity under $15k; fewer than five 5m transactions; known mint/holder risk; and archived status disqualify the candidate. **Zero qualifying tokens returns an honest empty state.**
- Visible **BUY WATCH / RISING / WAIT / CAUTION** labels are *research workflow* verdicts, not buy instructions. Any insufficient safety evidence pushes verdict to CAUTION; parabolic price moves, stale quotes and low liquidity cannot be presented as positive conviction. Independent green-gate evidence continues to govern LP-lock icons.
- Each shortlist card explains two things separately: **why it is interesting** and **what remains risky**. Shows raw score, approximate quote age, buying versus selling transactions, USD liquidity and liquidity/cap ratio. Provides exact-mint DexScreener chart, OUR SCORE factor inspection, safety gate and read-only on-demand audits when a verified address exists.
- Clicking **Full research + all tokens** switches to the existing sortable research table and orders it by descending OUR SCORE, without dropping other dashboards or changing saved column layouts. Existing user sessions default to the new home tab once; subsequent user tab choices persist in the new v2 display preference.
- **Do not backfill five with stale/low-quality names:** this is a focused view, not a top-movers feed. Current rankings remain heuristic and unvalidated; do not interpret score as a probability of profit or guaranteed sell execution.

## Automatic active-radar cleaning and learning archive (20 October 2026)

The dashboard splits current candidates from historical examples without deleting research:

- **TOKEN DATA / HOT / NOT:** only currently active or cooling assets (plus protected pinned/open-paper holdings), with an explicit **Active** count. `NOT` is not the dead-token archive.
- **📚 Archive:** dormant `DEAD` assets, subdivided into a prominent learning shelf (historic peak momentum score >=60, 10+ observations, prediction outcomes, material on-chain/route research, or paper-trade history) and a collapsed **Quiet storage** section. The "peak score" is historical screening evidence, **not** a price multiple or profit.
- **TRASH:** unresolved/no-quote addresses (after 24h) which are excluded from refresh. Valid identified tokens are never automatically trashed merely because their quotes grew old.
- **Reversible decisions:** after 24h and at least three persistently weak observations, a candidate can move to `DEAD` when buyers, 5m transactions and volume/liquidity are all low. Independently, a token with no usable quote for 48h becomes dormant; an identified but never-quoted asset archives after 72h.
- **Protected cases:** pinned addresses, open paper positions and pending predictions cannot be automatically retired or trashed; all archived observations, evidence, prediction records, trades and notes remain in D1.
- **Genuine comebacks:** a small (~15%) rotating share of quote-refresh slots is reserved for dormant assets. A previously archived asset only returns to active tracking when an exact-mint quote shows meaningful liquidity, buyers, buy/sell balance and non-collapsing price flow. A generic fresh quote is not a comeback. No status is a safety approval and nothing here triggers trades.

These are cautious heuristics, not a claim to predict that a dormant coin can never recover. Everything remains in the research ledger. No destructive database migration or deletion is required.

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

## Canonical Pump.fun migration provenance (live verification)

- The official Pump docs specify that canonical PumpSwap migration pools use pool index `0` and a creator PDA derived from the seeds `[b"pool-authority", base_mint]` under the Pump bonding-curve program. An ordinary creator-controlled PumpSwap pool can use a different pool creator/index. The creator PDA must be derived with Solana's actual off-curve PDA algorithm—not guessed from a matching token name.
- `src/pump-migration.mjs` independently derives that PDA with SHA-256 and ed25519 curve checks. Its address matched `@solana/web3.js` on GitHub Actions. It classifies `CANONICAL_LP_BURN_PATTERN` only when the on-chain Pool index and creator both match AND the verified current LP mint supply equals zero while the pool's recorded LP supply is positive.
- In a **live 8-pool sample**, five PumpSwap pools matched the canonical migration/burn profile (CATONICE, Doomsday, NVYX, SI276, MINTER) and three did not (LEOWIN, Sisish, JEFF), despite all eight having zero minted LP supply. This demonstrates that burned LP supply *alone* does not establish an official Pump migration.
- `src/pump-migration-tx.mjs` derives the `bonding-curve` PDA, performs a **bounded read-only** Solana transaction search and checks the exact Pump program `migrate` / `migrate_v2` instruction discriminator and exact pool, mint, and bonding-curve instruction accounts, requiring successful transaction metadata.
- **Live historical proof:** startupSI had a successfully verified `migrate_v2` transaction at slot **458536089**; other samples remained unverified within the bounded history search. A miss is not negative proof. `PUMP_MIGRATION_TX_PROBE` records the observed signature/slot separately from the canonical PDA/burn evidence.
- In the Token Data safety popup, canonical pool identity, LP supply burn pattern, and historical transaction proof are separate facts. **None automatically verifies LP locks, ultimate owners, a safe AMM upgrade authority, sellability, or grants 🟢/paper eligibility.**
- The real PumpSwap AMM program still has an **on-chain upgrade authority** (verified with BPF loader metadata). Even a confirmed migration transaction is not proof that protocol governance is immutable.

Implementation references: [PumpSwap documentation](https://github.com/pump-fun/pump-public-docs/blob/main/docs/PUMP_SWAP_README.md), [canonical creator PDA specification](https://github.com/pump-fun/pump-public-docs/blob/main/docs/PUMP_SWAP_CREATOR_FEE_README.md), [Pump migration](https://github.com/pump-fun/pump-public-docs/blob/main/docs/PUMP_PROGRAM_README.md), [migration history validation workflow](https://github.com/wessteven/buyguy-free-crawler/actions/workflows/live-pump-migration-tx.yml).

## Green-light pool protocol engineering (19 October 2026)

- A live read-only survey of 35 tracked Solana pools found **19 PumpSwap AMM**, **13 Pump.fun bonding curves**, **2 other protocols**, and **1 Meteora DAMM V2**. Raydium CPMM was not present in that sample. Programs are identified from `getMultipleAccounts` *account owner*, not by symbol.
- `src/pool-protocol.mjs` dispatches exact pool accounts by on-chain owner. `src/pumpswap.mjs` decodes the official PumpSwap Pool discriminator/layout, verifies both vault accounts and their mint/authority links, verifies the Token-2022 LP mint, and records the discrepancy between the pool LP supply and mint supply. That discrepancy **is not automatically a lock certificate**.
- `src/raydium-cpmm.mjs` implements the corresponding exact-account verifier for known Raydium CPMM program accounts. No Raydium evidence is applied to PumpSwap, Meteora, or bonding curves.
- `src/green-probes.mjs` excludes **only protocol-verified vault token accounts** from a limited top-token-account owner sample. Remaining addresses may still be custodians or multiple wallets controlled by one entity, so `beneficialOwnersVerified` stays false.
- `src/program-authority.mjs` reads official Solana BPF upgradeable-loader metadata. **Live PumpSwap is upgradeable, with an upgrade authority present**. BuyGuy records this as protocol governance risk, not proof of malicious behavior.
- Independent custody lock/unlock proof AND immutable or separately verified time-locked governance remain mandatory for a green screen. `src/green-gate.mjs` never turns 🟢 from an LP-supply gap, pool owner name, unsupported protocol, stale mint metadata or nominal safety score.
- GitHub Actions `live-pumpswap-probe.yml` verified **both real PumpSwap token vaults and Token-2022 LP mint** for a tracked pool; `live-program-authority.yml` independently verified upgradeability. Neither workflow signs or sends transactions.

Authoritative technical sources: [PumpSwap docs](https://github.com/pump-fun/pump-public-docs/blob/main/docs/PUMP_SWAP_README.md), [PumpSwap Anchor IDL](https://github.com/pump-fun/pump-public-docs/blob/main/idl/pump_amm.json), [Solana program deployment](https://solana.com/docs/core/programs/program-deployment), [Raydium CPMM pool source](https://github.com/raydium-io/raydium-cp-swap/blob/master/programs/cp-swap/src/states/pool.rs).

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

## On-demand WHAT'S GOOD? deep refresh (21 October 2026)

- Authenticated **⟳ REFRESH TOP 5 · DEEP** shows a live, per-stage progress panel with stop-after-current-step. Stages are **new-pool discovery** (GeckoTerminal with existing Dex fallback), **up to 25 tracked exact-contract quote refreshes** (DEX Screener), **rebuild shortlist** from authenticated D1, then a **four-stage read-only audit of each of the up to five qualified leaders** (market, mint/holders, pool/admin, and indicative round-trip route), then final live ranking. The UI labels verified updates separately from limits, unsupported checks and missing evidence.
- The two new expensive public-data stages are invoked individually via authenticated same-origin `POST /api/top5-refresh`, throttled with **atomic D1 leases** (180 seconds discovery, 120 seconds quotes); per-token stages reuse existing audit cooldowns. No secrets or API URLs are accepted in request bodies; no arbitrary contract can be audited without an existing tracked exact-chain key.
- If D1 read allowance is exhausted, the workflow stops and displays the existing approximate UTC reset clock. Other missing RPC credentials, third-party 429 responses and quote failures produce transparent partial/failed states rather than fictitious green lights. Browser tab must remain open for all stages. **No real or simulated trades, schedule changes, background tasks or schema edits.**
