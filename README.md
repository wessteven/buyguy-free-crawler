# BuyGuy Free Crawler V3

Experimental Robinhood Chain / Solana research and USD paper-trading engine.

**Current deployment status: NOT LIVE.** The ChatGPT GitHub connection has begun uploading the V3 project. The crawler source, database, and website must be installed and tested before a ten-minute schedule is enabled. No real-money trading is implemented.

## Architecture ($0 target)

- GitHub Actions public-repository standard runners: eventual six best-effort runs per hour.
- Cloudflare D1 Free: central candidate history, prediction journal and paper wallet.
- Cloudflare Worker Free: read-only dashboard.
- DEX Screener and GeckoTerminal public APIs: discovery and indicative market quotes.
- Optional private Blockscout PRO and Helius credentials: verification from GitHub Actions only when secrets are configured. Connected ChatGPT plugins do **not** expose their keys to GitHub.

## Security

Never commit API keys, tokens, wallet keys, or secret values. Use GitHub Settings > Secrets and variables > Actions for `CF_ACCOUNT_ID`, `CF_DATABASE_ID`, `CF_D1_API_TOKEN`, and optional `BLOCKSCOUT_PRO_API_KEY` / `HELIUS_API_KEY`. Do not paste secrets in chat.

## Initial setup

1. Wait for V3 source and SQL to be uploaded.
2. Create a free Cloudflare D1 database `buyguy-free-v3` and scoped API token.
3. Configure GitHub repository secrets securely.
4. Run **BuyGuy Free Crawler > Run workflow > init**, then **scan**.
5. Verify three good scan results, source timestamps, stable D1 history and zero trades without valid quotes.
6. Enable best-effort `7,17,27,37,47,57 * * * *` UTC schedule only after initial checks succeed.

All paper fills are illustrative, not proof of real execution. Contract existence is NOT a safety certification. This is separate from the historical BuyGuy and Night Game accounts.

[Cloudflare D1](https://developers.cloudflare.com/d1/) · [GitHub Actions](https://docs.github.com/en/actions)
