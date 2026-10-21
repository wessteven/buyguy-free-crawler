"""Offline regression reproducing production schema splitting defect.

No Cloudflare access, production imports, or writes.
"""
import pathlib
import sqlite3
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
SCHEMA = ROOT.joinpath("sql/schema.sql").read_text(encoding="utf-8")

class InitializationSqlTests(unittest.TestCase):
    def test_production_splitter_reproduces_invalid_sql(self):
        conn = sqlite3.connect(":memory:")
        statements = [s for s in SCHEMA.split(";") if s.strip()]
        errors = []
        for index, sql in enumerate(statements):
            try:
                conn.execute(sql)
            except sqlite3.OperationalError as exc:
                errors.append((index, str(exc)))
                break
        self.assertEqual(len(errors), 1)
        self.assertEqual(errors[0][0], 21)
        self.assertIn('near "apply": syntax error', errors[0][1])

    def test_comment_aware_sqlite_executes_full_schema_twice(self):
        conn = sqlite3.connect(":memory:")
        conn.executescript(SCHEMA)
        conn.executescript(SCHEMA)
        conn.execute("INSERT OR IGNORE INTO paper_account(account,starting_cash,cash,realised,updated_at) VALUES(?,?,?,?,?)",
                     ("buyguy-v3", 1000, 1000, 0, "2026-10-22T00:00:00Z"))
        conn.execute("INSERT OR IGNORE INTO leases(name,expires_at,token) VALUES(?,?,?)", ("crawler", 0, ""))
        self.assertEqual(conn.execute("SELECT count(*) FROM paper_account").fetchone()[0], 1)

    def test_comment_contains_semicolon_that_breaks_naive_split(self):
        self.assertIn("Idempotent; apply", SCHEMA)
        self.assertLess(max(len(s.encode("utf-8")) for s in SCHEMA.split(";")), 100000)

if __name__ == "__main__":
    unittest.main()
