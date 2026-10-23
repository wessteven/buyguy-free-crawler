import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import worker from '../src/viewer.mjs';
import {CLEAN_SLATE_AT,CLEAN_SLATE_ACTIVE_WHERE} from '../src/clean-slate.mjs';

test('active slate is only a view: no historical writes, GO controls stay intact',async()=>{
 assert.equal(CLEAN_SLATE_AT,'2026-10-23T08:10:00.000Z');
 assert.match(CLEAN_SLATE_ACTIVE_WHERE,/a\.last_seen >=/);
 assert.match(CLEAN_SLATE_ACTIVE_WHERE,/a\.pinned=1/);
 assert.match(CLEAN_SLATE_ACTIVE_WHERE,/paper_positions/);
 assert.doesNotMatch(CLEAN_SLATE_ACTIVE_WHERE,/DELETE|UPDATE|INSERT|DROP|ALTER/i);
 const viewer=readFileSync('src/viewer.mjs','utf8');
 assert.ok(viewer.includes('"WHERE "+CLEAN_SLATE_ACTIVE_WHERE+" "'));
 assert.match(viewer,/cleanSlate:\{activeSince:CLEAN_SLATE_AT,scope:'active_discovery_view_only',historyPreserved:true\}/);
 const response=await worker.fetch(new Request('https://goget.test/dashboard'),{});
 const html=await response.text();
 assert.equal(response.status,200);
 assert.match(html,/CLEAN SLATE/);
 assert.match(html,/Earlier research, journal, archived tokens, pinned addresses and paper positions are preserved/);
 assert.match(html,/id="goodRefreshButton"/);
 assert.match(html,/id="tab-quality"/);
});

test('SQLite view hides legacy leads but protects pinned, held and genuinely revived tokens',()=>{
 const script=`import json,sqlite3,sys
x=json.load(sys.stdin);db=sqlite3.connect(':memory:');db.executescript(x['schema'])
first='2026-10-20T00:00:00.000Z'
rows=[
 ('pre','STATIC','2026-10-23T08:09:59.999Z',0),
 ('fresh','STATIC','2026-10-23T08:10:00.000Z',0),
 ('revived','ALIVE','2026-10-23T08:20:00.000Z',0),
 ('pinned','DEAD','2026-10-19T08:20:00.000Z',1),
 ('held','DEAD','2026-10-19T08:20:00.000Z',0),
 ('junk','TRASH','2026-10-19T08:20:00.000Z',0),
 ('archived','DEAD','2026-10-19T08:20:00.000Z',0)]
for k,status,last,pin in rows:
 db.execute("INSERT INTO assets(asset_key,chain,address,symbol,status,first_seen,updated_at,last_seen,pinned) VALUES (?,'solana',?,'T',?,?,?,?,?)",
  (k,k,status,first,first,last,pin))
db.execute("INSERT INTO paper_positions(id,asset_key,pool,opened_at,units,entry_usd,cost_usd,stop_usd,target_usd,status) VALUES ('p1','held','pool',?,100,.001,.1,.08,.14,'OPEN')",(first,))
db.execute("INSERT INTO observations(asset_key,seen_at,pool,provider,price) VALUES ('pre',?,'pool','test',.001)",(first,))
before=db.execute('SELECT COUNT(*) FROM observations').fetchone()[0]
hits={r[0] for r in db.execute('SELECT a.asset_key FROM assets a WHERE '+x['where'])}
assert hits=={'fresh','revived','pinned','held'},hits
assert db.execute('SELECT COUNT(*) FROM observations').fetchone()[0]==before
assert db.execute('SELECT COUNT(*) FROM assets').fetchone()[0]==len(rows)
assert db.execute('SELECT COUNT(*) FROM paper_positions').fetchone()[0]==1
print('PASS: non-destructive clean slate; protected identities and records preserved')`;
 const result=spawnSync('python',['-c',script],{encoding:'utf8',input:JSON.stringify({
  schema:readFileSync('sql/schema.sql','utf8'),where:CLEAN_SLATE_ACTIVE_WHERE}),timeout:15000});
 assert.equal(result.status,0,result.stderr||result.stdout);
});
