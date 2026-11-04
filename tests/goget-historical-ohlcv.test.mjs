import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHistoricalOhlcv,matchHistoricOutcome,HISTORY_BOUNDS} from '../src/goget-historical-ohlcv.mjs';
const mint='5'.repeat(44),pool='7'.repeat(44);
const unix=Math.floor(Date.parse('2026-11-03T12:05:00Z')/1000);
const payload=(records,meta={base:{address:mint},quote:{address:'6'.repeat(44)}})=>({
 data:{id:'solana_'+pool,attributes:{ohlcv_list:records}},
 meta
});
const candle=(at,p)=>[at,p,p*1.01,p*.99,p,1000];
test('recover only historical candle starting after the recorded due timestamp',()=>{
 const o=parseHistoricalOhlcv(payload([
  candle(unix,1.0),candle(unix+60,1.1),candle(unix+180,1.2)]),{mint,pool});
 assert.equal(o.candles.length,3);
 const d={due_at:'2026-11-03T12:05:29Z',reference_price_usd:1.0};
 const m=matchHistoricOutcome(d,o.candles);
 assert.equal(m.status,'HISTORICAL_INDICATIVE_OHLCV_MATCH');
 assert.equal(m.candleAt,'2026-11-03T12:06:00.000Z');
 assert.equal(m.changePct,10);
 assert.match(m.sourceKind,/NOT_FORWARD_OBSERVED/);
});
test('accepts GeckoTerminal UUID data.id only with exact requested pool path and mint in metadata',()=>{
 const obj=payload([candle(unix+60,1.1)]);
 obj.data.id='9e8e222d-13a8-4608-8e7e-003b16a29b1b';
 const parsed=parseHistoricalOhlcv(obj,{mint,pool});
 assert.equal(parsed.validatedMintFromMetadata,true);
 assert.equal(parsed.validatedPoolFromEndpoint,true);
 assert.equal(matchHistoricOutcome({due_at:'2026-11-03T12:05:29Z',
   reference_price_usd:1},parsed.candles).status,'HISTORICAL_INDICATIVE_OHLCV_MATCH');
});
test('must not backfill price from before signal due or outside 10 minute tolerance',()=>{
 const o=parseHistoricalOhlcv(payload([
  candle(unix,0.9),candle(unix+12*60,1.5)]),{mint,pool});
 const m=matchHistoricOutcome({due_at:'2026-11-03T12:05:29Z',reference_price_usd:1},o.candles);
 assert.equal(m.status,'NO_POST_DUE_CANDLE_IN_WINDOW');
 assert.equal(m.changePct,null);
});
test('reject wrong mint, wrong pool, nonsensical price and oversized history',()=>{
 assert.throws(()=>parseHistoricalOhlcv(payload([candle(unix,1)],{base:{address:'9'.repeat(44)},quote:{address:'6'.repeat(44)}}),{mint,pool}),/MINT_IDENTITY_UNVERIFIED/);
 assert.throws(()=>parseHistoricalOhlcv({data:{id:'solana_'+'8'.repeat(44),attributes:{ohlcv_list:[]}},meta:{base:{address:mint}}},{mint,pool}),/POOL_IDENTITY_MISMATCH/);
 assert.throws(()=>parseHistoricalOhlcv(payload([[unix,1,1,0,0,1000]]),{mint,pool}),/INVALID_CANDLE_VALUE/);
 assert.throws(()=>parseHistoricalOhlcv(payload(Array(HISTORY_BOUNDS.maxCandles+1).fill(candle(unix,1))),{mint,pool}),/HISTORICAL_CANDLE_RESPONSE_INVALID/);
 assert.throws(()=>matchHistoricOutcome({due_at:'unknown',reference_price_usd:1},[]),/INVALID_OUTCOME_ANCHOR/);
});
