"""Guard the exact D1 webhook schema deployer's comment-handling behavior."""
import sqlite3
import json
import re
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
        self.assertIn("cron: '*/15 * * * *'", workflow)
        self.assertIn('PERSISTENT_SUSPENSION_OR_UNKNOWN', workflow)
        self.assertIn("latch[0].state==='ARMED'", workflow)
        self.assertIn('GOGET_WEBHOOK_SUSPENSION_LATCHED', (ROOT / 'scripts/provision-smart-wallet-webhook.mjs').read_text())

    def test_bounded_restart_preserves_roster_and_excludes_high_volume_wallets(self):
        roster = json.loads((ROOT / 'research/smart-wallet-webhook-cohort.json').read_text())
        addresses = [w['wallet'] for w in roster]
        selected = [w['wallet'] for w in roster if w['webhookEnabled'] is True]
        self.assertEqual(len(roster), 14)
        self.assertEqual(len(addresses), len(set(addresses)))
        self.assertEqual(len(selected), 12)
        self.assertEqual(set(addresses) - set(selected), {
            'kiwiC4pg5mC4N5AhpXc4Av3V6oV7Sn2p3CqB7NeHbJJ',
            '3wySUKHiD15kUD7sunNe1FQpogv2FK7Tw7TzSJyC9Ft8'
        })
        config = (ROOT / 'wrangler.smart-wallet.toml').read_text()
        match = re.search(r'WALLET_WATCHED_ADDRESSES\s*=\s*"([^"]+)"', config)
        self.assertIsNotNone(match)
        self.assertEqual(set(match.group(1).split(',')), set(selected))
        control = (ROOT / 'scripts/provision-smart-wallet-webhook.mjs').read_text()
        self.assertIn('webhookEnabled===true', control)
        self.assertIn("GOGET_SUSPENSION_PERSISTENCE_UNVERIFIED", control)

    def test_suspension_latch_survives_quota_rollover_and_redeploy(self):
        source = (ROOT / 'sql/smart-wallet-webhook.sql').read_text()
        sql = '\n'.join(x for x in source.splitlines() if not x.lstrip().startswith('--'))
        db = sqlite3.connect(':memory:')
        db.executescript(sql)
        self.assertEqual(db.execute(
            "SELECT state FROM smart_wallet_webhook_control WHERE id='owned'").fetchone(),
            ('ARMED',))
        db.execute("UPDATE smart_wallet_webhook_control SET state='SUSPENDED' WHERE id='owned'")
        db.executescript(sql)
        self.assertEqual(db.execute(
            "SELECT state FROM smart_wallet_webhook_control WHERE id='owned'").fetchone(),
            ('SUSPENDED',))

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
