"""Activate/verify the real five-pool radar using existing scoped CI secrets.
No credentials are logged. Failure stops the radar and exits nonzero.
"""
import json, os, sys, time
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen

BASE='https://buyguy-free-radar.wessteven.workers.dev'
def api(path, method='GET', authenticated=True):
    headers={'accept':'application/json'}
    if authenticated: headers['authorization']='Bearer '+os.environ['ADMIN_TOKEN']
    with urlopen(Request(BASE+path, headers=headers, method=method), timeout=25) as r:
        return json.load(r)

def query(sql, params=None):
    account=os.environ['CF_ACCOUNT_ID']; database=os.environ['CF_DATABASE_ID']
    url=f'https://api.cloudflare.com/client/v4/accounts/{account}/d1/database/{database}/query'
    headers={'authorization':'Bearer '+os.environ['CF_D1_API_TOKEN'],'content-type':'application/json'}
    with urlopen(Request(url, data=json.dumps({'sql':sql,'params':params or []}).encode(), headers=headers),timeout=30) as r:
        data=json.load(r)
    if not data.get('success') or not data.get('result') or not data['result'][0].get('success'):
        raise RuntimeError('D1 query failed')
    return data['result'][0]

if '--schema-only' in sys.argv:
    # One known SQL statement, not a generic semicolon splitter.
    sql=Path('sql/fast-radar.sql').read_text()
    query(sql)
    print('Additive radar_samples schema ready; existing tables untouched')
    sys.exit(0)

started=datetime.now(timezone.utc).isoformat().replace('+00:00','Z')
try:
    result=api('/api/fast-radar/start','POST')
    if result.get('enabled') is not True: raise RuntimeError('Fast radar activation failed')
    ticks={}; receipts={}; snapshots=[]
    for attempt in range(15):
        snapshot=api('/api/fast-radar'); snapshots.append(snapshot)
        tick=snapshot.get('last_tick')
        targets={(t['chain'],t['pool'],t['asset_key']) for t in snapshot.get('targets',[])}
        if len(targets)>5: raise RuntimeError('Target budget exceeded')
        quotes=snapshot.get('quotes',[])
        for q in quotes:
            key=(q['chain'],q['pool'],q['asset_key'])
            if key not in targets or not q['price']>0 or not q['liquidity']>0:
                raise RuntimeError('Quote identity/value check failed')
            if q.get('source_at') is not None or q.get('unique_buyers') is not None:
                raise RuntimeError('Unsupported freshness/buyer evidence')
            receipts.setdefault(key,set()).add(q['received_at'])
        if tick and tick not in ticks:
            ticks[tick]=snapshot
            print(json.dumps({'tick':tick,'targets':len(targets),'quotes':len(quotes),'updated_quotes':snapshot.get('updated_quotes'),'providers':snapshot.get('providers'),'history_paused':snapshot.get('history_paused'),'error':snapshot.get('error')}))
        if len(ticks)>=4 and len(receipts)==5 and all(len(v)>=3 for v in receipts.values()): break
        if attempt<14: time.sleep(10)
    if len(ticks)<3 or len(receipts)!=5 or not all(len(v)>=3 for v in receipts.values()):
        raise RuntimeError('Five-pool consecutive-quote proof not met')
    times=sorted(datetime.fromisoformat(t.replace('Z','+00:00')).timestamp() for t in ticks)
    gaps=[round(b-a,3) for a,b in zip(times,times[1:])]
    if any(gap<20 or gap>45 for gap in gaps): raise RuntimeError('Alarm cadence outside 20–45s proof window')
    rows=0; reads=0; providers=set()
    for chain,pool,key in receipts:
        result=query('SELECT minute,received_at,provider,price FROM radar_samples WHERE chain=? AND pool=? AND minute>=? ORDER BY minute LIMIT 5', [chain,pool,started[:16]+':00.000Z'])
        found=result.get('results',[])
        if not found: raise RuntimeError('No persisted minute sample for a verified pool')
        if len({r['minute'] for r in found})!=len(found): raise RuntimeError('Duplicate minute samples')
        rows+=len(found);reads+=result.get('meta',{}).get('rows_read',0)
        providers.update(r['provider'] for r in found)
    final=snapshots[-1]
    print(json.dumps({'proof':'PASS','pools':5,'consecutive_ticks':len(ticks),'gap_seconds':gaps,'sample_rows':rows,'verification_rows_read':reads,'last_sample_rows_written':final.get('last_sample_rows_written'),'reserved_daily_writes':final.get('writes'),'providers':sorted(providers),'source_freshness':'UNKNOWN','execution_fills':'NOT_VERIFIED'}))
except Exception as exc:
    try: api('/api/fast-radar/stop','POST')
    except Exception: pass
    # Never print request objects, headers, environment or sensitive URL payloads.
    print('Fast radar proof FAILED; stop requested:',type(exc).__name__,str(exc)[:160])
    sys.exit(1)
