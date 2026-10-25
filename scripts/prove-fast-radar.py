"""Activate/verify the real five-pool radar using existing scoped CI secrets.
No credentials are logged. Failure stops the radar and exits nonzero.
"""
import json, os, sys, time
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError

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
    try:
        with urlopen(Request(url, data=json.dumps({'sql':sql,'params':params or []}).encode(), headers=headers),timeout=30) as r:
            data=json.load(r)
    except HTTPError as exc:
        try:
            payload=json.loads(exc.read(8192))
            errors=[{'code':e.get('code'),'message':str(e.get('message',''))[:180]} for e in payload.get('errors',[])]
        except Exception: errors=[]
        raise RuntimeError('D1 HTTP '+str(exc.code)+' '+json.dumps(errors)) from None
    if not data.get('success') or not data.get('result') or not data['result'][0].get('success'):
        raise RuntimeError('D1 query failed')
    return data['result'][0]

if '--schema-only' in sys.argv:
    # One known SQL statement, not a generic semicolon splitter.
    sql='\n'.join(line for line in Path('sql/fast-radar.sql').read_text().splitlines() if not line.lstrip().startswith('--')).strip()
    query(sql)
    print('Additive radar_samples schema ready; existing tables untouched')
    sys.exit(0)

started=datetime.now(timezone.utc).isoformat().replace('+00:00','Z')
try:
    via_d1='--via-d1' in sys.argv
    if not via_d1:
        result=api('/api/fast-radar/start','POST')
        if result.get('enabled') is not True: raise RuntimeError('Fast radar activation failed')
    ticks={}; receipts={}; snapshots=[]
    for attempt in range(36):
        if via_d1:
            result=query('SELECT token FROM leases WHERE name=?',['fast-radar:trial-proof'])
            rows=result.get('results',[])
            snapshot=json.loads(rows[0]['token']) if rows else {}
            for item in snapshot.get('proof_ticks',[]):
                if item.get('tick'): ticks[item['tick']]=item
        else:
            snapshot=api('/api/fast-radar')
        if '--helius' in sys.argv and snapshot.get('mode')!='helius':
            ticks.clear()
            time.sleep(10);continue
        snapshots.append(snapshot)
        providers=snapshot.get('providers',{})
        if snapshot.get('mode')!='helius' and len(ticks)>=3 and not snapshot.get('quotes') and all(providers.get(p,{}).get('next_at',0)>int(time.time()*1000) for p in ['dex','gecko']):
            print(json.dumps({'proof':'FEED_BLOCKED','last_tick':snapshot.get('last_tick'),'providers':providers,'proof_ticks':snapshot.get('proof_ticks'),'sample_rows_written':snapshot.get('last_sample_rows_written')}))
            raise RuntimeError('Both quote providers are in verified cooldown; scheduler-only evidence')
        tick=snapshot.get('last_tick')
        targets={(t['chain'],t['pool'],t['asset_key']) for t in snapshot.get('targets',[])}
        if len(targets)>5: raise RuntimeError('Target budget exceeded')
        quotes=snapshot.get('quotes',[])
        for q in quotes:
            key=(q['chain'],q['pool'],q['asset_key'])
            if key not in targets or not (q.get('price_sol',q.get('price',0))>0) or (q.get('price_sol') is None and not q.get('liquidity',0)>0):
                raise RuntimeError('Quote identity/value check failed')
            if q.get('source_at') is not None or q.get('unique_buyers') is not None:
                raise RuntimeError('Unsupported freshness/buyer evidence')
            receipts.setdefault(key,set()).add(q['received_at'])
        if tick and tick not in ticks:
            ticks[tick]=snapshot
            print(json.dumps({'tick':tick,'targets':len(targets),'quotes':len(quotes),'updated_quotes':snapshot.get('updated_quotes'),'providers':snapshot.get('providers'),'history_paused':snapshot.get('history_paused'),'error':snapshot.get('error')}))
        if len(ticks)>=4 and len(receipts)==5 and all(len(v)>=3 for v in receipts.values()): break
        if attempt<35: time.sleep(10)
    if len(ticks)<3 or len(receipts)!=5 or not all(len(v)>=3 for v in receipts.values()):
        raise RuntimeError('Five-pool consecutive-quote proof not met')
    times=sorted(datetime.fromisoformat(t.replace('Z','+00:00')).timestamp() for t in ticks)
    gaps=[round(b-a,3) for a,b in zip(times,times[1:])]
    if any(gap<20 or gap>45 for gap in gaps): raise RuntimeError('Alarm cadence outside 20–45s proof window')
    rows=0; reads=0; providers=set()
    for chain,pool,key in receipts:
        result=query("SELECT minute,received_at,'Helius' AS provider,price_sol AS price FROM chain_radar_samples WHERE chain=? AND pool=? AND minute>=? ORDER BY minute LIMIT 5" if '--helius' in sys.argv else 'SELECT minute,received_at,provider,price FROM radar_samples WHERE chain=? AND pool=? AND minute>=? ORDER BY minute LIMIT 5', [chain,pool,started[:16]+':00.000Z'])
        found=result.get('results',[])
        if not found: raise RuntimeError('No persisted minute sample for a verified pool')
        if len({r['minute'] for r in found})!=len(found): raise RuntimeError('Duplicate minute samples')
        rows+=len(found);reads+=result.get('meta',{}).get('rows_read',0)
        providers.update(r['provider'] for r in found)
    final=snapshots[-1]
    print(json.dumps({'proof':'PASS','pools':5,'consecutive_ticks':len(ticks),'gap_seconds':gaps,'sample_rows':rows,'verification_rows_read':reads,'last_sample_rows_written':final.get('last_sample_rows_written'),'reserved_daily_writes':final.get('writes'),'providers':sorted(providers),'source_freshness':'UNKNOWN','execution_fills':'NOT_VERIFIED'}))
except Exception as exc:
    if '--via-d1' not in sys.argv:
        try: api('/api/fast-radar/stop','POST')
        except Exception: pass
    # Never print request objects, headers, environment or sensitive URL payloads.
    print('Fast radar proof FAILED; trial has a ten-minute automatic stop:',type(exc).__name__,str(exc)[:160])
    sys.exit(1)
