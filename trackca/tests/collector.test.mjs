import test from 'node:test';
import assert from 'node:assert/strict';
import {ASSETS,ROBINHOOD,MIHAO,PRIORITIES} from '../src/watchlist.mjs';
import {validPools,pairRow,normalizeCandles,coverage} from '../src/normalize.mjs';
import {collect,fetchJson} from '../src/worker.mjs';
import {parseCrius,parseMIHAO} from '../src/secondary-sources.mjs';
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
 assert.equal(PRIORITIES.length,8);assert.equal(ROBINHOOD.filter(a=>!a.address).length,1);
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
 prepare(sql){const db=this;return {bind(...params){if(params.some(p=>p===undefined))throw Error('D1_TYPE_ERROR undefined parameter');return {async run(){
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
 assert.equal(out.status,'INCOMPLETE');assert.equal(out.assets,22);assert.equal(out.known,21);assert.equal(out.covered,21);assert.equal(out.snapshots,21);assert.equal(out.mihaoCandles,1);
 assert.equal(db.rows.filter(x=>x.sql.startsWith('INSERT OR REPLACE INTO trackca_coverage')).length,22);
 assert.equal((await collect(env,{now:at,fetcher})).already_run,true);
});
test('all provider failures are logged and run remains incomplete',async()=>{
 const db=new FakeDB(),fetcher=async()=>({ok:false,status:503});
 const out=await collect({DB:db,TRACKCA_BLOCKSCOUT_ENABLED:'false'},{now:new Date('2026-11-02T08:20:00Z'),fetcher});
 assert.equal(out.status,'INCOMPLETE');assert.equal(out.covered,0);assert.ok(out.warnings.length>0);
 assert.equal(db.rows.filter(x=>x.sql.startsWith('INSERT OR REPLACE INTO trackca_coverage')).length,22);
});

test('provisional Blockscout identities stay distinct from fully confirmed address identities',()=>{
 assert.equal(asset('ameme').identity_status,'PROVISIONAL_BLOCKSCOUT');
 assert.equal(coverage(asset('ameme'),[pair(asset('ameme'))],'UNAVAILABLE','UNAVAILABLE').identity,'PROVISIONAL_BLOCKSCOUT');
 assert.equal(asset('hoodfun').address,null);
});

test('D1 fake rejects undefined bindings and coverage wallet field is defined',async()=>{
 const db=new FakeDB();
 assert.throws(()=>db.prepare('INSERT INTO trackca_coverage').bind('x',undefined),/D1_TYPE_ERROR/);
 const c=coverage(asset('injoh'),[],'UNAVAILABLE','UNAVAILABLE');
 assert.equal(c.wallets,'UNVERIFIED');
});
test('MIHAO Solana address comparisons preserve base58 case',()=>{
 const a=MIHAO,p=pair(a);
 assert.equal(validPools([p],a).length,1);
 assert.equal(validPools([pair(a,{baseToken:{address:a.address.toLowerCase()}})],a).length,0);
});
test('blocked market providers stop repeated 429 attempts, still write 22 coverage rows',async()=>{
 const db=new FakeDB(),calls=[];
 const fetcher=async url=>{
  calls.push(url);
  if(url.includes('dexscreener.com')||url.includes('geckoterminal.com'))return {ok:false,status:429};
  if(url.includes('overview/dexs'))return {ok:true,json:async()=>({total24h:100,total7d:700})};
  if(url.includes('/v2/chains'))return {ok:true,json:async()=>([{name:'Robinhood Chain',tvl:100}])};
  return {ok:false,status:404};
 };
 const out=await collect({DB:db,TRACKCA_BLOCKSCOUT_ENABLED:'false'},{now:new Date('2026-11-02T08:25:00Z'),fetcher});
 assert.equal(out.status,'INCOMPLETE');
 assert.equal(out.covered,0);
 assert.equal(db.rows.filter(x=>x.sql.startsWith('INSERT OR REPLACE INTO trackca_coverage')).length,22);
 assert.ok(calls.filter(u=>u.includes('dexscreener.com')).length<=2);
 assert.ok(calls.filter(u=>u.includes('geckoterminal.com')).length<=2);
});
test('Gecko pool identity requires actual token contract relationship',async()=>{
 const a=asset('pons'),db=new FakeDB();
 const fetcher=async url=>{
  if(url.includes('dexscreener.com'))return {ok:false,status:429};
  if(url.includes('geckoterminal.com')){
   const p={id:'robinhood_'+a.pool,attributes:{address:a.pool,base_token_price_usd:'0.23',reserve_in_usd:'200000',volume_usd:{m5:12,h1:40,h24:900}},
    relationships:{base_token:{data:{id:'robinhood_'+a.address.toLowerCase()}},quote_token:{data:{id:'robinhood_0x0000000000000000000000000000000000000001'}},dex:{data:{id:'uniswap_v3'}}}};
   return {ok:true,json:async()=>({data:[p]})};
  }
  if(url.includes('overview/dexs'))return {ok:true,json:async()=>({total24h:100,total7d:700})};
  if(url.includes('/v2/chains'))return {ok:true,json:async()=>([{name:'Robinhood Chain',tvl:100}])};
  return {ok:false,status:404};
 };
 const out=await collect({DB:db,TRACKCA_BLOCKSCOUT_ENABLED:'false'},{now:new Date('2026-11-02T08:30:00Z'),fetcher});
 assert.equal(out.status,'INCOMPLETE');
 assert.ok(out.covered>=1);
 const rows=db.rows.filter(x=>x.sql.startsWith('INSERT OR IGNORE INTO trackca_pair_snapshots'));
 assert.ok(rows.some(x=>x.params[1]==='pons'&&x.params[21]==='geckoterminal'));
});

test('Crius quotes use exact CA keys and provider block timestamp',()=>{
 const a=asset('pons'),ts='2026-11-02T09:20:00.000Z';
 const j={data:{[a.address.toLowerCase()]:{usd:0.1234,liquidity_usd:32000,source_pool:'0x'+'a'.repeat(64),confidence:'medium'},['0x'+'f'.repeat(40)]:{usd:666}},
  meta:{block:103,block_ts:Date.parse(ts)-1500}};
 const rows=parseCrius(j,[a,asset('injoh')],ts,'run-test');
 assert.equal(rows.length,1);
 assert.equal(rows[0][1],'pons');
 assert.equal(rows[0][6],0.1234);
 assert.equal(rows[0][15],'BLOCK_STAMPED_PROVIDER_PRICE');
 assert.equal(rows[0][16],103);
 assert.equal(parseCrius({...j,meta:{block_ts:Date.parse(ts)-7200000}},[a],ts,'run')[0][15],'STALE_BLOCK');
});
test('MIHAO secondary quote rejects any wrong Solana mint or chain',()=>{
 const ts='2026-11-02T09:20:00Z';
 const j={id:MIHAO.address,chain:'solana',summary:{price_usd:0.003,liquidity_usd:80000,'5m':{volume_usd:19},'1h':{volume_usd:200},'24h':{volume_usd:3000}},last_updated:ts};
 assert.equal(parseMIHAO({...j,id:MIHAO.address.toLowerCase()},MIHAO,ts,'r'),null);
 assert.equal(parseMIHAO({...j,chain:'ethereum'},MIHAO,ts,'r'),null);
 const row=parseMIHAO(j,MIHAO,ts,'r');
 assert.equal(row.length,17);
 assert.equal(row[6],0.003);
 assert.equal(row[9],19);
 assert.equal(row[14],'dexpaprika');
 assert.equal(row[15],'TOKEN_AGGREGATE_PROVIDER');
});
test('secondary prices never masquerade as exact-pool 5m volume',async()=>{
 const db=new FakeDB(),a=asset('pons'),now=new Date('2026-11-02T09:20:00Z');
 const fetcher=async url=>{
  let body;
  if(url.includes('api.crius.sh'))body={data:{[a.address.toLowerCase()]:{usd:0.5,liquidity_usd:40000}},meta:{block:123,block_ts:now.getTime()}};
  else if(url.includes('api.dexpaprika.com'))body={id:MIHAO.address,chain:'solana',summary:{price_usd:0.006,liquidity_usd:30000,'5m':{volume_usd:75}}};
  else if(url.includes('api.dexscreener.com')||url.includes('api.geckoterminal.com'))return {ok:false,status:429};
  else if(url.includes('overview/dexs'))body={total24h:10,total7d:70};
  else if(url.includes('/v2/chains'))body=[{name:'Robinhood Chain',tvl:50}];
  else return {ok:false,status:404};
  return {ok:true,json:async()=>body};
 };
 const result=await collect({DB:db,TRACKCA_BLOCKSCOUT_ENABLED:'false'},{now,fetcher});
 assert.equal(result.status,'INCOMPLETE');
 assert.equal(result.covered,0);
 const quotes=db.rows.filter(x=>x.sql.startsWith('INSERT OR IGNORE INTO trackca_token_quotes'));
 assert.equal(quotes.length,2);
 const cov=db.rows.filter(x=>x.sql.startsWith('INSERT OR REPLACE INTO trackca_coverage'));
 assert.equal(cov.length,22);
 assert.equal(cov.find(x=>x.params[1]==='pons').params[4],'TOKEN_PRICE_ONLY');
 assert.equal(cov.find(x=>x.params[1]==='mihao').params[4],'TOKEN_AGGREGATE_ONLY');
 assert.equal(cov.find(x=>x.params[1]==='mihao').params[5],'UNAVAILABLE');
});
