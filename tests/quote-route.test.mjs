import test from 'node:test';
import assert from 'node:assert/strict';
import {USDC,assessRoundTrip,getRoundTripQuotes} from '../src/quote-route.mjs';
const mint='So11111111111111111111111111111111111111112';
const buy={inputMint:USDC,outputMint:mint,inAmount:'40000000',outAmount:'250000000',
 priceImpactPct:'0.002',routePlan:[{swapInfo:{label:'Sample AMM'}}]};
const sell={inputMint:mint,outputMint:USDC,inAmount:'250000000',outAmount:'38800000',
 priceImpactPct:'0.001',routePlan:[{swapInfo:{label:'Sample AMM'}}]};
test('USDC roundtrip quote can screen both directions, but is not an executable trade',()=>{
 const r=assessRoundTrip(buy,sell);
 assert.equal(r.label,'BOTH_DIRECTIONS_QUOTED');
 assert.equal(r.buyRoute,true);
 assert.equal(r.sellRoute,true);
 assert.equal(r.estimatedRoundTripLossPct,3);
 assert.match(r.note,/indicative only/);
});
test('Route missing or enormous price impact always fails closed',()=>{
 assert.equal(assessRoundTrip(buy,null).label,'NO_ROUTE_EVIDENCE');
 assert.equal(assessRoundTrip(buy,{...sell,routePlan:[]}).sellRoute,false);
 assert.equal(assessRoundTrip({...buy,priceImpactPct:'0.12'},sell).label,'ROUTE_CAUTION');
 assert.equal(assessRoundTrip(buy,{...sell,outAmount:'33000000'}).label,'ROUTE_CAUTION');
});
test('Read-only checks make two GET quote requests, never POST or trade',async()=>{
 const urls=[];
 const res=await getRoundTripQuotes(mint,{wait:async()=>{},fetcher:async(u,opt)=>{
  urls.push({url:u,opts:opt});
  return {ok:true,json:async()=>urls.length===1?buy:sell};
 }});
 assert.equal(res.label,'BOTH_DIRECTIONS_QUOTED');
 assert.equal(urls.length,2);
 assert.ok(urls.every(x=>x.opts.method===undefined));
 assert.ok(urls.every(x=>x.url.includes('/quote?')));
 assert.equal(new URL(urls[1].url).searchParams.get('amount'),buy.outAmount);
});
test('Provider authentication/rate-limit errors propagate without inventing evidence',async()=>{
 await assert.rejects(getRoundTripQuotes(mint,{fetcher:async()=>({ok:false,status:429})}),/429/);
});
