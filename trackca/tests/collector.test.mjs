import test from 'node:test';
import assert from 'node:assert/strict';
import {ASSETS,ROBINHOOD,MIHAO,PRIORITIES} from '../src/watchlist.mjs';
import {validPools,pairRow,normalizeCandles,coverage} from '../src/normalize.mjs';
import {collect,fetchJson} from '../src/worker.mjs';
const asset=id=>ASSETS.find(a=>a.id===id);
const pair=(a,overrides={})=>({
 chainId:a.chain,pairAddress:a.pool||'TestPoolForMihao11111111111111111111111111',
 dexId:'uniswap',baseToken:{address:a.address},quoteToken:{address:'0x0000000000000000000000000000000000000001'},
 priceUsd:'0.1',volume:{m5:10,h1:100,h24:200},liquidity:{usd:5000},
 txns:{m5:{buys:2,sells:1},h1:{buys:5,sells:2},h24:{buys:10,sells:9}},
 priceChange:{m5:1,h1:3,h24:-2},...overrides
});
test('all 22 watch identities retained, with MIHAO on Solana',()=>{
 assert.equal(ASSETS.length,22);assert.equal(ROBINHOOD.length,21);
 assert.equal(PRIORITIES.length,8);assert.equal(ROBINHOOD.filter(a=>!a.address).length,9);
 assert.equal(MIHAO.address,'4CxjZyMNoF1p6eXHXHv1TWpS2X47CuUmLwtGe18spump');
 assert.equal(asset('injoh').holding,true);
});
test('matching only exact contract and exact chain, never symbol',()=>{
 const a=asset('pons'),ok=pair(a),fake=pair(a,{baseToken:{address:'0x0000000000000000000000000000000000000002'}});
 assert.equal(validPools([fake,ok],a).length,1);
 assert.equal(validPools([{...ok,chainId:'ethereum'}],a).length,0);
 assert.equal(validPools([ok],asset('hoodfun')).length,0);
});
test('Uniswap v4 pool ID stays separate from token contract',()=>{
 const a=asset('index');assert.notEqual(a.address,a.pool);
 const pools=validPools([pair(a,{pairAddress:'0x'+'a'.repeat(64),liquidity:{usd:999999}}),pair(a)],a);
 assert.equal(pools[0].pairAddress,a.pool);
});
test('provider volume windows are retained but wallet and exit depth unverified',()=>{
 const a=asset('cashcat');const row=pairRow(pair(a),a,'2026-11-02T10:00:00Z','run1');
 assert.equal(row.length,23);assert.equal(row[9],10);assert.equal(row[10],100);assert.equal(row[11],200);
 assert.equal(row[22],'observation_time_only');
 const c=coverage(a,[pair(a)],'NOT_REFETCHED_THIS_RUN','NOT_REFETCHED_THIS_RUN');
 assert.equal(c.unique_buyers,'UNVERIFIED');assert.equal(c.executable_depth,'UNVERIFIED');
});
test('MIHAO candle source identity must match exact mint',()=>{
 assert.throws(()=>normalizeCandles({data:{attributes:{ohlcv_list:[[10,1,2,1,1.5,10]]}},meta:{base:{address:'Wrong'},quote:{address:'Wrong'}}},MIHAO,'pool'),/MIHAO/);
 assert.equal(normalizeCandles({data:{attributes:{ohlcv_list:[[10,1,2,1,1.5,10]]}},meta:{base:{address:MIHAO.address}}},MIHAO,'pool').length,1);
});
test('HTTP 429 is an explicit provider error',async()=>{
 await assert.rejects(fetchJson('https://api.dexscreener.com/foo',async()=>({ok:false,status:429})),/429/);
});
class FakeDB {
 constructor(){this.rows=[];this.seen=new Set();}
 prepare(sql){const db=this;return {bind(...params){return {async run(){
  db.rows.push({sql,params});
  if(sql.startsWith('INSERT OR IGNORE INTO trackca_runs')){
   const duplicate=db.seen.has(params[0]);db.seen.add(params[0]);
   return {meta:{changes:duplicate?0:1}};
  }
  return {meta:{changes:1}};
 }}}}}
 async batch(items){for(const item of items)await item.run();}
}
test('all 22 assets get coverage and no scan claims complete',async()=>{
 const db=new FakeDB();
 const fetcher=async url=>{
  let obj;
  if(url.includes('/tokens/v1/robinhood/'))obj=ROBINHOOD.filter(a=>a.address).map(a=>pair(a));
  else if(url.includes('/tokens/v1/solana/'))obj=[pair(MIHAO)];
  else if(url.includes('/ohlcv/minute'))obj={data:{attributes:{ohlcv_list:[[1793607300,1,2,1,1.5,100]]}},meta:{base:{address:MIHAO.address}}};
  else if(url.includes('overview/dexs'))obj={total24h:1000,total7d:7000,change_7d:-1};
  else if(url.includes('/v2/chains'))obj=[{name:'Robinhood Chain',tvl:2000}];
  else throw Error('unexpected source '+url);
  return {ok:true,json:async()=>obj};
 };
 const env={DB:db,TRACKCA_BLOCKSCOUT_ENABLED:'false'};
 const at=new Date('2026-11-02T08:15:00Z');
 const out=await collect(env,{now:at,fetcher});
 assert.equal(out.status,'INCOMPLETE');assert.equal(out.assets,22);assert.equal(out.known,13);assert.equal(out.covered,13);assert.equal(out.snapshots,13);assert.equal(out.mihaoCandles,1);
 assert.equal(db.rows.filter(x=>x.sql.startsWith('INSERT OR REPLACE INTO trackca_coverage')).length,22);
 assert.equal((await collect(env,{now:at,fetcher})).already_run,true);
});
test('all provider failures are logged and run remains incomplete',async()=>{
 const db=new FakeDB(),fetcher=async()=>({ok:false,status:503});
 const out=await collect({DB:db,TRACKCA_BLOCKSCOUT_ENABLED:'false'},{now:new Date('2026-11-02T08:20:00Z'),fetcher});
 assert.equal(out.status,'INCOMPLETE');assert.equal(out.covered,0);assert.ok(out.warnings.length>0);
 assert.equal(db.rows.filter(x=>x.sql.startsWith('INSERT OR REPLACE INTO trackca_coverage')).length,22);
});
