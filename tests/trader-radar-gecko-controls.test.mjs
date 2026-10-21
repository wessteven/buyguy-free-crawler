import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeGeckoPoolOHLCV,joinHistoricalLiquidity} from '../src/trader-radar-gecko-candles.mjs';
import {matchContemporaneousControls,evaluateMatchedQuoteOutcomes} from '../src/trader-radar-matched-controls.mjs';
const mint='Cbkg5w7V7W2J2sUmecnyN825CbvwvXwasfhduVtNpump';
const control='6MBf1XdZNSAaDKcxxbnCAngRUxBmwbHS5Ybe2rLRpump';
const pool='YQ4NNeQxHAtdcB8ohx21eJ9U8eTzxNRvGNHkRaA4Pnw';
const controlPool='AH75Bn6QHSt5K2Ad4p1otns3JTwpSJWZTwiwKWNhmnKx';
const at='2026-10-21T05:20:00Z',asOf='2026-10-21T06:20:00Z';
const payload={data:{id:'solana_'+pool+'_minute_1',attributes:{ohlcv_list:[
 [Math.floor(Date.parse('2026-10-21T05:20:00Z')/1000),'0.0001','0.00011','0.00009','0.000105','999'],
 [Math.floor(Date.parse('2026-10-21T05:35:00Z')/1000),'0.0002','0.00022','0.00018','0.00021','1200']
]}},meta:{base:{address:mint},quote:{address:'So11111111111111111111111111111111111111112'}}};
test('candles are interval observations not executable price quotes',()=>{
 const r=normalizeGeckoPoolOHLCV(payload,{mint,pool,asOf});
 assert.equal(r.bars.length,2);
 assert.equal(r.executionQuotes.length,0);
 assert.equal(r.bars[0].closeAt,'2026-10-21T05:21:00.000Z');
 assert.equal(r.bars[0].historicalLiquidityUsd,null);
 assert.equal(r.bars[0].executablePriceVerified,false);
});
test('mismatched pool/mint, invalid OHLC and future bars never become prices',()=>{
 assert.equal(normalizeGeckoPoolOHLCV(payload,{mint:control,pool,asOf}).bars.length,0);
 assert.equal(normalizeGeckoPoolOHLCV(payload,{mint,pool:controlPool,asOf}).bars.length,0);
 assert.equal(normalizeGeckoPoolOHLCV(payload,{mint,pool,asOf:'2026-10-21T05:19:00Z'}).bars.length,0);
 const bad=structuredClone(payload);bad.data.attributes.ohlcv_list[0][2]='0.00008';
 assert.equal(normalizeGeckoPoolOHLCV(bad,{mint,pool,asOf}).bars.length,1);
});
test('present-day liquidity must not be imported backwards into a historical bar',()=>{
 const candles=normalizeGeckoPoolOHLCV(payload,{mint,pool,asOf}).bars;
 const after={pool,mint,at:'2026-10-21T05:25:00Z',liquidityUsd:25000,observationType:'HISTORICAL_POOL_LIQUIDITY'};
 assert.equal(joinHistoricalLiquidity(candles,[after])[0].historicalLiquidityUsd,null);
 const before={...after,at:'2026-10-21T05:20:30Z'};
 const aligned=joinHistoricalLiquidity(candles,[before]);
 assert.equal(aligned[0].historicalLiquidityUsd,25000);
 assert.equal(aligned[0].usableForExecutionBacktest,false);
});
const signal={mint,pool,observedAt:at,ageMinutes:10,marketCapUsd:120000,liquidityUsd:30000,
 poolProtocol:'PUMPSWAP',eligibleResearchSignal:true,independenceVerified:true};
const universe=[{mint:control,pool:controlPool,recordedAt:'2026-10-21T05:18:00Z',chain:'solana',
 poolProtocol:'PUMPSWAP',ageMinutes:13,marketCapUsd:130000,liquidityUsd:32000}];
test('controls require contemporaneous same-protocol evidence and prior recording',()=>{
 const result=matchContemporaneousControls([signal],universe,{asOf});
 assert.equal(result.matches.length,1);
 assert.equal(result.matches[0].controlMint,control);
 assert.equal(result.alphaEstablished,false);
 const late=matchContemporaneousControls([signal],[{...universe[0],recordedAt:'2026-10-21T05:21:00Z'}],{asOf});
 assert.equal(late.matches.length,0);
});
test('control selection rejects unknown caps, invalid age or mismatched pool protocol',()=>{
 assert.equal(matchContemporaneousControls([signal],[{...universe[0],poolProtocol:'RAYDIUM'}],{asOf}).matches.length,0);
 assert.equal(matchContemporaneousControls([signal],[{...universe[0],liquidityUsd:null}],{asOf}).matches.length,0);
});
test('missing historical quotes cannot fabricate matched alpha',()=>{
 const matches=matchContemporaneousControls([signal],universe,{asOf}).matches;
 const result=evaluateMatchedQuoteOutcomes(matches,[],{asOf});
 assert.equal(result.pairsAttempted,1);
 assert.equal(result.pairsWithBothReturns,0);
 assert.equal(result.meanGrossDifferencePct,null);
 assert.equal(result.alphaEstablished,false);
});
test('matched gross returns remain research-only, with latency and no automatic trades',()=>{
 const m=matchContemporaneousControls([signal],universe,{asOf}).matches;
 const q=(mint,pool,minutes,price)=>({mint,pool,
  at:new Date(Date.parse(at)+minutes*60000).toISOString(),priceUsd:price,liquidityUsd:30000});
 const quotes=[q(mint,pool,1,.0001),q(mint,pool,16,.00012),
  q(control,controlPool,1,.0001),q(control,controlPool,16,.00011)];
 const x=evaluateMatchedQuoteOutcomes(m,quotes,{asOf});
 assert.equal(x.pairsWithBothReturns,1);
 assert.equal(x.pairs[0].differencePct,10);
 assert.equal(x.alphaEstablished,false);
 assert.equal(x.automaticTradeAllowed,false);
});

test('opaque GeckoTerminal UUID series must have exact endpoint provenance and base-mint match',()=>{
 const revised=structuredClone(payload);
 revised.data.id='a193180e-20c4-4c7a-a0a6-19f65738e2f3';
 revised.data.type='ohlcv';
 assert.equal(normalizeGeckoPoolOHLCV(revised,{mint,pool,asOf}).bars.length,0);
 assert.equal(normalizeGeckoPoolOHLCV(revised,{mint,pool,asOf,endpointPoolExact:true}).bars.length,2);
 assert.equal(normalizeGeckoPoolOHLCV(revised,{mint:control,pool,asOf,endpointPoolExact:true}).bars.length,0);
});
