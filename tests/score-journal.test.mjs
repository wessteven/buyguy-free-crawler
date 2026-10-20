import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import worker from '../src/viewer.mjs';
import {ourScoreAssessment,journalSafetyScore,scoreForJournal} from '../src/our-score-core.mjs';
import {chooseJournalCandidates,runScoreJournal,JOURNAL_HORIZONS} from '../src/score-journal.mjs';

const NOW=Date.parse('2026-10-20T09:02:00Z');
const ASSET='So11111111111111111111111111111111111111112';
const date=ms=>new Date(ms).toISOString();
function makeAsset(overrides={}){
 return {asset_key:'solana:'+ASSET,chain:'solana',address:ASSET,pool:'pool-A',
  symbol:'CASE',status:'ALIVE',risk_status:'PARTIAL_ONCHAIN_REVIEW',
  risk_note:'{}',price:0.001,liquidity:75000,market_cap:120000,
  buys_m5:26,sells_m5:9,change_h1:12,score:79,last_seen:date(NOW-5*60000),
  first_seen:date(NOW-1800000),...overrides};
}
test('Frozen OUR SCORE v1 calculation matches embedded dashboard factors and penalties',async()=>{
 const html=await (await worker.fetch(new Request('https://unit.test/dashboard'),{})).text();
 const src=html.match(/<script>([\s\S]*?)<\/script>/)[1];
 const scoreSrc=src.slice(src.indexOf('const ourScoreWeights='),src.indexOf('function ourScoreCell(row)'));
 const data=[
  {price:0.001,liquidity:75000,market_cap:120000,quote_age:5,score:80,safety:50,buys_m5:24,sells_m5:7,change_h1:9},
  {price:0.001,liquidity:20000,market_cap:200000,quote_age:5,score:60,safety:null,buys_m5:8,sells_m5:3,change_h1:15},
  {price:0.001,liquidity:250000,market_cap:20000,quote_age:95,score:90,safety:12,buys_m5:10,sells_m5:44,change_h1:700,
   risk_status:'MINT_CONTROL_RISK',topBps:4500}
 ];
 for(const row of data){
  const enriched={status:'ALIVE',...row,liq_cap_pct:row.liquidity/row.market_cap*100};
  const ctx=vm.createContext({row:enriched,Date,Math,Number,String,Array,Object,JSON});
  vm.runInContext(scoreSrc,ctx,{timeout:2000});
  const browser=vm.runInContext('ourScoreAssessment(row)',ctx);
  const server=ourScoreAssessment(enriched);
  assert.equal(server.score,browser.score);
  assert.equal(server.base,browser.base);
  assert.deepEqual(server.factors.map(x=>x.points),Array.from(browser.factors,x=>x.points));
 }
 assert.deepEqual(JOURNAL_HORIZONS,[15,60,360,1440]);
});
test('Exact mint, freshness, risk and pool identity gate immutable shortlist',()=>{
 const good=makeAsset();
 const cases=[
  makeAsset({address:'not-a-contract',asset_key:'solana:not-a-contract',symbol:'BAD_ADDRESS'}),
  makeAsset({asset_key:'solana:another',symbol:'MISMATCH'}),
  makeAsset({last_seen:date(NOW-60*60000),symbol:'STALE'}),
  makeAsset({risk_status:'MINT_CONTROL_RISK',symbol:'RISK'}),
  makeAsset({price:0,symbol:'NO_PRICE'}),
  makeAsset({market_cap:0,symbol:'NO_CAP'}),
  makeAsset({pool:null,symbol:'NO_POOL'}),
  makeAsset({status:'DEAD',symbol:'ARCHIVED'})
 ];
 const picks=chooseJournalCandidates([...cases,good],[],NOW);
 assert.equal(picks.length,1);
 assert.equal(picks[0].row.symbol,'CASE');
 assert.ok(picks[0].assessment.score>=35);
 assert.equal(picks[0].assessment.safety,journalSafetyScore(good,null,NOW));
 assert.equal(scoreForJournal(good,null,NOW).score,picks[0].assessment.score);
});
function fakeDatabase(){
 const statements=[],snapshots=[],horizons=[];
 let next=1;
 const sample=makeAsset();
 const adapter={
  statements,snapshots,horizons,
  prepare(sql){
   const obj={
    bind(...params){this.params=params;return this},
    async all(){
     statements.push({type:'all',sql,params:this.params||[]});
     if(sql.includes('FROM score_outcomes h JOIN score_snapshots')){
      const now=this.params[0];
      return {results:horizons.filter(x=>x.status==='PENDING'&&x.due_at<=now)
       .map(x=>({...x,...snapshots.find(s=>s.id===x.snapshot_id)}))};
     }
     if(sql.includes('FROM assets WHERE'))return {results:[sample]};
     if(sql.includes("FROM research_events"))return {results:[]};
     return {results:[]};
    },
    async first(){
     statements.push({type:'first',sql,params:this.params||[]});
     if(sql.includes('FROM score_snapshots ORDER BY'))
      return snapshots.length?{captured_at:snapshots.at(-1).captured_at}:null;
     if(sql.includes('FROM observations'))return null;
     return null;
    },
    async run(){
     statements.push({type:'run',sql,params:this.params||[]});
     if(sql.includes('INSERT OR IGNORE INTO score_snapshots')){
      const p=this.params;const id=next++;
      snapshots.push({id,asset_key:p[0],chain:p[1],address:p[2],symbol:p[3],pool:p[4],
       captured_at:p[5],entry_price:p[6],our_score:p[7]});
      return {meta:{changes:1,last_row_id:id}};
     }
     if(sql.includes('INSERT OR IGNORE INTO score_outcomes')){
      horizons.push({snapshot_id:this.params[0],horizon_min:this.params[1],due_at:this.params[2],status:'PENDING'});
      return {meta:{changes:1}};
     }
     if(sql.includes("SET status='MISSED_DATA'")){
      const target=horizons.find(h=>h.snapshot_id===this.params[0]&&h.horizon_min===this.params[1]);
      target.status='MISSED_DATA';
      return {meta:{changes:1}};
     }
     return {meta:{changes:0}};
    }
   };
   return obj;
  },
  async batch(items){for(const item of items)await item.run();return items.map(()=>({meta:{changes:1}}));}
 };
 return adapter;
}
test('Once-per-hour snapshots preserve frozen score, four horizons, and missed evidence stays missing',async()=>{
 const db=fakeDatabase(),env={DB:db};
 const first=await runScoreJournal(env,{now:NOW});
 assert.equal(first.saved,1);
 assert.equal(first.state,'CAPTURED');
 assert.equal(db.snapshots.length,1);
 assert.equal(db.horizons.length,4);
 assert.ok(db.snapshots[0].our_score>0);
 assert.deepEqual(db.horizons.map(h=>h.horizon_min),JOURNAL_HORIZONS);
 const next=await runScoreJournal(env,{now:NOW+16*60000});
 assert.equal(next.saved,0);
 assert.equal(next.state,'WAITING_NEXT_HOUR');
 assert.equal(db.horizons.find(h=>h.horizon_min===15).status,'PENDING');
 const missed=await runScoreJournal(env,{now:NOW+61*60000,maxOutcomes:1});
 assert.equal(missed.missing,1);
 assert.equal(db.horizons[0].status,'MISSED_DATA');
 assert.equal(db.snapshots[0].our_score,first.saved?db.snapshots[0].our_score:null);
});
test('D1 schema supports immutable score/quote records and four uniquely keyed outcomes',()=>{
 const py=`import sqlite3,sys
db=sqlite3.connect(':memory:')
db.executescript(sys.stdin.read())
db.execute("INSERT INTO score_snapshots(asset_key,chain,address,symbol,pool,captured_at,entry_price,our_score,quote_seen_at) VALUES ('k','solana','mint','A','pool','2026-10-20T00:00:00Z',0.001,74,'2026-10-20T00:00:00Z')")
db.execute("INSERT INTO score_outcomes(snapshot_id,horizon_min,due_at) VALUES (1,15,'2026-10-20T00:15:00Z')")
try:
 db.execute("INSERT INTO score_outcomes(snapshot_id,horizon_min,due_at) VALUES (1,15,'2026-10-20T00:15:00Z')")
 raise AssertionError('duplicate allowed')
except sqlite3.IntegrityError:pass
assert db.execute("SELECT COUNT(*) FROM score_outcomes").fetchone()[0]==1
assert db.execute("SELECT our_score FROM score_snapshots").fetchone()[0]==74
print('pass')`;
 const check=spawnSync('python',['-c',py],{input:readFileSync('sql/schema.sql','utf8'),encoding:'utf8',timeout:15000});
 assert.equal(check.status,0,check.stderr||check.stdout);
});
