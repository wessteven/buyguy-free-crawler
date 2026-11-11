# GOGET Early Momentum Case Study — MIHAO (research only)

**Case status:** two user-supplied observations of one named token, **not**
an audited market-history replay or a profitable signal. Kept separate from
FLOAT's LaunchLab-birth transaction evidence.

**Verified mint identity:** `4CxjZyMNoF1p6eXHXHv1TWpS2X47CuUmLwtGe18spump`;
Helius DAS describes it as `ni hao cat` / `mihao` on Solana Token-2022.
The analyzed market snapshot and image are supplied by the user; neither
record constitutes raw on-chain OHLCV or execution evidence.

## A. Earlier quantitative research snapshot

**Time given:** 2026-10-28 **06:10 UTC**.

| Input | User-supplied value |
| --- | ---: |
| Price | $0.00009981 |
| 15m EMA9 / EMA21 | $0.00010089 / $0.00009395 |
| 1h EMA9 | $0.00009243 |
| 15m ATR | approximately $0.0000100 |
| Swing low / prior high | $0.00007322 / $0.00013333 |
| Fib support | $0.00009618 |
| Bullish confirmation | $0.0001104–$0.0001139 |
| Historic upside reference levels | $0.0001333, $0.0001497, $0.0001705 |
| Historic downside levels | $0.0000861, $0.0000732 |
| Trade reconstruction | 1,065 identifiable pool trades over approximately 30h |

These are **inputs, not independent calculations**. Original transaction
signatures, full data coverage, timestamped candles, pool identity and
sampling methodology for the 1,065 trades have not been provided here.
A trade count does not establish independent unique buyers, wallet quality,
non-wash volume or executable quotes. Do not label historical ATR, EMA or
volume as verified by GOGET.

The snapshot implies price > 15m EMA21 and > 1h EMA9, but < 15m EMA9.
ATR / observed price = about 10%. These are **mixed momentum conditions**,
not a verified entry.

## B. Later image observation — screenshot, capture date unknown

User shared a mobile Pump.fun-linked trading interface screenshot. Visible
market indicators only (do **not** store/copy screenshot or user's personal
balance, holdings, P&L, account UI or trade details into the repo):

- Display price: **$0.0002101**.
- Display change: **+102.89%**, but the interface's comparison period
  is unspecified and must not be assumed to be 24h.
- Chart interval selected: **4H**. Visual upward expansion followed by large
  wicks/retracement. Exact bar timestamps, actual high and raw OHLCV **unknown**.
- No dated screenshot provenance or transaction receipt linking it to a
  precise later instant, so do not assign it a timestamp or assume elapsed
  time from the 06:10 UTC snapshot.

Compared **only as two prices**, $0.0002101 versus $0.00009981 is
approximately **+110.5%**. That is **not** a return GOGET could have earned.
The later displayed price is above all three earlier user-supplied bullish
levels, including $0.0001705, but it does not establish **when**, **which
intrabar candles**, or **what liquidity/fees** would have permitted fills.

## C. What the GOGET research engine should learn

Use MIHAO as a **post-birth secondary-acceleration / breakout-retest** case,
not as a LaunchLab event. Unlike FLOAT, MIHAO's late screenshot is not
historical birth detection evidence.

At each candidate observation, persist only facts available by that time:
`mint, exact pool/curve, program, slot, blockTime, receivedAt, quoteSourceAt,
price/marketCap/liquidity provenance, sample window, OHLCV completeness,
independent verified buyer count if known, wallet overlap if supported`.
No price bar from the future and no retroactively assigned buy trigger.

Candidate independent stages for future calibration:
1. **BASE_FORMING**: lower timeframe price consolidating above a slower EMA;
   volatility and data sufficiency explicit. No buy inference.
2. **CONFIRMATION_PENDING**: price has not reclaimed its defined breakout
   window; report threshold distance without claiming a signal.
3. **CONFIRMED_MOMENTUM**: exact timestamped candles cross the pre-registered
   resistance window with sustained evidence from multiple non-overlapping
   transaction windows; require contemporaneous slippage/liquidity checks.
4. **EXTENDED_OR_REJECTING**: repeated large wicks, ATR expansion, or rapid
   retrace warrants a distinct risk condition. Do not chase headline % returns.

For the historical 06:10 snapshot, *provisional* class should remain
`CONFIRMATION_PENDING` since the price ($0.00009981) was below the nominated
$0.0001104–$0.0001139 confirmation zone. The later screenshot has no reliable
time/candles and can only be classified `LATER_OBSERVED_ABOVE_LEVELS`, **not**
`CONFIRMED_MOMENTUM_AT_06:10` or `BUY_QUALIFIED`.

### Backtest and integrity requirements

- Retrieve exact pool and non-overlapping swap windows from Helius/chain RPC;
  validate 1,065 reconstructed trades and missing data explicitly.
- Reconstruct historical 1m / 5m candles *as of each signal timestamp*,
  reporting EMA warm-up, ATR source bars, volume samples and UTC boundaries.
- Replay thresholds with walk-forward only: signal-time values frozen, next
  candle not used for entry, including fee/slippage/route availability.
- Include failed launches and high-wick reversals to measure false positives,
  missed rallies, best/worst forward excursion, and actual fillable opportunities.
- Resolve deployer/early funded wallets independently: activity or multiple
  accounts is **not** independent buyer confirmation.
- Treat any stake/position shown in the user screenshot as private and exclude
  it from public GitHub documentation, fixtures and logs.
- No production scanner/cron, Durable Object, D1 schema/history, paper trading,
  Android signing or PR #5 modifications.

**Decision:** MIHAO is useful calibration evidence for *Stage B* early
acceleration once complete timestamped raw data is obtained. It does **not**
prove our current detectors could have alerted early, nor verify a historically
executable entry, current price, or profitability.
