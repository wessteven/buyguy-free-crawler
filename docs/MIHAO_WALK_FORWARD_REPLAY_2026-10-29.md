# MIHAO GOGET historical acceleration replay — 29 October 2026

**Experimental research only; no trade recommendations, no GOGET production changes.**

This replay follows the earlier MIHAO technical snapshot and the public GeckoTerminal
raw OHLCV export, and records only the information available at each completed
bar. The full reproducible replay package (raw provider ZIP, replay Python script,
signal audit, outcomes, JSON, chart, report) was generated locally; the raw data
is also in [GitHub Actions run #40835434193](https://github.com/wessteven/buyguy-free-crawler/actions/runs/40835434193),
artifact `MIHAO-RAW-OHLCV-GOGET`. This document is a results checkpoint, not
a production signal integration.

## Exact identity and evidence

- Solana mint: `4CxjZyMNoF1p6eXHXHv1TWpS2X47CuUmLwtGe18spump`.
- PumpSwap pool: `Ho1aSG6WGH1FfXdEHrK2f4Ggt1Hoxo9s5jcLMDqeyeBz`.
- GeckoTerminal 48h historical range: 2026-10-27 00:00 to 2026-10-29 00:00 UTC exclusive.
- Source archive SHA-256: `4855c38dff926710e36fe0054f349c75889c1b0c2119c8b24c16e6f400502df8`.
- Data: 186 out of 192 possible 15m bars; 1,070 out of 2,880 possible 1m bars.
  Missing bars were not filled. They may reflect inactive minutes or upstream
  missing data; neither assumption is proved.
- Summed provider reported 48h volume: $487,643.97; not signed swap reconstruction.

## Exploratory 15m alert rule (frozen at each bar close)

- Two consecutive rising 15m closes, total rise of at least 12% over 30 minutes.
- Close above EMA9 above EMA21, each seeded from first observed completed bars.
- Mean volume latest two 15m bars at least 1.5× preceding eight bars' mean.
- Consecutive ten-bar lookback without interpolation; EMA21 warmup.
- Alerts deduplicated within 90m. No future candles used in eligibility.

**Outcome convention:** hypothetical price at next 15m bar's **opening quote**,
not a trade fill; first threshold of +20% high or −15% low in the next 3h.
Same-bar target and stop is ambiguous. No fees, liquidity proof, slippage,
market-order execution, actual GOGET detection, unique buyers, holder security
or live quote lag is assumed.

| Signal available UTC 28 Oct | Indicative entry | Maximum 3h upside | Maximum 3h downside | First barrier / result |
|---|---:|---:|---:|---|
| 04:45 | $0.00010713 | +5.19% | −14.99% | Neither +20% nor −15% hit |
| 08:30 | $0.00011988 | +6.68% | −19.79% | −15% low crossed (1m: 10:52) |
| **17:45** | **$0.00010430** | **+251.04%** | **0.0%** | **+20% high crossed (1m: 17:48)** |
| 20:30 | $0.00032429 | +2.88% | −41.21% | −15% low crossed (1m: 20:32) |

**Result:** 4 distinct alerts, 1 +20%-first winner, 3 non-winners. Among the
three signal episodes at or before 17:45 (the major 17:45–18:00 explosive bar),
two were unsuccessful. These are multiple signals **within the same preselected
winning token**, not an estimate of how often independent launches fail.

### Latency matters

At the **17:45 UTC** theoretical signal, one-minute provider opening prices
progressed as follows:
17:45 $0.00010430; 17:46 $0.00010784; 17:47 $0.00011111;
17:48 $0.00011303; **17:49 $0.00015509 (+48.7% over 17:45)**;
17:50 $0.00015863 (+52.1%). The 17:48 minute bar's high first exceeded
a notional +20% target. This is not evidence of fillability.

The prior 06:10 UTC user's $0.0001104–$0.0001139 confirmation zone
would first see a completed 15m close **above** the upper bound at **08:30**,
which did not become a +20% winner; the later post-drawdown 15m close above
the zone was **18:00**, already after the initial explosive candle.
Thus price-level crossings alone both generate false positives and may arrive
too late.

Tightening the volume threshold from 1.5× to 2× would have shifted the
major-run signal from 17:45 to **18:00** under the same price rule, illustrating
the detection-delay versus noise trade-off. Do not optimize on this one winner.

## Scope and next gates

The main lesson is a proposed two-stage EARLY / ACCELERATING research alert:
low-latency on-chain birth discovery **plus** causal momentum evidence.
This one-token post hoc analysis cannot establish a profitable predictive
strategy or genuine real-time GOGET capabilities. Before using alerts for
decisions, replay an independently sampled cohort of failed launches and
winners, and measure by timestamp: creation, source pool listing, first GOGET
observation, alert latency, quote lag, actual reserves/slippage, signed swap
volume, independently verified buyers, wash/insider clustering and execution.
No live scoring or trading changes should be made based on these counts.

PR #5 (Pocket Radar v0.8), the production 10m discovery cron, 30s known-pool
collector, provider cooldown, historical D1, existing paper wallet, and
Android signing are **unchanged**. No user balance, fills or screenshot were
copied into the public repo.
