import test from 'node:test';
import assert from 'node:assert/strict';
import {issuePocketToken,validPocketToken,POCKET_TOKEN_SECONDS} from '../src/pocket-radar-token.mjs';
import {pocketFeed,rankPocketCandidates} from '../src/pocket-radar-feed.mjs';
import {issueSession,sessionCookie} from '../src/auth-session.mjs';
import worker from '../src/viewer.mjs';
const secret='development-test-admin-secret';
const origin='https://example.test';
const mint='So11111111111111111111111111111111111111112';
const pool='4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';
const now=Date.parse('2026-10-27T10:00:00.000Z');
const row={
 asset_key:'solana:'+mint,chain:'solana',address:mint,symbol:'EVIDENCE',pool,
 status:'ALIVE',risk_status:'PARTIAL_ONCHAIN_REVIEW',
 risk_note:'{}',last_seen:new Date(now-6*60_000).toISOString(),
 pool_created:new Date(now-40*60_000).toISOString(),
 price:0.00021,market_cap:105000,liquidity:81000,buys_m5:25,sells_m5:8,
 change_h1:12,score:76
};
function req(path,{method='GET',headers={},body=null}={}){
 return new Request(origin+path,{method,headers,body});
}
test('Device tokens are HMAC authenticated, expire, and are purpose-bound',async()=>{
 const {token,expiresAt}=await issuePocketToken(secret,{now});
 assert.match(token,/^pr1\.\d{10}\.[0-9a-f]{32}\.[0-9a-f]{64}$/);
 assert.equal(await validPocketToken(secret,token,{now:now+1000}),true);
 assert.equal(await validPocketToken(secret+'changed',token,{now}),false);
 assert.equal(await validPocketToken(secret,token.slice(0,-1)+(token.endsWith('f')?'0':'f'),{now}),false);
 assert.equal(await validPocketToken(secret,token,{now:Date.parse(expiresAt)+1000}),false);
 assert.equal(await validPocketToken(secret,token,{now:now-POCKET_TOKEN_SECONDS*1000}),false);
 assert.equal(await validPocketToken(secret,'not-a-token',{now}),false);
});
test('Bounded research shortlist uses GOGET OUR SCORE; unknown buyers and lock remain unverified',()=>{
 const coins=rankPocketCandidates([row],[],{now});
 assert.equal(coins.length,1);
 assert.ok(coins[0].ourScore>=35);
 assert.equal(coins[0].assetKey,'solana:'+mint);
 assert.equal(coins[0].verifiedUniqueBuyers,null);
 assert.equal(coins[0].buyerEvidence,'reported_transactions_only');
 assert.equal(coins[0].lpLockVerified,false);
 assert.equal(coins[0].quoteAgeMinutes,6);
 assert.equal(coins[0].poolAgeMinutes,40);
 assert.equal(coins[0].chartUrl,'https://www.geckoterminal.com/solana/pools/'+pool);
 assert.deepEqual(rankPocketCandidates([{...row,asset_key:'solana:WRONG'}],[],{now}),[]);
 assert.deepEqual(rankPocketCandidates([{...row,last_seen:new Date(now-40*60_000).toISOString()}],[],{now}),[]);
 assert.deepEqual(rankPocketCandidates([{...row,risk_status:'MINT_CONTROL_RISK'}],[],{now}),[]);
 assert.deepEqual(rankPocketCandidates([{...row,pool:'not-a-pool'}],[],{now}),[]);
});
test('Feed SELECTs are bounded, read-only, and never inspect paper account',async()=>{
 const queries=[];
 const db={prepare(sql){
  queries.push(sql);
  return {bind(...params){
   assert.ok(params.length<=90);
   return {all:async()=>({results:queries.length===1?[row]:[]})};
  }};
 }};
 const result=await pocketFeed(db,{now});
 assert.equal(result.schema,'goget-pocket-v1');
 assert.equal(result.sample.assetLimit,80);
 assert.equal(result.sample.eventLimit,360);
 assert.equal(result.coins.length,1);
 assert.equal(queries.length,2);
 assert.ok(queries.every(s=>s.startsWith('SELECT ')));
 assert.ok(queries.every(s=>!/\b(INSERT|DELETE|UPDATE|paper_|DROP)\b/i.test(s)));
 assert.match(queries[0],/LIMIT 80/);
 assert.match(queries[1],/LIMIT 360/);
});
test('Pairing needs authenticated same-origin browser session; token cannot authorize admin routes',async()=>{
 const cookie=sessionCookie(await issueSession(secret)).split(';')[0];
 const env={ADMIN_TOKEN:secret,DB:{prepare(){throw Error('No DB needed for pairing')}}};
 const path='/api/pocket-radar/pair';
 assert.equal((await worker.fetch(req(path,{method:'GET'}),env)).status,405);
 assert.equal((await worker.fetch(req(path,{method:'POST',
  headers:{origin:'https://attacker.test','x-pocket-pair':'1',cookie}}),env)).status,403);
 assert.equal((await worker.fetch(req(path,{method:'POST',
  headers:{origin,'x-pocket-pair':'1',cookie,'sec-fetch-site':'cross-site'}}),env)).status,403);
 assert.equal((await worker.fetch(req(path,{method:'POST',
  headers:{origin,'x-pocket-pair':'1'}}),env)).status,401);
 const paired=await worker.fetch(req(path,{method:'POST',
  headers:{origin,'x-pocket-pair':'1',cookie}}),env);
 assert.equal(paired.status,200);
 const data=await paired.json();
 assert.equal(data.scope,'pocket_radar_read_only');
 assert.equal(await validPocketToken(secret,data.token),true);
 assert.equal((await worker.fetch(req('/api/status',{
  headers:{authorization:'Bearer '+data.token}}),env)).status,401);
 assert.equal((await worker.fetch(req('/api/top5-refresh',{method:'POST',headers:{
  authorization:'Bearer '+data.token,'content-type':'application/json'},
  body:JSON.stringify({stage:'quotes'})}),env)).status,401);
});
test('Read-only feed requires device scope and GET; no database reads for unauthenticated requests',async()=>{
 let calls=0;
 const db={prepare(sql){
  calls++;return {bind(){return {all:async()=>({results:[]})}}};
 }};
 const env={ADMIN_TOKEN:secret,DB:db};
 const url='/api/pocket-radar/feed';
 assert.equal((await worker.fetch(req(url),env)).status,401);
 assert.equal((await worker.fetch(req(url,{headers:{authorization:'Bearer '+secret}}),env)).status,401);
 const {token}=await issuePocketToken(secret);
 assert.equal((await worker.fetch(req(url,{method:'POST',headers:{
  authorization:'Bearer '+token}}),env)).status,405);
 assert.equal(calls,0);
 const answer=await worker.fetch(req(url,{headers:{authorization:'Bearer '+token}}),env);
 assert.equal(answer.status,200);
 assert.equal((await answer.json()).source,'GOGET_D1_RESEARCH');
 assert.equal(calls,1);
});
