"""No-network tests for fixed read-only provider health probes."""
import io
import unittest
from urllib.error import HTTPError, URLError
from research.provider_health_probe import check, ENDPOINTS

class Response(io.BytesIO):
    status = 200
    def __enter__(self): return self
    def __exit__(self, *args): self.close()

class ProviderHealthTests(unittest.TestCase):
    def test_all_urls_are_fixed_public_get(self):
        self.assertEqual(len(ENDPOINTS), 5)
        self.assertTrue(all(url.startswith("https://api.") for _, url in ENDPOINTS))
        self.assertTrue(all("cloudflare" not in url for _, url in ENDPOINTS))

    def test_success(self):
        def opener(req, timeout):
            self.assertEqual(req.get_method(), "GET")
            return Response(b'[]')
        self.assertEqual(check("TEST", "https://api.example.invalid", opener)["status"], "OK")

    def test_http_400_redacts_body(self):
        def opener(req, timeout):
            raise HTTPError(req.full_url, 400, "secret body", None, None)
        report = check("TEST", "https://api.example.invalid/?secret=do-not-log", opener)
        self.assertEqual(report["http_status"], 400)
        self.assertNotIn("secret", str(report))

    def test_unavailable(self):
        def opener(req, timeout):
            raise URLError("token leak")
        report = check("TEST", "https://api.example.invalid", opener)
        self.assertEqual(report["status"], "UNAVAILABLE")
        self.assertNotIn("token leak", str(report))

if __name__ == "__main__":
    unittest.main()
