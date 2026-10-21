"""Offline tests for the fixed-token public quote probe."""
import io
import unittest
from urllib.error import HTTPError
from research.token_quote_probe import MINTS, check

class Response(io.BytesIO):
    status = 200
    def __enter__(self): return self
    def __exit__(self, *args): self.close()

class TokenQuoteTests(unittest.TestCase):
    def test_mints_are_fixed(self):
        self.assertEqual(len(MINTS), 2)
        self.assertTrue(all(len(mint) >= 32 for _, mint in MINTS))
    def test_get_and_json(self):
        def opener(req, timeout):
            self.assertEqual(req.get_method(), "GET")
            self.assertEqual(timeout, 12)
            return Response(b'{"pairs":[]}')
        self.assertTrue(check("TEST", MINTS[0][1], opener)["pairs_present"])
    def test_http_400_never_leaks_body(self):
        def opener(req, timeout):
            raise HTTPError(req.full_url, 400, "PRIVATE_DATA", None, None)
        report = check("TEST", MINTS[0][1], opener)
        self.assertEqual(report["http_status"], 400)
        self.assertNotIn("PRIVATE_DATA", str(report))

if __name__ == "__main__":
    unittest.main()
