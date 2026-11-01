"""Guard the exact D1 webhook schema deployer's comment-handling behavior."""
import sqlite3
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class WebhookSchemaDeploymentTests(unittest.TestCase):
    def test_deployment_never_reactivates_above_existing_helius_guard(self):
        workflow = (ROOT / '.github/workflows/deploy-smart-wallet-webhook.yml').read_text()
        budget = (ROOT / 'src/smart-wallet-budget.mjs').read_text()
        self.assertIn('maxRecentHourEvents:350', budget)
        self.assertIn('maxUtcDayAttemptedReservations:2200', budget)
        self.assertIn("import {assessWebhookBudget}", workflow)
        self.assertIn('id: provider_budget', workflow)
        self.assertIn("if: steps.provider_budget.outputs.safe == 'false'", workflow)
        self.assertEqual(workflow.count("if: steps.provider_budget.outputs.safe == 'true'"), 2)
        self.assertLess(workflow.index('id: provider_budget'), workflow.index('run: node scripts/provision-smart-wallet-webhook.mjs sync'))
        self.assertIn('run: node scripts/provision-smart-wallet-webhook.mjs guard', workflow)
        self.assertIn('GOGET_LIVE_WORKER_REVISION_VERIFIED', workflow)

    def test_schema_parser_ignores_semicolons_in_sql_comments(self):
        workflow = (ROOT / ".github/workflows/deploy-smart-wallet-webhook.yml").read_text()
        self.assertIn("if not line.lstrip().startswith('--')", workflow)
        text = (ROOT / "sql/smart-wallet-webhook.sql").read_text()
        sql = "\n".join(line for line in text.splitlines()
                        if not line.lstrip().startswith("--"))
        statements = [s.strip() for s in sql.split(";") if s.strip()]
        self.assertGreaterEqual(len(statements), 7)

        db = sqlite3.connect(":memory:")
        for statement in statements:
            db.execute(statement)
        db.execute(
            "INSERT OR IGNORE INTO smart_wallet_webhook_raw_health(day,last_at) VALUES(?,?)",
            ("2026-11-01", "2026-11-01T03:00:00Z"))
        db.execute(
            "UPDATE smart_wallet_webhook_raw_health SET "
            "degraded_requests=degraded_requests+1,"
            "attempted_records=attempted_records+?,"
            "recovered_records=recovered_records+?,"
            "still_failed_records=still_failed_records+?,"
            "failed_batches=failed_batches+?,"
            "last_error_code=? WHERE day=?",
            (6, 5, 1, 1, "SIZE_LIMIT", "2026-11-01"))
        row = db.execute(
            "SELECT degraded_requests,attempted_records,recovered_records,"
            "still_failed_records,failed_batches,last_error_code "
            "FROM smart_wallet_webhook_raw_health").fetchone()
        self.assertEqual(row, (1, 6, 5, 1, 1, "SIZE_LIMIT"))


if __name__ == "__main__":
    unittest.main()
