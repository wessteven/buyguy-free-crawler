"""Independent, strict, read-only evidence audit of vladwatch_ D1 ledger.

Requires CF_ACCOUNT_ID, CF_DATABASE_ID, CF_D1_API_TOKEN.
Does not update or create any tables, modify other projects, or trade.
"""
import json
import os
import sys
from datetime import datetime, timezone
from urllib.request import Request, urlopen

EXPECTED = {('rh-demo', 1), ('rh-demo', 42161), ('rh-demo', 4663), ('rh-demo', 8453), ('github-test', 4663)}


def d1_select(sql, params=None):
    account = os.environ.get('CF_ACCOUNT_ID', '')
    database = os.environ.get('CF_DATABASE_ID', '')
    token = os.environ.get('CF_D1_API_TOKEN', '')
    if not all((account, database, token)):
        raise RuntimeError('CLOUDFLARE_D1_AUTH_NOT_CONFIGURED')
    url = f'https://api.cloudflare.com/client/v4/accounts/{account}/d1/database/{database}/query'
    req = Request(url, data=json.dumps({'sql': sql, 'params': params or []}).encode(),
                  headers={'authorization': 'Bearer ' + token, 'content-type': 'application/json'}, method='POST')
    with urlopen(req, timeout=22) as rsp:
        payload = json.load(rsp)
    result = payload.get('result', [{}])[0]
    if not payload.get('success') or result.get('success') is not True:
        raise RuntimeError('D1_READ_FAILED ' + json.dumps(payload.get('errors', []))[:200])
    return result.get('results', [])


def main():
    now = datetime.now(timezone.utc)
    print('AUDIT_UTC', now.isoformat())
    runs = d1_select('SELECT id,started_at,completed_at,expected_pairs,checked_pairs,partial_pairs,failed_pairs,state,error FROM vladwatch_runs ORDER BY started_at DESC LIMIT 1')
    if not runs:
        raise RuntimeError('NO_COLLECTOR_RUN: deployment exists but cron completion unproven')
    run = runs[0]
    print('RUN', json.dumps(run, sort_keys=True))
    rows = d1_select('SELECT wallet_id,chain_id,observed_at,overall,native_status,tx_status,token_status,attempts_json,details_json FROM vladwatch_coverage WHERE run_id=? ORDER BY wallet_id,chain_id', [run['id']])
    seen = {(r['wallet_id'], int(r['chain_id'])) for r in rows}
    if seen != EXPECTED or len(rows) != len(EXPECTED):
        raise RuntimeError(f'COVERAGE_ROSTER_MISMATCH expected={sorted(EXPECTED)} observed={sorted(seen)} count={len(rows)}')
    details=[]
    for r in rows:
        item={k:r[k] for k in ('wallet_id','chain_id','observed_at','overall','native_status','tx_status','token_status')}
        item['attempts'] = json.loads(r.get('attempts_json') or '{}')
        item['history'] = json.loads(r.get('details_json') or '{}')
        print('SOURCE_LEDGER',json.dumps(item,sort_keys=True))
        details.append(item)
    if not run.get('completed_at'):
        raise RuntimeError('LAST_RUN_IN_PROGRESS')
    started = datetime.fromisoformat(run['started_at'].replace('Z', '+00:00'))
    age = (now-started).total_seconds()
    if age > 25 * 60 or age < -120:
        raise RuntimeError(f'RUN_STALE age_seconds={int(age)}')
    if run['expected_pairs'] != 5:
        raise RuntimeError('RUN_SCOPE_REDUCED')
    incomplete=[r for r in details if r['overall']!='checked']
    if incomplete:
        raise RuntimeError('INCOMPLETE_PROVIDER_COVERAGE count='+str(len(incomplete)))
    print('PASS_ALL_FIVE_PAIRS_CHECKED_WITH_SOURCE_EVIDENCE')


if __name__=='__main__':
    try: main()
    except Exception as exc:
        print('AUDIT_FAIL',str(exc),file=sys.stderr)
        sys.exit(1)