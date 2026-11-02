import unittest,sys,os
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'src'))
import engine

class ReadRecoveryTests(unittest.TestCase):
    def setUp(self):
        self.env=patch.dict(os.environ,CF_ACCOUNT_ID='account',CF_DATABASE_ID='database',CF_D1_API_TOKEN='test')
        self.env.start();self.addCleanup(self.env.stop)
    def test_transient_read_retries_once_and_preserves_result(self):
        result={'success':True,'result':[{'success':True,'results':[{'n':7}]}]}
        with patch('engine.get',side_effect=[TimeoutError(),result]) as get,patch('engine.time.sleep') as sleep:
            self.assertEqual(engine.rows('SELECT COUNT(*) n FROM assets'),[{'n':7}])
            self.assertEqual(get.call_count,2);sleep.assert_called_once_with(1)
    def test_uncertain_writes_are_never_replayed(self):
        with patch('engine.get',side_effect=TimeoutError()) as get,patch('engine.time.sleep') as sleep:
            with self.assertRaisesRegex(RuntimeError,'D1_WRITE_OUTCOME_UNVERIFIED'):
                engine.query('UPDATE assets SET observations=observations+1')
            self.assertEqual(get.call_count,1);sleep.assert_not_called()
    def test_exhausted_reads_and_rate_limits_remain_visible(self):
        with patch('engine.get',side_effect=TimeoutError()) as get,patch('engine.time.sleep'):
            with self.assertRaisesRegex(RuntimeError,'D1_READ_UNAVAILABLE'):engine.rows('SELECT * FROM assets')
            self.assertEqual(get.call_count,2)
        with patch('engine.get',side_effect=HTTPError('private',429,'limited',{},None)) as get:
            with self.assertRaises(HTTPError):engine.rows('SELECT * FROM assets')
            self.assertEqual(get.call_count,1)

if __name__=='__main__':unittest.main()
