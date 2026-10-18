import unittest, sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'src'))
from engine import quote_normalize, rank, valid, identity
class ScannerTests(unittest.TestCase):
    def test_chain_identity(self):
        self.assertTrue(valid('robinhood','0x'+'a'*40))
        self.assertFalse(valid('robinhood','0x123'))
        self.assertFalse(valid('solana','0x'+'a'*40))
        self.assertEqual(identity('robinhood','0x'+'A'*40),'robinhood:0x'+'a'*40)
    def test_no_invalid_quotes(self):
        self.assertIsNone(quote_normalize({'chainId':'robinhood','pairAddress':'0x1','baseToken':{'address':'bad'}}))
    def test_rank_safety(self):
        q=dict(price=.001,liquidity=50000,cap=90000,buys=18,sells=2,change=10,volume=12000,created=None,pool='abc')
        self.assertLessEqual(rank(q),100)
        self.assertGreater(rank(q),50)
    def test_avoid_unknown_chains(self):
        self.assertFalse(valid('base','0x'+'a'*40))
if __name__=='__main__': unittest.main()
