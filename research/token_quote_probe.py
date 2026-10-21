"""Read-only public DEX Screener token quote probe; no credentials or D1 access."""
import json
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

# Stable public Solana mint and a known user-researched Pump.fun mint.
MINTS = (
    ("SOL_WRAPPED", "So11111111111111111111111111111111111111112"),
    ("KIMCHI_RESEARCH", "CSocnzcRpgSCr1naKcNTieWZUxb6rABe45j844m7pump"),
)
BASE = "https://api.dexscreener.com/latest/dex/tokens/"

def check(label, mint, opener=urlopen):
    req = Request(BASE + mint, headers={"Accept": "application/json", "User-Agent": "BuyGuyCrawler/3"})
    try:
        with opener(req, timeout=12) as response:
            data = json.load(response)
            return {"mint_label": label, "http_status": response.status,
                    "json_object": isinstance(data, dict),
                    "pairs_present": isinstance(data.get("pairs"), list) if isinstance(data, dict) else False}
    except HTTPError as exc:
        return {"mint_label": label, "http_status": exc.code, "json_object": False, "pairs_present": False}
    except (URLError, TimeoutError, OSError, ValueError):
        return {"mint_label": label, "http_status": None, "json_object": False, "pairs_present": False}

if __name__ == "__main__":
    print("GOGET_PUBLIC_TOKEN_QUOTES " + json.dumps([check(*item) for item in MINTS], separators=(",", ":")))
