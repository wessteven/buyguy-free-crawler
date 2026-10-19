"""BuyGuy Free research scanner (initial live-capable engine; paper wallet remains gated).
Runs in GitHub Actions using only the Python standard library.
Market quotes are indicative; not contract certification or executable trades.
"""
import os, sys, json, re, time, uuid, datetime as dt
from urllib.request import Request, urlopen
from urllib.parse import quote, urlsplit

UTC=dt.timezone.utc
BASE='https://api.dexscreener.com'
CF='https://api.cloudflare.com/client/v4/accounts/{}/d1/database/{}/query'
def now(): return dt.datetime.now(UTC).isoformat(timespec='seconds').replace('+00:00','Z')
def get(url,body=None,token=None):
    headers={'Accept':'application/json','User-Agent':'BuyGuyCrawler/3'}
    if body is not None: headers['Content-Type']='application/json'
    if token: headers['Authorization']='Bearer '+token
    request=Request(url,data=json.dumps(body).encode() if body is not None else None,headers=headers)
    with urlopen(request,timeout=25) as response: return json.load(response)
def num(v):
    try: return float(v or 0)
    except (TypeError,ValueError): return 0
def valid(chain,addr):
    if chain=='robinhood': return re.fullmatch(r'0x[0-9a-fA-F]{40}',addr or '') is not None
    if chain=='solana': return re.fullmatch(r'[1-9A-HJ-NP-Za-km-z]{32,44}',addr or '') is not None
    return False
def identity(chain,addr):
    return chain+':'+(addr.lower() if chain=='robinhood' else addr)
def query(sql,params=()):
    url=CF.format(os.environ['CF_ACCOUNT_ID'],os.environ['CF_DATABASE_ID'])
    data=get(url,{'sql':sql,'params':list(params)},os.environ['CF_D1_API_TOKEN'])
    if not data.get('success') or not data.get('result') or any(not r.get('success') for r in data['result']):
        raise RuntimeError('Cloudflare D1 query failed: '+str(data.get('errors') or data.get('result'))[:350])
    return data['result'][0]
def rows(sql,params=()): return query(sql,params).get('results',[])
def initialization():
    from pathlib import Path
    schema=Path('sql/schema.sql').read_text()
    for statement in schema.split(';'):
        if statement.strip(): query(statement)
    query('INSERT OR IGNORE INTO paper_account(account,starting_cash,cash,realised,updated_at) VALUES(?,?,?,?,?)',('buyguy-v3',1000,1000,0,now()))
    query('INSERT OR IGNORE INTO leases(name,expires_at,token) VALUES(?,?,?)',('crawler',0,''))
def social_links(*sources):
    """Unverified project-advertised metadata; only HTTPS URLs for exact token identity."""
    found=[]; seen=set()
    names={'twitter':'X','x':'X','telegram':'TG','tg':'TG','website':'Web',
           'web':'Web','discord':'Discord','github':'GitHub','youtube':'YouTube',
           'medium':'Medium','instagram':'Instagram','tiktok':'TikTok',
           'docs':'Docs','documentation':'Docs','whitepaper':'Paper','reddit':'Reddit'}
    def add(kind,url):
        if not isinstance(url,str) or len(url)>1200 or not url.lower().startswith('https://'):return
        if any(ord(ch)<32 or ord(ch)==127 for ch in url):return
        try:
            u=urlsplit(url.strip())
            if u.scheme.lower()!='https' or not u.hostname or u.username or u.password:return
            if u.hostname.lower()=='localhost' or u.hostname.lower().endswith('.local'):return
            label=names.get(str(kind or 'website').lower().replace(' ','').replace('-',''),'Web')
            key=url.rstrip('/').lower()
            if key not in seen:
                seen.add(key); found.append({'label':label,'url':url})
        except ValueError:pass
    for data in sources:
        if not isinstance(data,dict):continue
        for field in ('websites','socials','links'):
            value=data.get(field) or []
            if not isinstance(value,list):continue
            for item in value:
                if isinstance(item,str):add('website',item)
                elif isinstance(item,dict):add(item.get('type') or item.get('label') or 'website',item.get('url'))
        for field,kind in [('website_url','website'),('discord_url','discord')]:
            add(kind,data.get(field))
        for field,kind,domain in [('twitter_handle','twitter','x.com'),('telegram_handle','telegram','t.me')]:
            handle=data.get(field)
            if isinstance(handle,str):
                if re.fullmatch(r'@?[A-Za-z0-9_]{3,32}',handle):
                    add(kind,'https://'+domain+'/'+handle.lstrip('@'))
                elif handle.startswith('https://'):add(kind,handle)
    priority={'X':0,'TG':1,'Web':2,'Discord':3,'GitHub':4}
    return sorted(found,key=lambda r:priority.get(r['label'],20))[:24]

