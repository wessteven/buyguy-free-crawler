# GOGET Fast Radar — first measured LIVE LaunchLab birth proof

Date: **29 October 2026** (UTC). **Research only; no deployment.**

## Directly measured result

One-shot mainnet GitHub Actions sample:
[run #40861572445](https://github.com/wessteven/buyguy-free-crawler/actions/runs/40861572445);
artifact `GOGET-LAUNCHLAB-LIVE-LATENCY-PROOF` (ID `12892280279`).
The artifact's exact public, sanitized measurement is retained at
`research/live-launchlab-latency-2026-10-29.json`.
Duration 60 seconds, one Helius standard confirmed WebSocket logs subscription,
up to 150 notifications, max 6 getTransaction RPC lookups, at most 2 concurrent.

| Observation | Actual |
|---|---|
| Subscription connection opened | 10:57:16.389 UTC |
| Subscription acknowledged | 10:57:16.481 UTC |
| Live run ended | 10:58:16.192 UTC |
| Received log notifications | 122 |
| WebSocket bytes (including JSON envelopes) | 583,040 |
| Candidate initialization logs | 1 |
| Confirmed and decoded launch initializations | 1 |
| Transaction lookup attempts | 1 |
| Unrelated notices | 121 |
| Failed transactions ignored | 5 |
| Slot regressions observed | 0 |
| D1 writes, real/paper trades, device pushes | 0 |

Real new LaunchLab birth:

- Signature: `4qq2M4iqnXEjVfqUbdm6U7ja4WnXnHr6siwyFX5k8JqUhqebZ3mFGi86ym88ccCUD3bLGnEDYmAWFde8U2G14uEf`
- Slot **462855617**
- Mint: `4aLmAx2hKomyZ5nyM3UgcKjPfFX8AMcV2Aev6gkwdm3w`
- LaunchLab curve: `635A94ZtEDHz8mvGjBfFnDR2bYk3QfGmFi9WqEWv7idB`
- Block timestamp: **10:57:42.000 UTC** (one-second resolution)
- WebSocket notification *actually received*: **10:57:43.086 UTC**
- Confirmed transaction fetched and instruction verified: **10:57:43.147 UTC**
- Approximate chain-block timestamp to WebSocket arrival: **1,086 ms**, not
  high-precision chain propagation or a measured subscriber p50.
- WebSocket receipt to confirmed RPC verification: **61.17 ms**.
- No market cap, liquidity, beneficiary-independent buyer count, executable
  exit, or actual Android alert was established.

This **directly verifies live receipt and correct transaction identification**
via the lower-cost Helius standard subscription path. It is our first measured
LaunchLab example; one token and 60 seconds do **not** prove universal latency,
stream completeness, or consistent alert speed.

## Post-detection safety evidence must not be backdated

A later separate Helius DAS getAsset query indexed the observed mint at slot
**462856111** and reported name `Tommy Vercetti` / symbol `TOMMY`.
The token is **Token-2022**, with transfer fee extension configured to
**100 basis points (1%)**, an existing transfer fee config authority
`WLHv2UAZm6z4KyaaELi5pjdbJh6RESMva1Rnn8pJVVh`,
and mutable metadata. These are **post-birth** findings, not proof that
the 10:57:43 classifier had fetched them already.

This case validates the need for an immediate **BIRTH_OBSERVED** research
alert followed by separate source-grounded safety and liquidity checks.
No asset here is buy qualified or a recommended purchase.

## Practical bottleneck and next gates

Helius standard WebSockets accept `logsSubscribe` on lower-cost tiers.
Token birth detection can occur shortly after a blockchain event *in a
controlled sample*. The **bottleneck is now trustworthy continuous coverage
and fast trade-flow analysis** rather than merely increasing quote refresh
rate. To turn the sample into a reliable system:

1. Document reconnection/watermark and bounded backfill. A one-minute stream
   can miss launches if interrupted; `slotRegressions=0` doesn't prove no gaps.
2. Separate birth-notification latency, RPC verification, 30s/60s window
   completion, alert queue, and Android device receive time. No device alert
   has been sent; don't claim a working instant notification.
3. Collect exact on-chain swap trades on the detected **curve**, with reserve
   account evidence, verified fee-payer wallet clusters, and sellability.
   `logsSubscribe` by itself is not a verified trade decoder.
4. Measure true billed stream credits independently. 583,040 received bytes
   are a measured transfer size, **not** a billing statement.
5. Replay comparable fresh launches including failed curves, preserve
   at-signal data and later outcomes; do not optimize to this one verified
   example.

## Engineering constraints verified

- All work on the existing `research/launchlab-early-birth-poc` draft PR #6.
- Live sample triggered once by a path-filtered push marker; no recurring
  scheduler, 10-minute production cron change, D1 read/write, Android change,
  private key disclosure, real/paper trade, or production deploy.
- Entire regression suite plus dedicated mocked transport tests were green
  before initiating live stream. The one-shot GitHub job completed green.
- Sample ends after one minute even if no initialization event occurs.
  Confirmation from one successful transaction is not a broad success-rate estimate.
