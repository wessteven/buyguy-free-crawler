import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {MINUTE_REPLAY_LIMITS as B,assessExactMinuteCandles,requireOriginalOutcome,
 nextMinuteReplayStatus} from '../src/goget-exact-minute-replay.mjs';
const pool='8LJWz8uW51u6kL2XBZ6cKYBngnXCpxQjUZRbwKLfVYp4';
const mint='So11111111111111111111111111111111111111112';
const due='2026-11-05T06:00:30Z',asOf=Date.parse('2026-11-05T07:00:00Z');
const row={mint,bucket:'2026-11-05T05:00:00Z',pool,horizon_min:60,due_at:due,
 status:'MISSING_FUTURE_USD_QUOTE_COVERAGE',reference_price_usd:0.001};
const price=0.00125;
function payload(list){
 return {data:{id:pool,attributes:{ohlcv_list:list}},meta:{base:{address:mint},
  quote:{address:pool}}};
}
const bar=(at,c=price)=>[Math.floor(Date.parse(at)/1000),c,c,c,c,10];
test('the exact original due-pair, status and price cannot be replaced by invented anchors',()=>{
 const ok=requireOriginalOutcome(row,{asOf});
 assert.equal(ok.pool,pool);
 for(const patch of [{pool:'UNKNOWN'},{status:'PENDING'},{reference_price_usd:0},
  {horizon_min:10},{due_at:'2026-11-06T00:00:00Z'}])
  assert.throws(()=>requireOriginalOutcome({...row,...patch},{asOf}),/ORIGINAL_OUTCOME_UNVERIFIED/);
});
test('one-minute window uses ceiling of due timestamp, never pre-due 06:00 price',()=>{
 const x=assessExactMinuteCandles(payload([bar('2026-11-05T06:00:00Z',0.012),
  bar('2026-11-05T06:01:00Z',price),
  bar('2026-11-05T06:04:00Z',price)]),row,{asOf});
 assert.equal(x.status,'RETROSPECTIVE_ONE_MINUTE_USD_CLOSE_MATCH');
 assert.equal(x.matchAt,'2026-11-05T06:01:00.000Z');
 assert.equal(x.closeUsd,price);
 assert.equal(x.expectedOneMinuteCells,10);
 assert.equal(x.observedOneMinuteCells,2);
 assert.equal(x.missingOneMinuteCells,8);
 assert.equal(x.completeOneMinuteSeries,false);
 assert.equal(x.matchedChangePct,25);
 assert.equal(x.originalAsOfMarketOutcomeReplaced,false);
 assert.equal(x.certifiedExecutablePrice,false);
 assert.equal(x.tradeEligible,false);
});
test('a fully sampled expected minute grid is eligible for only window-level continuity proof',()=>{
 const cells=Array.from({length:10},(_,i)=>bar('2026-11-05T06:'+String(i+1).padStart(2,'0')+':00Z'));
 const x=assessExactMinuteCandles(payload(cells),row,{asOf});
 assert.equal(x.completeOneMinuteSeries,true);
 assert.equal(x.missingOneMinuteCells,0);
 assert.equal(x.historicalOnly,true);
});
test('missing post-due minute candle is classified, not interpolated from nearby candles',()=>{
 const x=assessExactMinuteCandles(payload([bar('2026-11-05T06:00:00Z'),
  bar('2026-11-05T06:12:00Z')]),row,{asOf});
 assert.equal(x.status,'NO_POST_DUE_ONE_MINUTE_CANDLE_IN_TEN_MINUTES');
 assert.equal(x.matchAt,null);
 assert.equal(x.missingOneMinuteCells,10);
});
test('duplicates, non-minute-aligned timestamps and wrong original pool rejected',()=>{
 const barTime='2026-11-05T06:01:00Z';
 assert.throws(()=>assessExactMinuteCandles(payload([bar(barTime),bar(barTime)]),
  row,{asOf}),/MINUTE_PROVIDER_SERIES_UNVERIFIED/);
 assert.throws(()=>assessExactMinuteCandles(payload([bar('2026-11-05T06:01:10Z')]),
  row,{asOf}),/MINUTE_PROVIDER_SERIES_UNVERIFIED/);
 assert.throws(()=>assessExactMinuteCandles({data:{id:'not-the-exact-pool',
  attributes:{ohlcv_list:[bar(barTime)]}},meta:{base:{address:mint}}},
  row,{asOf}),/POOL_IDENTITY_MISMATCH/);
});
test('rate limit, transient provider failures and exhausted retries remain explicit',()=>{
 assert.equal(nextMinuteReplayStatus('RATE_LIMITED',1),'RATE_LIMITED_RETRY_PENDING');
 assert.equal(nextMinuteReplayStatus('OTHER',2),'PROVIDER_RETRY_PENDING');
 assert.equal(nextMinuteReplayStatus('OTHER',3),'PROVIDER_RETRY_EXHAUSTED');
 assert.throws(()=>nextMinuteReplayStatus('OTHER',4),/ATTEMPT_INVALID/);
 assert.equal(B.perRunApiCalls,4);
 assert.equal(B.dailyApiCalls,96);
 assert.equal(B.minimumGapMs,8500);
 assert.equal(B.stopUtc,'2026-11-08T00:00:00Z');
});
test('all original missing futures remain in source denominator and original D1 tables immutable',async()=>{
 const script=await readFile('scripts/goget-exact-minute-replay.mjs','utf8');
 const sql=await readFile('sql/goget-exact-minute-replay.sql','utf8');
 assert.match(script,/COUNT\(\*\) AS n FROM goget_pre_signal_market_outcomes/);
 assert.match(script,/ORDER BY o.due_at ASC,o.mint ASC LIMIT 4/);
 assert.match(script,/goget_exact_minute_replay_budget/);
 assert.doesNotMatch(script,/(INSERT INTO|UPDATE|DELETE FROM)\s+(goget_pre_signal_market_outcomes|goget_historical_price_recovery|smart_wallet_)/i);
 assert.doesNotMatch(script,/HELIUS_API_KEY|sendTransaction|signTransaction|privateKey/);
 assert.doesNotMatch(sql,/ALTER TABLE|DROP TABLE|smart_wallet_/i);
});
