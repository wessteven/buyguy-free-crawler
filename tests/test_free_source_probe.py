"""Offline regression checks for the optional, manually run crypto source probe."""
from pathlib import Path
import shutil
import subprocess
import unittest


class FreeCryptoSourceProbeTests(unittest.TestCase):
    @unittest.skipUnless(shutil.which("node"), "Node.js unavailable")
    def test_node_offline_probe_suite(self):
        root = Path(__file__).resolve().parents[1]
        result = subprocess.run(
            ["node", "--test", "research/free-source-probe.test.mjs"],
            cwd=root,
            capture_output=True,
            text=True,
            timeout=35,
            check=False,
        )
        self.assertEqual(
            result.returncode, 0,
            "Research probe tests failed:\n" + result.stdout + "\n" + result.stderr,
        )


if __name__ == "__main__":
    unittest.main()
