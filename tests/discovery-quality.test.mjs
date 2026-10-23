import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {discoveryQuality} from '../src/discovery-quality.mjs';
import worker from '../src/viewer.mjs';
const stamp='2026-10-23T10:00:00Z';
function mock(observations,runs){
 const sql=[];
 return {sql,prepare(q){sql.push(q);return {all:async()=>({results:q.includes('FROM observations')?observations:runs})}}};
}
test('quality: identity, repeats, pool switches, age and inference are honest',async()=>{
 const records=[
  {id:5,asset_key:'solana:MintA',pool:'poolB',seen_at:'2026-10-23T10:00:00.123Z',provider:'DEX Screener',score:73,liquidity:60000,buys_m5:8,sells_m5:2},
  {id:4,asset_key:'solana:MintA',pool:'poolA',seen_at:'2026-10-23T09:00:00Z',score:64,liquidity:80000,buys_m5:6,sells_m5:1},
  {id:3,asset_key:'solana:MintA',pool:'poolA',seen_at:'2026-10-23T08:00:00Z',score:40,liquidity:2000,buys_m5:0,sells_m5:0},
  {id:2,asset_key:'solana:MintB',pool:'poolC',seen_at:'2026-10-23T07:00:00Z',score:30,liquidity:3000,buys_m5:2,sells_m5:3},
  {id:1,asset_key:'robinhood:0xdead',pool:'poolD',seen_at:'2026-10-23T06:00:00Z',score:10,liquidity:1000,buys_m5:null}
 ];
 const runs=[
  {started_at:'2026-10-23T10:00:00.123Z',state:'PARTIAL',observed:3,provider_errors:'["GeckoTerminal cooldown 300s"]'},
  {started_at:'2026-10-23T09:00:00Z',state:'PARTIAL',observed:4,provider_errors:'["/token-boosts/latest/v1: HTTP 429"]'},
  {started_at:'2026-10-23T08:00:00Z',state:'SUCCESS',observed:5,provider_errors:'[]'}
 ];
 const db=mock(records,runs);
 const r=await discoveryQuality(db,{now:Date.parse('2026-10-23T10:20:00Z')});
 assert.equal(r.counts.uniqueMints,2);assert.equal(r.counts.uniqueAssets,3);
 assert.equal(r.counts.repeats,2);assert.equal(r.counts.repeatSamePool,1);
 assert.equal(r.counts.multiPoolAssets,1);assert.equal(r.counts.highScoreLiquid,2);
 assert.equal(r.counts.zeroBuyRows,1);
 assert.deepEqual(r.rows.map(x=>x.path),['lightweight','broader','broader','unknown','unknown']);
 assert.equal(r.rows[0].pathConfidence,'inferred_writer_timestamp_and_unique_run');
 assert.equal(r.rows[0].observationAgeMinutes,20);
 assert.equal(r.rows[0].verifiedIndependentBuyers,null);
 assert.equal(r.rows[0].quoteFreshness,'unverified');
 assert.equal(r.rows[1].poolIdentity,'recorded_unverified');
 assert.equal(db.sql.length,2);
 assert.ok(db.sql.every(q=>/^SELECT /i.test(q)&&/LIMIT (120|45)/.test(q)));
});
test('unknown remains unknown for colliding run timestamps, invalid markers and failed runs',async()=>{
 const o=[{asset_key:'solana:M',seen_at:stamp,pool:'X'}];
 const marker={started_at:stamp,state:'SUCCESS',observed:1,provider_errors:'["GeckoTerminal cooldown 100s"]'};
 const scenarios=[[],
  [{...marker,state:'ERROR'}],
  [{...marker,provider_errors:'["GeckoTerminal cooldown 100s","/token-boosts/latest/v1"]'}],
  [marker,marker]];
 for(const rs of scenarios)assert.equal((await discoveryQuality(mock(o,rs))).rows[0].path,'unknown');
});
test('writer format attribution never relies on provider branding or cron modulo',async()=>{
 const light='2026-10-23T10:00:00.471Z',broad='2026-10-23T09:59:56Z';
 const obs=[{asset_key:'solana:A',pool:'P1',seen_at:light,provider:'DEX Screener'},
   {asset_key:'solana:B',pool:'P2',seen_at:broad,provider:'GeckoTerminal'}];
 const runs=[{started_at:light,state:'SUCCESS',observed:1,provider_errors:'[]'},
   {started_at:broad,state:'SUCCESS',observed:1,provider_errors:'[]'}];
 const x=await discoveryQuality(mock(obs,runs));
 assert.deepEqual(x.rows.map(y=>y.path),['lightweight','broader']);
 assert.equal(x.counts.unknown,0);
});
test('unchanged schema accepts fixed LIMIT PK-ordered queries in SQLite',()=>{
 const source=readFileSync('src/discovery-quality.mjs','utf8');
 const qs=[...source.matchAll(/db\.prepare\("([^"]+)"\)/g)].map(x=>x[1]);
 assert.equal(qs.length,2);
 const script="import sqlite3,json,sys\nx=json.load(sys.stdin);d=sqlite3.connect(':memory:');d.row_factory=sqlite3.Row;d.executescript(x['schema'])\nd.execute(\"INSERT INTO assets(asset_key,chain,address,first_seen,updated_at) VALUES ('solana:M','solana','M','today','today')\")\nfor i in range(180):d.execute(\"INSERT INTO observations(asset_key,seen_at,pool,provider,price) VALUES ('solana:M',?,'p','g',1)\",(str(i),))\nfor i in range(60):d.execute(\"INSERT INTO runs(started_at,state) VALUES (?, 'SUCCESS')\",(str(i),))\na=list(d.execute(x['obs']));b=list(d.execute(x['runs']));assert len(a)==120 and len(b)==45;assert a[0]['id']==180 and a[-1]['id']==61\nplan=' '.join(str(tuple(z)) for z in d.execute('EXPLAIN QUERY PLAN '+x['obs']));assert 'SEARCH a USING' in plan,plan\n";
 const r=spawnSync('python',['-c',script],{input:JSON.stringify({schema:readFileSync('sql/schema.sql','utf8'),obs:qs[0],runs:qs[1]}),encoding:'utf8',timeout:15000});
 assert.equal(r.status,0,r.stderr||r.stdout);
});
test('quality API is authenticated GET, read quota is signaled, and GO control persists',async()=>{
 let n=0;const db={prepare(){n++;return {all:async()=>({results:[]})}}};
 const env={ADMIN_TOKEN:'test-dashboard-password',DB:db};
 const no=await worker.fetch(new Request('https://go.test/api/discovery-quality'),env);
 assert.equal(no.status,401);assert.equal(n,0);
 const post=await worker.fetch(new Request('https://go.test/api/discovery-quality',{method:'POST'}),env);
 assert.equal(post.status,405);assert.equal(n,0);
 const yes=await worker.fetch(new Request('https://go.test/api/discovery-quality',{headers:{authorization:'Bearer test-dashboard-password'}}),env);
 assert.equal(yes.status,200);assert.equal(n,2);
 assert.equal((await yes.json()).sampleSize,0);
 const limited=await worker.fetch(new Request('https://go.test/api/discovery-quality',{headers:{authorization:'Bearer test-dashboard-password'}}),{...env,DB:{prepare(){throw Error('daily row read limit exceeded')}}});
 assert.equal(limited.status,503);assert.equal((await limited.json()).error,'D1_READ_QUOTA');
 const html=await (await worker.fetch(new Request('https://go.test/dashboard'),{})).text();
 assert.match(html,/id="tab-quality"/);assert.match(html,/id="panel-quality"/);
 assert.match(html,/GO · LOAD QUALITY REPORT/);assert.match(html,/id="goodRefreshButton"/);
 assert.match(html,/Quote freshness|quote freshness/i);
});
