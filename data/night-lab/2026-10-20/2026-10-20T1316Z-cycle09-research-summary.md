# WHAT'S GOOD Night Lab — Cycle 09

**UTC observation window:** 2026-10-20 13:06–13:16. Research-only, zero real/paper trades.

**Research passes:** 10 purposeful attempts; 5 complete (discovery, pool identity, normalized buyer flow, contract checks, lessons) and 5 partial (candles, executable liquidity, socials, all-lead refresh, historical reconstruction).

**PRO:** independently authenticated 2026-10-20T13:07:12.728Z, Robinhood Chain 4663, shared allowance unused.

## Evidence

- **FORKIUS** (mint 7xTMgacureYyKpaQZwP6LHR1tywEaBjAYfj9zidipump; pool 8uzUfQhxmTSGCunXB6ndTtZHxexyshEKbgsZjVAXh2tT): 12:50 UTC 7 buys/13 sells/5 buy fee payers; 12:55 4/6/3; 13:00 14/3/11; 13:05 14/7/11. Nine of 11 buy fee payers in the second strong window were new relative to the prior five minutes. 13:10 window partial and selling-heavy. Gecko pool cap ~$23.3K and liquidity ~$12K, below preferred thresholds. No buy qualification.
- **Satoshi** (mint SAtoZGJkh4Eid9EQZYXWnCNVn5asZrWZLouBMX1SHi1; pool 7jTCpYho9RJhCn9ZyrLPjwGWkacGhJVdzL2cZni3UdUh): 13:05 UTC four buys from only one fee payer. Gecko pool cap ~$49.7K, liquidity ~$18.2K, security score 26. No distinct-buyer acceleration.
- **SEED** (contract 0x6adb9cd443f4653572101e2f91b35ea1ed5f6b69): Blockscout PRO 117 holders and $0.00006659 quote. Gecko reports $55.95K liquidity but marks 211.37M SEED at $41.93K despite spot multiplication yielding ~$14.05K. This is a concentrated-liquidity accounting discrepancy, not a verified executable valuation. Verified source mints supply only in constructor, with no custom transfer tax. Team 15%, community 5%, and initial owner were assigned the same verified SafeProxy 0xA5b7c4C651f787debDECd6d7bf6346E35406D18d. Vesting/lock enforcement remains unverified.
- **SUPERCORE** exact mint 3ZAnpeVBHAvZsySNMXp4g9nYaE1jsx6khgh29VYKpump and pool 6aXb1e6uTMsz77zhncRYFe7AugzBxxcUnhCodhd3odag. Gecko cap ~$108.9K, liquidity ~$32K; 24h price deterioration and weak sampled buyer persistence.
- **Controls:** BORLY 100 sampled transactions in ~38s from 30 fee payers (concentration, not proof of wash trading); EVOLVE cap ~$37.6K, liquidity ~$16.2K; graduated Wojak pool zero liquidity. Robinhood AMERICA pool claimed ~$321K liquidity with ~$2.57 quote-side WETH; quarantine.

## Research records and limits

All 48 prior records retained in the local 52-record JSON; four new exact-mint entries appended (SUPERCORE, Wojak, LEO, ACCEPT IT). The GitHub JSON is an immutable **delta summary**, not the full 52-record file. No verified executable sell routes, independent LP lock proofs, full historical USD candles or organic social conversion. Helius quotes and estimated same-pool swap execution prices must not be mistaken for realized returns.

**Next tests:** third complete buyer window for FORKIUS, SEED Safe vesting controls and v4 pool depth, organic buyers in SUPERCORE, and zero-quote-side liquidity traps on Robinhood.
