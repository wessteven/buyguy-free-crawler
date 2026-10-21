"""Offline-only HTTP 400 triage helpers for GOGET research.

Never performs network requests, reads secrets, or imports the production engine.
Only accepts known provider labels, never raw URLs or request headers.
"""
from urllib.error import HTTPError

ALLOWED = {
    "cloudflare_d1": "CLOUDFLARE_D1",
    "dexscreener": "DEXSCREENER",
    "geckoterminal": "GECKOTERMINAL",
}

def classify_http_failure(provider, error):
    """Return non-sensitive evidence, not a guessed root cause."""
    source = ALLOWED.get(provider, "UNCLASSIFIED")
    status = error.code if isinstance(error, HTTPError) else None
    return {
        "provider": source,
        "http_status": status if isinstance(status, int) and 100 <= status <= 599 else None,
        "confirmed_root_cause": False,
        "diagnostic": "REQUEST_SOURCE_LABELED" if source != "UNCLASSIFIED" else "SOURCE_UNRESOLVED",
    }

def classify_unattributed_log(message):
    """Legacy crawler logs omit URL and call site: keep attribution unresolved."""
    if "HTTP Error 400: Bad Request" in str(message):
        return {"http_status": 400, "provider": "UNCLASSIFIED", "confirmed_root_cause": False,
                "diagnostic": "HTTP_400_CALL_SITE_NOT_LOGGED"}
    return {"http_status": None, "provider": "UNCLASSIFIED", "confirmed_root_cause": False,
            "diagnostic": "INSUFFICIENT_LOG_EVIDENCE"}
