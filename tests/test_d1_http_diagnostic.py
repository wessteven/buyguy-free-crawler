import io,json,sys,unittest
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'src'))
import engine

class D1DiagnosticTests(unittest.TestCase):
    def error(self,body,status=400):
        return HTTPError('https://private/?key=SECRET',status,'SECRET',{},io.BytesIO(body))
    def test_storage_report_is_safe_and_not_inferred_from_http400(self):
        e=self.error(json.dumps({'errors':[{'code':7500,'message':'maximum database size exceeded SECRET'}]}).encode())
        d=engine.d1_http_diagnostic(e,{'sql':'INSERT SECRET','params':['PRIVATE']})
        self.assertEqual(d['diagnostic'],'D1_PROVIDER_REPORTED_STORAGE_LIMIT')
        self.assertEqual(d['provider_codes'],[7500]);self.assertFalse(d['root_cause_confirmed'])
        self.assertNotIn('SECRET',json.dumps(d));self.assertNotIn('PRIVATE',json.dumps(d))
        other=engine.d1_http_diagnostic(self.error(b'{"errors":[{"message":"syntax error SECRET"}]}'),{'sql':'SELECT 1'})
        self.assertEqual(other['operation'],'READ');self.assertEqual(other['diagnostic'],'D1_HTTP_ERROR_UNCLASSIFIED')
    def test_capped_malformed_or_nonstandard_errors_remain_unknown(self):
        for payload in [b'not json',b'[]',b'{"errors":"SECRET"}',b'{"errors":[null,{"code":"SECRET"}]}']:
            d=engine.d1_http_diagnostic(self.error(payload),{})
            self.assertEqual(d['diagnostic'],'D1_HTTP_ERROR_UNCLASSIFIED');self.assertEqual(d['provider_codes'],[])
        d=engine.d1_http_diagnostic(self.error(b'x'*5000),{})
        self.assertEqual(d['diagnostic'],'D1_ERROR_BODY_CAPPED')
    def test_live_http_error_is_rethrown_without_retry_or_sensitive_log(self):
        err=self.error(b'{"errors":[{"code":7500,"message":"SQLITE_FULL SECRET"}]}')
        with patch('engine.urlopen',side_effect=err) as opener,patch('sys.stderr',new_callable=io.StringIO) as stderr:
            with self.assertRaises(HTTPError):engine.get('https://api.cloudflare.com/client/v4/accounts/PRIVATE/d1/database/PRIVATE/query',{'sql':'UPDATE SECRET'},'SECRET')
            self.assertEqual(opener.call_count,1);self.assertIn('GOGET_D1_HTTP_DIAGNOSTIC',stderr.getvalue())
            self.assertNotIn('SECRET',stderr.getvalue());self.assertNotIn('PRIVATE',stderr.getvalue())
