import test from 'node:test';
import assert from 'node:assert/strict';
import {screenTradeRoutes} from '../src/route-ops.mjs';
const mint='So11111111111111111111111111111111111111112';
const key='solana:'+mint;
const usdc='EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
test('Jupiter route stage keeps D1 evidence only, never certifies or trades',async()=>{
  const writes=[],urls=[];
  const DB={prepare(sql){return {bind(...args){return {sql,args,
    async all(){return {results:[{asset_key:key,address:mint,score:85}]};},
    async run(){writes.push({sql,args});}
  }}}}};
  const fetcher=async url=>{
    urls.push(url);
    return {ok:true,json:async()=>urls.length===1?{
      inputMint:usdc,outputMint:mint,inAmount:'40000000',outAmount:'350000000',
      routePlan:[{swapInfo:{}}],priceImpactPct:'0.001'
    }:{
      inputMint:mint,outputMint:usdc,inAmount:'350000000',outAmount:'39000000',
      routePlan:[{swapInfo:{}}],priceImpactPct:'0.001'
    }};
  };
  // Real run respects rate limit; tests can pass injected route implementation only by
  // intercepting the wait with a fast scheduler? Cost is acceptable: 2.2s.
  const r=await screenTradeRoutes({DB},{
    now:'2026-10-19T00:00:00Z',fetcher});
  assert.equal(r.checked,1);assert.equal(r.success,1);
  assert.equal(writes.length,1);
  assert.match(writes[0].sql,/INSERT INTO research_events/);
  assert.ok(writes[0].args[2].includes('"paperEligible":false'));
  assert.equal(urls.length,2);
  assert.ok(urls.every(x=>x.includes('/quote?')));
});
test('Unavailable Jupiter does not fabricate route or promote paper trading',async()=>{
 const rows=[],db={prepare(sql){return {bind(...args){return {
  async all(){return {results:[{asset_key:key,address:mint}]}},
  async run(){rows.push(args)}
 }}}}};
 const result=await screenTradeRoutes({DB:db},{
  now:'2026-10-19T00:00:00Z',fetcher:async()=>({ok:false,status:429})});
 assert.equal(result.checked,1);assert.equal(result.success,0);
 assert.ok(rows[0][2].includes('QUOTE_PROVIDER_UNAVAILABLE'));
});
