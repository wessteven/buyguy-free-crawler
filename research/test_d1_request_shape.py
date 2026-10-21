"""Offline request-shape inspection of production source; never imports or executes it."""
import ast
import pathlib
import unittest

SOURCE = pathlib.Path(__file__).resolve().parents[1] / "src" / "engine.py"

class D1RequestShapeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = SOURCE.read_text(encoding="utf-8")
        cls.tree = ast.parse(cls.source)
        cls.functions = {n.name: n for n in cls.tree.body if isinstance(n, ast.FunctionDef)}

    def test_d1_url_template(self):
        assignments = [n for n in cls.tree.body if isinstance(n, ast.Assign)
                       and any(isinstance(t, ast.Name) and t.id == "CF" for t in n.targets)]
        self.assertEqual(len(assignments), 1)
        self.assertEqual(ast.literal_eval(assignments[0].value),
                         "https://api.cloudflare.com/client/v4/accounts/{}/d1/database/{}/query")

    def test_d1_request_body_contains_sql_and_params(self):
        node = self.functions["query"]
        literals = [n for n in ast.walk(node) if isinstance(n, ast.Dict)]
        self.assertTrue(any({ast.literal_eval(k) for k in d.keys if isinstance(k, ast.Constant)}
                            >= {"sql", "params"} for d in literals))

    def test_http_helper_uses_post_for_json_body(self):
        node = self.functions["get"]
        request_calls = [n for n in ast.walk(node) if isinstance(n, ast.Call)
                         and isinstance(n.func, ast.Name) and n.func.id == "Request"]
        self.assertEqual(len(request_calls), 1)
        self.assertTrue(any(k.arg == "data" for k in request_calls[0].keywords))
        self.assertIn("Content-Type", ast.get_source_segment(self.source, node))

    def test_initialization_precedes_discovery(self):
        node = self.functions["execute"]
        calls = [n.func.id for n in ast.walk(node) if isinstance(n, ast.Call)
                 and isinstance(n.func, ast.Name)]
        self.assertIn("initialization", calls)
        self.assertIn("discover", calls)
        self.assertLess(self.source.index("    initialization()", self.source.index("def execute():")),
                        self.source.index("        discovered,errors=discover()", self.source.index("def execute():")))

if __name__ == "__main__":
    unittest.main()