def quote_normalize(x):
    chain=x.get('chainId'); address=(x.get('baseToken') or {}).get('address','')
    if not valid(chain,address) or not x.get('pairAddress'): return None
    price=num(x.get('priceUsd')); liq=num((x.get('liquidity') or {}).get('usd'))
    if price<=0 or liq<=0:return None
    tx=(x.get('txns') or {}).get('m5') or {}
    return {'chain':chain,'address':address,'symbol':(x.get('baseToken') or {}).get('symbol','?'),
      'pool':x['pairAddress'],'price':price,'liquidity':liq,
      'cap':num(x.get('marketCap') or x.get('fdv')),'buys':int(num(tx.get('buys'))),
      'sells':int(num(tx.get('sells'))),'change':num((x.get('priceChange') or {}).get('h1')),
      'volume':num((x.get('volume') or {}).get('h24')),'created':x.get('pairCreatedAt'),'source':'DEX Screener',
      'socials':social_links(x.get('info'))}
def gecko_new_pools():
    """Secondary independent new-pool discovery. Never converts h1 tx to m5 figures."""
    payload=get('https://api.geckoterminal.com/api/v2/networks/solana/new_pools?include=base_token&page=1')
    token_index={item.get('id'):(item.get('attributes') or {}) for item in payload.get('included',[]) if item.get('type')=='token'}
    found=[]
    for pool in payload.get('data',[])[:40]:
        attrs=pool.get('attributes') or {}
        relation=((pool.get('relationships') or {}).get('base_token') or {}).get('data') or {}
        key=relation.get('id') or ''
        meta=token_index.get(key) or {}
        address=meta.get('address') or (key[7:] if key.startswith('solana_') else '')
        pair=attrs.get('address') or ''
        price=num(attrs.get('base_token_price_usd'))
        liquidity=num(attrs.get('reserve_in_usd'))
        if not valid('solana',address) or not pair or price<=0 or liquidity<=0:continue
        tx=(attrs.get('transactions') or {}).get('m5') or {}
        found.append({
            'chain':'solana','address':address,
            'symbol':meta.get('symbol') or (attrs.get('name','?').split('/')[0].strip()),
            'pool':pair,'price':price,'liquidity':liquidity,
            'cap':num(attrs.get('market_cap_usd') or attrs.get('fdv_usd')),
            'buys':int(num(tx.get('buys'))),'sells':int(num(tx.get('sells'))),
            'change':num((attrs.get('price_change_percentage') or {}).get('h1')),
            'volume':num((attrs.get('volume_usd') or {}).get('h24')),
            'created':attrs.get('pool_created_at'),'source':'GeckoTerminal',
            'socials':social_links(meta,attrs)
        })
    return found

def pool_timestamp(value):
    """Normalise pool creation time without inventing a timestamp."""
    if value is None: return None
    try:
        if isinstance(value,(int,float)):
            raw=float(value)
            return dt.datetime.fromtimestamp(raw/1000 if raw>1e11 else raw,UTC).isoformat(timespec='seconds').replace('+00:00','Z')
        if isinstance(value,str):
            date=dt.datetime.fromisoformat(value.replace('Z','+00:00'))
            if date.tzinfo is None:return None
            return date.astimezone(UTC).isoformat(timespec='seconds').replace('+00:00','Z')
    except (ValueError,OverflowError,TypeError):
        return None
    return None
