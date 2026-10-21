"""Offline-only tests; never invoke src/engine.py or the network."""
import unittest
from urllib.error import HTTPError
from research.http400_triage import classify_http_failure, classify_unattributed_log

class Http400TriageTests(unittest.TestCase):
    def test_known_sources_are_labeled_without_leaking_url(self):
        for name, label in (("cloudflare_d1", "CLOUDFLARE_D1"),
                            ("dexscreener", "DEXSCREENER"),
                            ("geckoterminal", "GECKOTERMINAL")):
            with self.subTest(name=name):
                err = HTTPError("https://example.invalid/private?token=SECRET", 400,
                                "Bad Request", None, None)
                report = classify_http_failure(name, err)
                self.assertEqual(report["provider"], label)
                self.assertEqual(report["http_status"], 400)
                self.assertFalse(report["confirmed_root_cause"])
                self.assertNotIn("SECRET", str(report))

    def test_unknown_provider_never_echoes_sensitive_input(self):
        report = classify_http_failure("secret-token-value", HTTPError("x", 403, "x", None, None))
        self.assertEqual(report["provider"], "UNCLASSIFIED")
        self.assertNotIn("secret-token-value", str(report))

    def test_legacy_log_does_not_invent_source(self):
        report = classify_unattributed_log("BuyGuy crawler error: HTTP Error 400: Bad Request")
        self.assertEqual(report["provider"], "UNCLASSIFIED")
        self.assertEqual(report["diagnostic"], "HTTP_400_CALL_SITE_NOT_LOGGED")
        self.assertFalse(report["confirmed_root_cause"])

    def test_non_http_exception_does_not_invent_status(self):
        self.assertIsNone(classify_http_failure("cloudflare_d1", ValueError("bad"))["http_status"])

if __name__ == "__main__":
    unittest.main()
