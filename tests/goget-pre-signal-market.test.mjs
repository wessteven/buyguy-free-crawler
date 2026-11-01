import test from 'node:test';
import assert from 'node:assert/strict';
import {chooseMarketPairs,chooseExactPoolOutcomes,selectMarketResearchMints,readBoundedJson,MARKET_BOUNDS}
  from '../src/goget-pre-signal-market.mjs';

const mint='3bpm71ztUtB66EsMdYHShV5DLm4wssEfK4YrnKysmoon';
const other='84vc5bnWKH1ndVdKxGpMrqfoEMDBhfkFoV4boYZkoMcu';
const poolA='Gf3HJhA4iJubBpKBLqTXikUT9E3sv6wGhhZ3EahAqQxk';
const poolB='HH3HJhA4iJubBpKBLqTXikUT9E3sv6wGhhZ3EahAqQxk';
const pair=(address,pool,liq=6000,price='0.00001')=>({
 chainId:'solana',pairAddress:pool,dexId:'pumpswap',
 baseToken:{address},quoteToken:{address:'So11111111111111111111111111111111111111112'},
 priceUsd:price,liquidity:{usd:liq},volume:{m5:10000},txns:{m5:{buys:8,sells:4}}
});
test('one batched quote list covers at most eight signals and four controls',()=>{
 const records=[...Array.from({length:12},(_,i)=>({
   mint:mint.slice(0,-2)+String(i+1).padStart(2,'1'),sampleKind:'POTENTIAL_SIGNAL'
 })),{mint:other,sampleKind:'CONTROL'}];
 const chosen=selectMarketResearchMints(records);
 assert.ok(chosen.length<=MARKET_BOUNDS.maxTokenQuery);
 assert.ok(chosen.includes(other));
});
test('chooses exact Solana mint, highest-liquidity pair; route never certified',()=>{
 const result=chooseMarketPairs([
   pair(mint,poolA,10000,'0.001'),pair(mint,poolB,15000,'0.002'),
   {...pair(mint,poolA,1000000),chainId:'bsc'},
   pair(other,poolA,9000,'0.004')
 ],[mint],'2026-11-01T01:00:00Z');
 assert.equal(result.length,1);
 assert.equal(result[0].pool,poolB);
 assert.equal(result[0].priceUsd,0.002);
 assert.equal(result[0].routeProof,false);
 assert.equal(result[0].executionQuote,false);
 assert.equal(result[0].sourceAge,'RECEIPT_TIME_ONLY');
});
test('future outcomes require same pool, never mint-only price from an unrelated pair',()=>{
 const selected=chooseExactPoolOutcomes([pair(mint,poolA,10000,'0.001'),
   pair(mint,poolB,15000,'0.009')],[poolA],'2026-11-01T01:06:00Z');
 assert.equal(selected.size,1);
 assert.equal(selected.get(poolA).priceUsd,0.001);
 assert.equal(selected.get(poolB),undefined);
});
test('rejects invalid/oversize provider shapes and invalid quote values',()=>{
 assert.throws(()=>chooseMarketPairs({},[mint],new Date().toISOString()),/SHAPE/);
 assert.throws(()=>chooseMarketPairs(Array(1501).fill(null),[mint],new Date().toISOString()),/SHAPE/);
 assert.equal(chooseMarketPairs([pair(mint,poolA,10000,'0')],[mint],new Date().toISOString()).length,0);
});
test('streams a size-bounded provider response',async()=>{
 const small=new Response(JSON.stringify([pair(mint,poolA)]),{headers:{'content-type':'application/json'}});
 assert.equal((await readBoundedJson(small)).length,1);
 const over=new Response('x'.repeat(101),{headers:{'content-length':'101'}});
 await assert.rejects(()=>readBoundedJson(over,100),/DEX_RESPONSE_TOO_LARGE/);
});