def discover():
    addresses={'solana':set(),'robinhood':set()}
    failures=[]
    advertised={}
    for endpoint in ('/token-boosts/latest/v1','/token-profiles/latest/v1','/token-boosts/top/v1','/community-takeovers/latest/v1'):
        try:
            for item in get(BASE+endpoint)[:80]:
                chain=item.get('chainId'); addr=item.get('tokenAddress','')
                if valid(chain,addr):
                    addresses[chain].add(addr)
                    links=social_links(item)
                    if links:advertised[identity(chain,addr)]=links
        except Exception as exc: failures.append(endpoint+': '+str(exc)[:100])
    tracked=rows("SELECT chain,address FROM assets WHERE status IN ('ALIVE','STATIC') OR pinned=1 ORDER BY score DESC LIMIT 70")
    positions=rows("SELECT a.chain,a.address FROM assets a JOIN paper_positions p ON a.asset_key=p.asset_key WHERE p.status='OPEN'")
    for item in tracked+positions:
        if valid(item['chain'],item['address']):addresses[item['chain']].add(item['address'])
    bykey={}
    try:
        for item in gecko_new_pools():
            bykey[identity(item['chain'],item['address'])]=item
    except Exception as exc:
        failures.append('GeckoTerminal new pools: '+str(exc)[:130])
    for chain,values in addresses.items():
        candidates=list(values)[:65]
        for i in range(0,len(candidates),25):
            path='/tokens/v1/'+chain+'/'+','.join(quote(a,safe='') for a in candidates[i:i+25])
            try:
                for pair in get(BASE+path):
                    token=quote_normalize(pair)
                    if token is None: continue
                    k=identity(token['chain'],token['address'])
                    if k not in bykey or bykey[k]['liquidity']<token['liquidity']:bykey[k]=token
            except Exception as exc:failures.append(chain+': '+str(exc)[:120])
    for k,q in bykey.items():
        combined=q.get('socials') or []
        seen={item['url'].lower().rstrip('/') for item in combined}
        for item in advertised.get(k,[]):
            if item['url'].lower().rstrip('/') not in seen:
                combined.append(item);seen.add(item['url'].lower().rstrip('/'))
        q['socials']=combined[:24]
    return list(bykey.values()),failures
def rank(q,old=None):
    tx=q['buys']+q['sells']
    points=(24 if q['liquidity']>=50000 else 0)
    points+=17 if 50000<=q['cap']<=100000 else (9 if q['cap']<=250000 and q['cap']>100000 else 0)
    age=None
    if q.get('created'):
        try:
            stamp=q['created']/1000 if isinstance(q['created'],(float,int)) and q['created']>1e11 else q['created']
            created=dt.datetime.fromtimestamp(stamp,UTC) if isinstance(stamp,(float,int)) else dt.datetime.fromisoformat(str(stamp).replace('Z','+00:00'))
            age=(dt.datetime.now(UTC)-created).total_seconds()/3600
        except Exception: pass
    if age is not None and 0<=age<=24:points+=18
    if tx>=12:points+=10
    if tx>=35:points+=5
    if q['buys']>=8 and q['buys']>=1.25*max(1,q['sells']):points+=13
    if q['volume']>=10000:points+=5
    if 4<=q['change']<=70:points+=5
    if old and old.get('pool')==q['pool'] and num(old.get('tx_m5'))>0 and tx>num(old.get('tx_m5'))*1.15:points+=8
    if q['sells']>q['buys']:points-=15
    if q['change']>200:points-=20
    return max(0,min(100,points))
