import pathlib,re,sqlite3,unittest

class CollectionHealthSQLTests(unittest.TestCase):
    def test_real_sqlite_uses_bounded_indexed_receipts_and_exact_raw_identity(self):
        root=pathlib.Path(__file__).resolve().parents[1]
        source=(root/'src/goget-collection-health.mjs').read_text()
        sql=re.search(r'COLLECTION_SAMPLE_SQL=`(.*?)`;',source,re.S).group(1)
        db=sqlite3.connect(':memory:')
        db.executescript((root/'sql/smart-wallet-webhook.sql').read_text())
        for i in range(450):
            db.execute('INSERT INTO smart_wallet_webhook_events(wallet,signature,observed_at,slot,block_time,fee_payer_observed,classification,delay_ms,evidence_json) VALUES(?,?,?,?,?,?,?,?,?)',
                       ('wallet',str(i),f'2026-11-02T01:{i//60:02}:{i%60:02}.000Z',i+1,'2026-11-02T00:00:00Z',1,'UNVERIFIED',0,'{}'))
        db.execute('INSERT INTO smart_wallet_webhook_raw VALUES(?,?,?,?,?)',('449',450,'2026-11-02T01:07:29.000Z',2,'{}'))
        rows=db.execute(sql,('2026-11-02T07:00:00.000Z',200)).fetchall()
        self.assertEqual(len(rows),200)
        self.assertEqual(rows[0],('449','2026-11-02T01:07:29.000Z',1))
        self.assertEqual(sum(r[2] for r in rows),1)
        plan=' '.join(str(x) for x in db.execute('EXPLAIN QUERY PLAN '+sql,('2026-11-02T07:00:00.000Z',200)))
        self.assertIn('smart_wallet_webhook_recent',plan)
        self.assertIn('sqlite_autoindex_smart_wallet_webhook_raw',plan)
        self.assertNotIn('USE TEMP B-TREE',plan)

if __name__=='__main__':unittest.main()
