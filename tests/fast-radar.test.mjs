import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {FastRadar,exactDexQuotes,exactGeckoQuote,retryDelay,DAILY_WRITE_BUDGET} from '../src/fast-radar.mjs';
import viewer from '../src/viewer.mjs';
const mint='So11111111111111111111111111111111111111112',pool='11111111111111111111111111111111';
const target={asset_key:'solana:'+mint,chain:'solana',address:mint,pool,symbol:'SOL'};
const pair={chainId:'solana',baseToken:{address:mint},pairAddress:pool,priceUsd:'1',liquidity:{usd:50000},txns:{m5:{buys:12,sells:2}}};
const now=Date.parse('2026-10-25T00:00:00Z');
function harness(fetcher){
 const store=new Map();let alarms=0,batches=0,reads=0;
 const state={storage:{get:async k=>store.get(k),put:async(k,v)=>store.set(k,structuredClone(v)),setAlarm:async()=>{alarms++},deleteAlarm:async()=>{}},blockConcurrencyWhile:f=>f()};
 const db={prepare(sql){return {bind(){return this},async all(){reads++;return {results:sql.includes('FROM assets')?[target]:[]}},async run(){return {meta:{rows_written:1}}}}},async batch(stmts){batches++;return stmts.map(()=>({meta:{rows_written:2}}))}};
 const radar=new FastRadar(state,{DB:db,FAST_RADAR_ENABLED:'true',FAST_RADAR_FETCH:fetcher});
 return {radar,store,stats:()=>({alarms,batches,reads})};
}
test('exact pool and mint required; missing metrics stay unknown; no executable or source freshness claim',()=>{
 const quotes=exactDexQuotes([pair], [target],new Date(now).toISOString());
 assert.equal(quotes.length,1);assert.equal(quotes[0].unique_buyers,null);assert.equal(quotes[0].source_at,null);assert.equal(quotes[0].market_cap,null);
 for(const bad of [{...pair,pairAddress:mint},{...pair,baseToken:{address:pool}},{...pair,chainId:'ethereum'},{...pair,priceUsd:'NaN'},{...pair,liquidity:{usd:0}}])assert.equal(exactDexQuotes([bad],[target],'x').length,0);
});
test('Gecko fallback verifies base token orientation and exact pool',()=>{
 const payload={data:{attributes:{address:pool,base_token_price_usd:'2',reserve_in_usd:'60000'},relationships:{base_token:{data:{id:'solana_'+mint}}}}};
 assert.equal(exactGeckoQuote(payload,target,'x').price,2);
 payload.data.relationships.base_token.data.id='solana_'+pool;
 assert.equal(exactGeckoQuote(payload,target,'x'),null);
});
test('429 honors Retry-After and never shortens existing thirty-minute cooldown',()=>{
 assert.equal(retryDelay(new Response('',{headers:{'retry-after':'7200'}}),now),7200000);
 assert.equal(retryDelay(new Response('',{headers:{'retry-after':'1'}}),now),1800000);
 assert.equal(retryDelay(new Response('',{headers:{'retry-after':new Date(now+3600000).toUTCString()}}),now),3600000);
});
test('30-second ticks batch quotes but sample only once per minute; snapshot costs no D1 reads',async()=>{
 let calls=0;const h=harness(async()=>{calls++;return Response.json([pair])});await Promise.resolve();
 await h.radar.tick(now);await h.radar.tick(now+30000);
 assert.equal(calls,2);assert.equal(h.stats().batches,1);
 const before=h.stats().reads;
 const snapshot=await (await h.radar.fetch(new Request('https://internal/snapshot'))).json();
 assert.equal(snapshot.quotes.length,1);assert.equal(h.stats().reads,before);
 await h.radar.tick(now+60000);assert.equal(h.stats().batches,2);
});
test('persisted 429 blocks next tick, preserves old receipt timestamp, and uses bounded fallback',async()=>{
 let calls=0;const h=harness(async url=>{calls++;return url.includes('dexscreener')?new Response('',{status:429,headers:{'retry-after':'3600'}}):new Response('',{status:503})});await Promise.resolve();
 h.radar.data.quotes=[{...target,price:1,received_at:'2026-10-24T00:00:00Z'}];
 await h.radar.tick(now);await h.radar.tick(now+30000);
 assert.equal(calls,2);assert.equal(h.radar.data.quotes[0].received_at,'2026-10-24T00:00:00Z');
 assert.ok(h.radar.data.providers.dex.next_at>=now+3600000);
});
test('daily and lifetime budgets pause history while allowing new quotes',async()=>{
 const h=harness(async()=>Response.json([pair]));await Promise.resolve();
 h.radar.data.day='2026-10-25';h.radar.data.writes=DAILY_WRITE_BUDGET;
 await h.radar.tick(now);assert.equal(h.stats().batches,0);assert.equal(h.radar.data.history_paused,true);
 h.radar.data.writes=0;h.radar.data.samples_reserved=200000;
 await h.radar.tick(now+30000);assert.equal(h.stats().batches,0);assert.equal(h.radar.data.quotes.length,1);
});
test('fast endpoint requires authentication, correct method and same origin',async()=>{
 const env={ADMIN_TOKEN:'test-secret'};
 assert.equal((await viewer.fetch(new Request('https://radar/api/fast-radar'),env)).status,401);
 assert.equal((await viewer.fetch(new Request('https://radar/api/fast-radar/start',{method:'POST',headers:{origin:'https://evil',authorization:'Bearer test-secret'}}),env)).status,403);
 assert.equal((await viewer.fetch(new Request('https://radar/api/fast-radar',{method:'POST',headers:{authorization:'Bearer test-secret'}}),env)).status,405);
 const result=await (await viewer.fetch(new Request('https://radar/api/fast-radar',{headers:{authorization:'Bearer test-secret'}}),env)).json();
 assert.equal(result.configured,false);
});
test('real SQLite accepts additive sample schema and deduplicates exact pool/minute',()=>{
 const schema=readFileSync(new URL('../sql/fast-radar.sql',import.meta.url),'utf8');
 const script=`import sqlite3,sys\nc=sqlite3.connect(':memory:')\nc.executescript(sys.stdin.read())\ns="INSERT OR IGNORE INTO radar_samples(chain,pool,asset_key,minute,provider,received_at,price) VALUES('solana','pool','mint','minute','dex','receipt',1)"\nc.execute(s);c.execute(s)\nassert c.execute('SELECT count(*) FROM radar_samples').fetchone()[0]==1\nassert c.execute('SELECT unique_buyers,source_at FROM radar_samples').fetchone()==(None,None)\n`;
 execFileSync('python',['-c',script],{input:schema});
});
test('activation is opt-in; stop removes alarm; alarm failure keeps cached snapshot and reschedules',async()=>{
 const h=harness(async()=>{throw Error('offline')});await Promise.resolve();
 h.radar.env.FAST_RADAR_ENABLED='false';
 assert.equal((await h.radar.fetch(new Request('https://internal/start',{method:'POST'}))).status,409);
 h.radar.env.FAST_RADAR_ENABLED='true';await h.radar.fetch(new Request('https://internal/start',{method:'POST'}));
 await h.radar.alarm();assert.ok(h.stats().alarms>=2);
 await h.radar.fetch(new Request('https://internal/stop',{method:'POST'}));assert.equal(h.radar.data.enabled,false);
});
test('ten-minute live trial automatically stops without fetching providers',async()=>{
 let calls=0;const h=harness(async()=>{calls++;return Response.json([pair])});await Promise.resolve();
 h.radar.data.enabled=true;h.radar.data.trial_started_at=Date.now()-600001;
 await h.radar.alarm();assert.equal(h.radar.data.enabled,false);assert.equal(h.radar.data.error,'TRIAL_COMPLETE');assert.equal(calls,0);
});
test('verified profile-only cooldown does not consume documented token-quote bucket; unknown scope blocks',async()=>{
 for(const verified of [true,false]){
  let calls=0;const h=harness(async()=>{calls++;return Response.json([pair])});await Promise.resolve();
  h.radar.data.providers.dex={next_at:now+1000000,status:'SHARED_COOLDOWN'};
  const db=h.radar.env.DB,original=db.prepare.bind(db);
  db.prepare=sql=>{
   if(sql.includes('FROM leases'))return {bind(){return this},async all(){return {results:[{name:'discovery-provider:dex',expires_at:now+1000000,token:'HTTP_429'}]}}};
   if(sql.includes('FROM runs'))return {async all(){return {results:verified?[{started_at:new Date(now+1000000-1800000).toISOString(),provider_errors:'DEX Screener profiles HTTP 429'}]:[]}}};
   return original(sql);
  };
  await h.radar.tick(now);
  if(verified){assert.equal(calls,1);assert.equal(h.radar.data.quotes.length,1)}
  else{assert.equal(h.radar.data.quotes.length,0);assert.equal(h.radar.data.providers.dex.status,'SHARED_COOLDOWN')}
 }
});
