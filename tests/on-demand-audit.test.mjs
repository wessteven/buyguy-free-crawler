import test from 'node:test';
import assert from 'node:assert/strict';
import {runTokenAuditStage,STAGES,COOLDOWNS} from '../src/on-demand-audit.mjs';
import {issueSession,sessionCookie} from '../src/auth-session.mjs';
import worker from '../src/viewer.mjs';
const mint='So11111111111111111111111111111111111111112';
const key='solana:'+mint;
const now='2026-10-19T08:00:00.000Z';
const asset={asset_key:key,chain:'solana',address:mint,symbol:'WTEST',status:'STATIC',
  first_seen:now,last_seen:'2026-10-19T07:00:00.000Z',price:0.002,liquidity:10000,
  risk_status:'UNVERIFIED',pool:'OLD_POOL',score:30,has_position:0};
function dbFake(row=asset){
 const leases=new Map(),events=[],batches=[];
 return {
   leases,events,batches,
   prepare(sql){return {
     bind(...args){const statement={sql,args,
       async first(){
         if(sql.startsWith('SELECT a.*'))return row;
         if(sql.includes('SELECT expires_at FROM leases'))return {expires_at:leases.get(args[0])?.expires_at||0};
         return null;
       },
       async run(){
         if(sql.startsWith('INSERT INTO leases')){
           const [name,expires_at,token,clock]=args,prior=leases.get(name);
           if(prior&&prior.expires_at>clock)return {meta:{changes:0}};
           leases.set(name,{expires_at,token});return {meta:{changes:1}};
         }
         if(sql.includes('INSERT INTO research_events'))events.push({sql,args});
         return {meta:{changes:1}};
       }};return statement;}
   }},
   async batch(sql){batches.push(sql);return sql.map(()=>({meta:{changes:1}}))}
 };
}
test('Stage list is bounded and cool-down enforced per exact token + stage',async()=>{
 assert.deepEqual(STAGES,['market','mint','pool','route']);
 assert.ok(COOLDOWNS.market>=60);
 const DB=dbFake();
 const unavailable=async()=>({ok:false,status:429});
 const env={DB};
 const first=await runTokenAuditStage(env,{assetKey:key,stage:'market',now,fetcher:unavailable});
 assert.equal(first.httpStatus,200);
 assert.equal(first.status,'RATE_LIMITED');
 assert.equal(DB.batches.length,0);
 const again=await runTokenAuditStage(env,{assetKey:key,stage:'market',now,fetcher:unavailable});
 assert.equal(again.httpStatus,429);
 assert.equal(again.status,'COOLDOWN');
 assert.ok(again.retryAfterSeconds>0);
 const distinct=await runTokenAuditStage(env,{assetKey:key,stage:'pool',now});
 assert.equal(distinct.stage,'pool');
 assert.equal(distinct.status,'SKIPPED');
});
test('Per-token market call refreshes exact mint only and persists D1 observation',async()=>{
 const DB=dbFake();
 let called=0,endpoint='';
 const fetcher=async(url)=>{called++;endpoint=url;return {ok:true,json:async()=>[{
   chainId:'solana',pairAddress:'NewValidPool',baseToken:{address:mint,symbol:'WTEST'},
   priceUsd:'0.007',liquidity:{usd:65000},marketCap:75000,
   txns:{m5:{buys:27,sells:11}},volume:{h24:85000},
   priceChange:{h1:18},info:{socials:[{type:'twitter',url:'https://x.com/example'}]}
 }]}};
 const result=await runTokenAuditStage({DB},{assetKey:key,stage:'market',now,fetcher});
 assert.equal(called,1);
 assert.equal(endpoint,'https://api.dexscreener.com/tokens/v1/solana/'+mint);
 assert.equal(result.status,'UPDATED');
 assert.equal(result.priceUsd,0.007);
 assert.equal(DB.batches.length,1);
 assert.ok(DB.batches[0].some(q=>q.sql.includes('UPDATE assets SET symbol=')&&q.args.includes(key)));
 assert.ok(DB.batches[0].some(q=>q.sql.includes('INSERT OR IGNORE INTO observations')));
 assert.ok(DB.events.some(e=>e.args.includes('ON_DEMAND_AUDIT')));
});
test('No matching base token or illiquid quote cannot overwrite stale observations',async()=>{
 const DB=dbFake();
 const r=await runTokenAuditStage({DB},{assetKey:key,stage:'market',now,
   fetcher:async()=>({ok:true,json:async()=>[{
     chainId:'solana',pairAddress:'OTHER_POOL',
     baseToken:{address:'SysvarRent111111111111111111111111111111111'},
     priceUsd:'1',liquidity:{usd:900000}
   }]})});
 assert.equal(r.status,'UNAVAILABLE');
 assert.equal(DB.batches.length,0);
});
test('Exact contract required; nonexistent, wrong chain, missing DB or stage fail closed',async()=>{
 const DB=dbFake(null);
 assert.equal((await runTokenAuditStage({DB},{assetKey:'solana:bad',stage:'market'})).httpStatus,422);
 assert.equal((await runTokenAuditStage({DB},{assetKey:key,stage:'hack'})).httpStatus,422);
 assert.equal((await runTokenAuditStage({DB},{assetKey:key,stage:'market'})).httpStatus,404);
 assert.equal((await runTokenAuditStage({}, {assetKey:key,stage:'market'})).httpStatus,503);
});
test('Skipped pool and route do not make stale price, LP lock or executable sale claims',async()=>{
 const DB=dbFake();
 const market=await runTokenAuditStage({DB},{assetKey:key,stage:'pool',now});
 const route=await runTokenAuditStage({DB},{assetKey:key,stage:'route',now});
 assert.equal(market.status,'SKIPPED');
 assert.equal(route.status,'SKIPPED');
 assert.equal(DB.batches.length,0);
 assert.ok(DB.events.every(e=>e.args[2]==='ON_DEMAND_AUDIT'));
});
test('Robinhood remains market-only until on-chain provider is actually available',async()=>{
 const rh='0x2cc0fac44b8252f6b10208b091aff2c94b4da77d',id='robinhood:'+rh;
 const row={...asset,asset_key:id,chain:'robinhood',address:rh};
 const DB=dbFake(row);
 for(const stage of ['mint','pool','route']){
   const r=await runTokenAuditStage({DB},{assetKey:id,stage,now});
   assert.equal(r.status,'UNSUPPORTED');
 }
 assert.equal(DB.batches.length,0);
});
const base='https://buyguy-free-radar.wessteven.workers.dev';
const secret='on-demand-audit-test-secret-do-not-use-for-live';
test('Audit endpoint requires same-origin authenticated session and JSON POST',async()=>{
 const DB=dbFake(),env={DB,ADMIN_TOKEN:secret};
 const create=(args,headers={})=>new Request(base+'/api/audit',{method:'POST',
   headers:{'content-type':'application/json',...headers},body:JSON.stringify(args)});
 const body={assetKey:key,stage:'pool'};
 const anon=await worker.fetch(create(body),env);
 assert.equal(anon.status,401);
 const session=await issueSession(secret),cookie=sessionCookie(session).split(';')[0];
 const ok=await worker.fetch(create(body,{cookie,origin:base}),env);
 assert.equal(ok.status,200);
 assert.equal((await ok.json()).status,'SKIPPED');
 const badOrigin=await worker.fetch(create(body,{cookie,origin:'https://evil.example'}),env);
 assert.equal(badOrigin.status,403);
 const badSite=await worker.fetch(create(body,{cookie,'sec-fetch-site':'cross-site'}),env);
 assert.equal(badSite.status,403);
 const repeat=await worker.fetch(create(body,{cookie,origin:base}),env);
 assert.equal(repeat.status,429);
 assert.ok(Number(repeat.headers.get('retry-after'))>0);
 const method=await worker.fetch(new Request(base+'/api/audit',{headers:{cookie}}),env);
 assert.equal(method.status,405);
});
