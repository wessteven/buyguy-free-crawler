import unittest, sys
from unittest.mock import patch
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'src'))
from engine import quote_normalize, rank, valid, identity, gecko_new_pools, pool_timestamp
class ScannerTests(unittest.TestCase):
    def test_chain_identity(self):
        self.assertTrue(valid('robinhood','0x'+'a'*40))
        self.assertFalse(valid('robinhood','0x123'))
        self.assertFalse(valid('solana','0x'+'a'*40))
        self.assertEqual(identity('robinhood','0x'+'A'*40),'robinhood:0x'+'a'*40)
    def test_no_invalid_quotes(self):
        self.assertIsNone(quote_normalize({'chainId':'robinhood','pairAddress':'0x1','baseToken':{'address':'bad'}}))
    def test_pool_creation_age_is_preserved(self):
        self.assertEqual(pool_timestamp(1792368000000), '2026-10-19T00:00:00Z')
        self.assertEqual(pool_timestamp('2026-10-19T00:00:00Z'),'2026-10-19T00:00:00Z')
        self.assertIsNone(pool_timestamp('unknown'))
        self.assertIsNone(pool_timestamp(None))
    def test_rank_safety(self):
        q=dict(price=.001,liquidity=50000,cap=90000,buys=18,sells=2,change=10,volume=12000,created=None,pool='abc')
        self.assertLessEqual(rank(q),100)
        self.assertGreater(rank(q),50)
    def test_gecko_new_pool_identity_and_provenance(self):
        mint='So11111111111111111111111111111111111111112'
        payload={
          'included':[{'id':'solana_'+mint,'type':'token','attributes':{'address':mint,'symbol':'DEMO'}}],
          'data':[{'attributes':{'address':'TestPool','name':'DEMO / SOL','base_token_price_usd':'0.001',
             'reserve_in_usd':'65000','market_cap_usd':'80000','pool_created_at':'2026-10-18T12:00:00Z',
             'transactions':{'m5':{'buys':12,'sells':4}},'volume_usd':{'h24':'12500'},
             'price_change_percentage':{'h1':'8'}},
             'relationships':{'base_token':{'data':{'id':'solana_'+mint}}}}]}
        with patch('engine.get',return_value=payload):
            found=gecko_new_pools()
        self.assertEqual(len(found),1)
        self.assertEqual(found[0]['address'],mint)
        self.assertEqual(found[0]['source'],'GeckoTerminal')
        self.assertEqual(found[0]['buys'],12)
        self.assertEqual(found[0]['liquidity'],65000)
    def test_gecko_rejects_unidentified_mints(self):
        with patch('engine.get',return_value={'data':[{'attributes':{'address':'abcd','base_token_price_usd':'0.1','reserve_in_usd':'100000'}}]}):
            self.assertEqual(gecko_new_pools(),[])
    def test_avoid_unknown_chains(self):
        self.assertFalse(valid('base','0x'+'a'*40))
if __name__=='__main__': unittest.main()
