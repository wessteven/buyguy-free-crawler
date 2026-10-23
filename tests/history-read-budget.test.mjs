import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import worker from '../src/viewer.mjs';

const password='test-only-private-dashboard-password-12345';
function dbForStatus(){
 const queries=[];
 const empty={all:async()=>({results:[]})};
 return {
  queries,
  prepare(sql){queries.push(sql);return {all:empty.all,bind(){return empty}};}
 };
}
test('Indexed D1 query plan preserves latest socials and archive lessons in real SQLite',async()=>{
 const db=dbForStatus();
 const r=await worker.fetch(new Request('https://test.example/api/status',{
  headers:{authorization:'Bearer '+password}
 }),{ADMIN_TOKEN:password,DB:db});
 assert.equal(r.status,200);
 const active=db.queries.find(q=>q.includes('socials_json'));
 const archived=db.queries.find(q=>q.includes('peak_score')&&q.includes('research_count'));
 assert.ok(active);
 assert.ok(archived);
 assert.match(active,/LEFT JOIN/);
 assert.doesNotMatch(active,/SELECT e\.note FROM research_events e WHERE e\.asset_key=a\.asset_key/);
 assert.match(archived,/WITH ranked AS/);
 assert.doesNotMatch(archived,/SELECT COUNT\(\*\) FROM research_events e WHERE e\.asset_key=a\.asset_key/);
 const pythonScript="import sqlite3,sys,json\nx=json.load(sys.stdin)\ndb=sqlite3.connect(':memory:')\ndb.row_factory=sqlite3.Row\ndb.executescript(x['schema'])\nassets=[\n ('solana:tokenA','tokenA','ALIVE','ACTIVE'),\n ('solana:tokenB','tokenB','DEAD','ARCHIVED')\n]\nfor key,address,status,symbol in assets:\n db.execute(\"INSERT INTO assets (asset_key,chain,address,status,symbol,first_seen,updated_at) VALUES (?,'solana',?,?,?,?,?)\",\n (key,address,status,symbol,'2026-10-19T00:00:00Z','2026-10-19T00:00:00Z'))\ndb.execute(\"UPDATE assets SET last_seen='2026-10-23T08:15:00.000Z' WHERE asset_key='solana:tokenA'\")\nfor kind,asset,note in [('TOKEN_SOCIALS','solana:tokenA','OLD_SOCIAL'),('TOKEN_SOCIALS','solana:tokenA','LATEST_SOCIAL'),('MINT_AUTHORITY_REVIEW','solana:tokenB','AUDIT_LESSON')]:\n db.execute(\"INSERT INTO research_events (at,asset_key,kind,note) VALUES ('2026-10-20T00:00:00Z',?,?,?)\",(asset,kind,note))\nfor i,score in enumerate((30,85,20)):\n db.execute(\"INSERT INTO observations (asset_key,seen_at,pool,provider,price,score) VALUES ('solana:tokenB',?,'pool','test',1,?)\",('2026-10-20T00:00:0'+str(i)+'Z',score))\ndb.execute(\"INSERT INTO predictions (asset_key,created_at,due_at,horizon_min,start_price,score,status) VALUES ('solana:tokenB','2026-10-19T01:00:00Z','2026-10-19T02:00:00Z',60,1,85,'EVALUATED')\")\ndb.commit()\nactive=list(db.execute(x['active']))\narchived=list(db.execute(x['archive']))\nassert len(active)==1,active\nassert active[0]['symbol']=='ACTIVE',dict(active[0])\nassert active[0]['socials_json']=='LATEST_SOCIAL',dict(active[0])\nassert len(archived)==1,archived\na=dict(archived[0])\nassert a['asset_key']=='solana:tokenB',a\nassert a['peak_score']==85,a\nassert a['prediction_count']==1,a\nassert a['paper_count']==0,a\nassert a['research_count']==1,a\nindexes={row[1] for row in db.execute(\"PRAGMA index_list('research_events')\")}\nassert {'research_event_asset_kind_id','research_event_kind_id'}.issubset(indexes),indexes\nprint('Indexed history queries preserve active socials and archive lessons')";
 const python=spawnSync('python',['-c',pythonScript],{
  input:JSON.stringify({schema:readFileSync('sql/schema.sql','utf8'),active,archive:archived}),
  encoding:'utf8',timeout:15000
 });
 assert.equal(python.status,0,python.stderr||python.stdout);
});
test('D1 daily read exhaustion is explicit and does not masquerade as no good candidates',async()=>{
 const db={prepare(){throw Error('Your account has exceeded D1 free tier daily row read limit.')}};
 const response=await worker.fetch(new Request('https://test.example/api/status',{
  headers:{authorization:'Bearer '+password}
 }),{ADMIN_TOKEN:password,DB:db});
 assert.equal(response.status,503);
 const data=await response.json();
 assert.equal(data.error,'D1_READ_QUOTA');
 const dashboard=await worker.fetch(new Request('https://test.example/dashboard'),{});
 const html=await dashboard.text();
 assert.match(html,/id="goodDataStatus"/);
 assert.match(html,/LIVE RANKING UNAVAILABLE/);
});
