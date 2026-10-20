import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {retireDormantAssets} from '../src/retirement.mjs';
test('real SQLite cleanup archives only repeated weak signals; protects lessons, pins, paper and predictions',async()=>{
 const statements=[];
 const db={prepare(sql){return {bind(...args){return {sql,args}}}},
   batch:async items=>{statements.push(...items);return items.map(()=>({meta:{changes:1}}))}};
 const now='2026-10-20T04:00:00Z';
 const result=await retireDormantAssets(db,Date.parse(now));
 assert.equal(result.deleted,0);
 assert.equal(statements.length,5);
 for(const stmt of statements)assert.doesNotMatch(stmt.sql,/\bDELETE\s+FROM\b/i);
 const py="import sqlite3,json,sys,datetime\ndata=json.load(sys.stdin)\ndb=sqlite3.connect(':memory:')\ndb.executescript(data['schema'])\nnow=datetime.datetime.fromisoformat(data['now'].replace('Z','+00:00'))\ndef h(hours):\n  return (now-datetime.timedelta(hours=hours)).isoformat().replace('+00:00','Z')\ndef add(key,symbol='TEST',age=48,last=0.5,obs=3,score=12,buy=1,sell=1,liq=18000,vol=1000,pinned=0):\n  seen=h(last) if last is not None else None\n  db.execute(\"\"\"INSERT INTO assets (asset_key,chain,address,symbol,status,risk_status,first_seen,updated_at,last_seen,observations,score,liquidity,buys_m5,sells_m5,tx_m5,volume_h24,pinned)\n    VALUES (?,'solana',?,?,'STATIC','UNVERIFIED',?,?,?,?,?,?,?,?,?,?,?)\"\"\",\n    (key,key,symbol,h(age),h(age),seen,obs,score,liq,buy,sell,buy+sell,vol,pinned))\n  for i in range(obs):\n    when=h(last+i*0.5) if last is not None else h(72+i)\n    db.execute(\"\"\"INSERT INTO observations(asset_key,seen_at,pool,provider,price,liquidity,buys_m5,sells_m5,score)\n      VALUES (?,?,'pool','test',0.001,?,?,?,?)\"\"\",(key,when,liq,buy,sell,score))\nadd('quiet')\nadd('young',age=2)\nadd('pinned',pinned=1)\nadd('held')\nadd('pending')\nadd('active',score=85,buy=25,sell=5,liq=70000,vol=55000)\nadd('stale',last=72)\nadd('known_no_quote',symbol='NAMED',age=120,last=None,obs=0)\nadd('unknown_no_quote',symbol='PENDING',age=30,last=None,obs=0)\nadd('lessons',age=120,last=72,obs=3,score=90,buy=25,sell=6,liq=90000,vol=50000)\ndb.execute(\"\"\"INSERT INTO paper_positions(id,asset_key,pool,opened_at,units,entry_usd,cost_usd,stop_usd,target_usd,status) VALUES ('p1','held','pool',?,100,0.001,0.1,0.08,0.14,'OPEN')\"\"\",(h(8),))\ndb.execute(\"\"\"INSERT INTO predictions(asset_key,created_at,due_at,horizon_min,start_price,score,status) VALUES ('pending',?,?,60,0.001,20,'PENDING')\"\"\",(h(1),h(-1)))\ndb.execute(\"INSERT INTO research_events(at,asset_key,kind,note) VALUES (?,'lessons','ROUNDTRIP_QUOTE','case study')\",(h(55),))\nfor item in data['statements']:\n  db.execute(item['sql'],item['args'])\ndb.commit()\nstates=dict(db.execute('SELECT asset_key,status FROM assets'))\nfor key,expected in {'quiet':'DEAD','young':'STATIC','pinned':'STATIC','held':'STATIC','pending':'STATIC','active':'STATIC','stale':'DEAD','known_no_quote':'DEAD','unknown_no_quote':'TRASH','lessons':'DEAD'}.items():\n  assert states[key]==expected,(key,states[key],expected)\nassert db.execute('SELECT COUNT(*) FROM assets').fetchone()[0]==10\nassert db.execute(\"SELECT COUNT(*) FROM observations WHERE asset_key='lessons'\").fetchone()[0]==3\nassert db.execute(\"SELECT COUNT(*) FROM research_events WHERE asset_key='lessons'\").fetchone()[0]==1\nprint('reversible cleanup SQLite test: passed')";
 const check=spawnSync('python',['-c',py],{input:JSON.stringify({
  now,schema:readFileSync('sql/schema.sql','utf8'),statements
 }),encoding:'utf8',timeout:15000});
 assert.equal(check.status,0,check.stderr||check.stdout);
});
