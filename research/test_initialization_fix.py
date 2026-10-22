"""Isolated initialization regression tests; never imports or executes the crawler."""
import ast
import pathlib
import sqlite3
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
SOURCE = ROOT.joinpath("src/engine.py").read_text(encoding="utf-8")
SCHEMA = ROOT.joinpath("sql/schema.sql").read_text(encoding="utf-8")

def statements():
    node = next(n for n in ast.parse(SOURCE).body if isinstance(n, ast.FunctionDef) and n.name == "initialization")
    ns = {"query": lambda *args: None, "now": lambda: "2026-10-22T00:00:00Z"}
    exec(compile(ast.Module(body=[node], type_ignores=[]), "<isolated-initialization>", "exec"), ns)
    return ns["initialization"]

class InitializationFixTests(unittest.TestCase):
    def test_initialization_executes_sql_without_malformed_fragments(self):
        seen = []
        conn = sqlite3.connect(":memory:")
        def capture(sql, params=()):
            seen.append(sql)
            conn.execute(sql, params)
        node = next(n for n in ast.parse(SOURCE).body if isinstance(n, ast.FunctionDef) and n.name == "initialization")
        ns = {"query": capture, "now": lambda: "2026-10-22T00:00:00Z"}
        exec(compile(ast.Module(body=[node], type_ignores=[]), "<isolated-initialization>", "exec"), ns)
        original = pathlib.Path.cwd()
        try:
            import os
            os.chdir(ROOT)
            ns["initialization"]()
            ns["initialization"]()
        finally:
            os.chdir(original)
        self.assertGreater(len(seen), 20)
        self.assertTrue(all(sqlite3.complete_statement(sql) for sql in seen if 'CREATE TABLE' in sql or 'CREATE INDEX' in sql))
        self.assertEqual(conn.execute("SELECT count(*) FROM paper_account").fetchone()[0], 1)
        self.assertEqual(conn.execute("SELECT count(*) FROM leases").fetchone()[0], 1)

    def test_complete_statement_handles_semicolons_inside_strings_and_comments(self):
        cases = [
            "-- comment with ; punctuation\nCREATE TABLE demo (v TEXT);",
            "INSERT INTO demo(v) VALUES ('a;b');",
            "/* block ; comment */ INSERT INTO demo(v) VALUES ('c;d');",
        ]
        conn = sqlite3.connect(":memory:")
        for sql in cases:
            self.assertTrue(sqlite3.complete_statement(sql))
            conn.execute(sql)
        self.assertEqual([row[0] for row in conn.execute("SELECT v FROM demo ORDER BY rowid")], ["a;b", "c;d"])

    def test_draft_changes_are_limited_to_initialization_logic(self):
        node = next(n for n in ast.parse(SOURCE).body if isinstance(n, ast.FunctionDef) and n.name == "initialization")
        self.assertIn("sqlite3.complete_statement", ast.get_source_segment(SOURCE, node))
        self.assertNotIn("executescript", ast.get_source_segment(SOURCE, node))

    def test_comment_semicolon_does_not_create_apply_fragment(self):
        self.assertIn("Idempotent; apply", SCHEMA)
        self.assertNotIn("schema.split(';')", SOURCE)
        self.assertIn("sqlite3.complete_statement", SOURCE)

if __name__ == "__main__":
    unittest.main()
