"""Offline-only SQLite reproduction of the crawler's schema initialization.

Never imports src.engine, accesses Cloudflare, or uses production data.
"""
import pathlib
import sqlite3
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
SCHEMA = ROOT.joinpath("sql/schema.sql").read_text(encoding="utf-8")

class InitializationSqlTests(unittest.TestCase):
    def test_all_split_statements_parse_on_fresh_sqlite(self):
        conn = sqlite3.connect(":memory:")
        statements = [s for s in SCHEMA.split(";") if s.strip()]
        self.assertGreater(len(statements), 10)
        for index, sql in enumerate(statements):
            with self.subTest(statement=index):
                conn.execute(sql)
        conn.execute("INSERT OR IGNORE INTO paper_account(account,starting_cash,cash,realised,updated_at) VALUES(?,?,?,?,?)",
                     ("buyguy-v3", 1000, 1000, 0, "2026-10-22T00:00:00Z"))
        conn.execute("INSERT OR IGNORE INTO leases(name,expires_at,token) VALUES(?,?,?)",
                     ("crawler", 0, ""))
        self.assertEqual(conn.execute("SELECT count(*) FROM paper_account").fetchone()[0], 1)
        self.assertEqual(conn.execute("SELECT count(*) FROM leases").fetchone()[0], 1)

    def test_schema_is_idempotent_on_sqlite(self):
        conn = sqlite3.connect(":memory:")
        for _ in range(2):
            for sql in SCHEMA.split(";"):
                if sql.strip():
                    conn.execute(sql)

    def test_statement_size_and_no_trigger_splitting(self):
        statements = [s for s in SCHEMA.split(";") if s.strip()]
        self.assertLess(max(len(s.encode("utf-8")) for s in statements), 100000)
        self.assertNotIn("CREATE TRIGGER", SCHEMA.upper())

if __name__ == "__main__":
    unittest.main()