def execute():
    initialization()
    start=now(); lease=str(uuid.uuid4()); epoch=int(time.time())
    acquired=query('UPDATE leases SET expires_at=?,token=? WHERE name=? AND expires_at<?',(epoch+480,lease,'crawler',epoch))
    if acquired.get('meta',{}).get('changes',0)!=1: print('Previous run still holds lock'); return
    run=query("INSERT INTO runs(started_at,state) VALUES(?,?)",(start,'RUNNING')).get('meta',{}).get('last_row_id')
    try:
        discovered,errors=discover()
        if not discovered:
            raise RuntimeError('No usable market quotes; preserving portfolio and states')
        observed=0
        for q in sorted(discovered,key=lambda x:(rank(x),x['liquidity']),reverse=True)[:30]:
            k=identity(q['chain'],q['address']); old_list=rows('SELECT * FROM assets WHERE asset_key=?',(k,))
            old=old_list[0] if old_list else None
            if old and old['status']=='TRASH':continue
            s=rank(q,old); status='ALIVE' if s>=62 and q['liquidity']>=50000 else 'STATIC'
            query("""INSERT OR IGNORE INTO assets(asset_key,chain,address,first_seen,updated_at,status)
                 VALUES(?,?,?,?,?,?)""",(k,q['chain'],q['address'],start,start,'STATIC'))
            streak=int(num(old.get('momentum_streak'))) + 1 if old and old.get('pool')==q['pool'] and s>=72 else (1 if s>=72 else 0)
            query("""UPDATE assets SET symbol=?,pool=?,provider=?,
                status=?,last_seen=?,updated_at=?,pool_created=COALESCE(pool_created,?),observations=observations+1,misses=0,
                score=?,momentum_streak=?,price=?,liquidity=?,market_cap=?,
                buys_m5=?,sells_m5=?,tx_m5=?,change_h1=?,volume_h24=?,
                last_action=? WHERE asset_key=?""",
                (q['symbol'],q['pool'],q.get('source','UNKNOWN'),status,start,start,pool_timestamp(q.get('created')),s,streak,q['price'],q['liquidity'],q['cap'],q['buys'],q['sells'],q['buys']+q['sells'],q['change'],q['volume'],'WATCH_ONLY — contract and execution risks unverified',k))
            query("""INSERT OR IGNORE INTO observations(asset_key,seen_at,pool,provider,price,liquidity,buys_m5,sells_m5,score)
                 VALUES(?,?,?,?,?,?,?,?,?)""",(k,start,q['pool'],q.get('source','UNKNOWN'),q['price'],q['liquidity'],q['buys'],q['sells'],s))
            if q.get('socials'):
                links=json.dumps(q['socials'],separators=(',',':'),ensure_ascii=False)
                query("""INSERT INTO research_events(at,asset_key,kind,note)
                    SELECT ?,?,'TOKEN_SOCIALS',?
                    WHERE COALESCE((SELECT note FROM research_events
                      WHERE asset_key=? AND kind='TOKEN_SOCIALS'
                      ORDER BY id DESC LIMIT 1),'') != ?""",(start,k,links,k,links))
            if s>=55:
                prev=rows('SELECT created_at FROM predictions WHERE asset_key=? ORDER BY created_at DESC LIMIT 1',(k,))
                if not prev or (dt.datetime.now(UTC)-dt.datetime.fromisoformat(prev[0]['created_at'].replace('Z','+00:00'))).total_seconds()>3600:
                    for minutes in [60,180,360,720,1440]:
                        due=(dt.datetime.now(UTC)+dt.timedelta(minutes=minutes)).isoformat(timespec='seconds').replace('+00:00','Z')
                        query('INSERT OR IGNORE INTO predictions(asset_key,created_at,due_at,horizon_min,start_price,score) VALUES(?,?,?,?,?,?)',(k,start,due,minutes,q['price'],s))
            observed+=1
        pending=rows("SELECT * FROM predictions WHERE status='PENDING' AND due_at<=? LIMIT 60",(start,))
        for p in pending:
            observations=rows('SELECT price,seen_at FROM observations WHERE asset_key=? AND seen_at>=? ORDER BY seen_at LIMIT 1',(p['asset_key'],p['due_at']))
            if observations:
                o=observations[0]
                delta=(dt.datetime.fromisoformat(o['seen_at'].replace('Z','+00:00'))-dt.datetime.fromisoformat(p['due_at'].replace('Z','+00:00'))).total_seconds()/60
                if delta<=40:
                    query("UPDATE predictions SET status='EVALUATED',observed_price=?,observed_at=?,change_pct=? WHERE id=?",(o['price'],o['seen_at'],(o['price']/p['start_price']-1)*100,p['id']))
                    continue
            if (dt.datetime.now(UTC)-dt.datetime.fromisoformat(p['due_at'].replace('Z','+00:00'))).total_seconds()>2400:
                query("UPDATE predictions SET status='MISSED_DATA' WHERE id=?",(p['id'],))
        query('UPDATE runs SET completed_at=?,state=?,discovered=?,observed=?,provider_errors=? WHERE id=?',(now(),'PARTIAL' if errors else 'SUCCESS',len(discovered),observed,json.dumps(errors),run))
        print(json.dumps({'observed':observed,'errors':errors[:4],'paper_trades':'DISABLED_PENDING_VERIFICATION'}))
    except Exception as exc:
        query('UPDATE runs SET completed_at=?,state=?,provider_errors=? WHERE id=?',(now(),'ERROR',json.dumps([str(exc)[:300]]),run))
        raise
    finally: query('UPDATE leases SET expires_at=0 WHERE name=? AND token=?',('crawler',lease))
if __name__=='__main__':
    try:
        if '--init' in sys.argv: initialization();print('Schema and paper account initialized')
        else:execute()
    except Exception as exc:
        print('BuyGuy crawler error: '+str(exc),file=sys.stderr);sys.exit(1)
