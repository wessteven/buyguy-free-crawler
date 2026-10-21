"""Read-only GOGET provider health probe. No production engine imports or D1 queries.

Only fixed public GET endpoints are contacted. Cloudflare D1 is deliberately
NOT probed: its query API is POST-only and even SELECT would require credentials.
"""
import json
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

ENDPOINTS = (
    ("DEXSCREENER_BOOSTS", "https://api.dexscreener.com/token-boosts/latest/v1"),
    ("DEXSCREENER_PROFILES", "https://api.dexscreener.com/token-profiles/latest/v1"),
    ("DEXSCREENER_TOP", "https://api.dexscreener.com/token-boosts/top/v1"),
    ("DEXSCREENER_COMMUNITY", "https://api.dexscreener.com/community-takeovers/latest/v1"),
    ("GECKOTERMINAL_NEW_POOLS", "https://api.geckoterminal.com/api/v2/networks/solana/new_pools?include=base_token&page=1"),
)

def check(label, url, opener=urlopen):
    req = Request(url, headers={"Accept": "application/json", "User-Agent": "BuyGuyCrawler/3"})
    try:
        with opener(req, timeout=12) as response:
            payload = json.load(response)
            return {"endpoint": label, "status": "OK" if isinstance(payload, (list, dict)) else "UNEXPECTED_JSON",
                    "http_status": response.status}
    except HTTPError as exc:
        return {"endpoint": label, "status": "HTTP_ERROR", "http_status": exc.code}
    except (URLError, TimeoutError, ValueError, OSError):
        return {"endpoint": label, "status": "UNAVAILABLE", "http_status": None}

def main():
    results = [check(label, url) for label, url in ENDPOINTS]
    results.append({"endpoint": "CLOUDFLARE_D1", "status": "NOT_PROBED_REQUIRES_AUTHENTICATED_POST",
                    "http_status": None})
    print("GOGET_READ_ONLY_PROVIDER_HEALTH " + json.dumps(results, separators=(",", ":")))

if __name__ == "__main__":
    main()
