import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewRecoveredEvidence} from '../src/goget-historical-recovery-review.mjs';
const stamp='2026-11-03T12:05:29.000Z';
function outcome(mint,kind,horizon,close,bucket='2026-11-03T12:00:00.000Z'){
 return {mint,bucket,horizon_min:horizon,due_at:stamp,
 pool:'7'.repeat(44),original_pool:'7'.repeat(44),
 reference_price_usd:1,original_reference_price_usd:1,
 historical_candle_close_usd:close,
 historical_change_pct:(close-1)*100,
 historical_candle_at:'2026-11-03T12:06:00.000Z',
 sample_kind:kind,snapshot_kind:kind,
 original_status:'MISSING_FUTURE_USD_QUOTE_COVERAGE',
 source:'GECKOTERMINAL_HISTORICAL_1M_USD'};
}
const coverage=[
{sample_kind:'POTENTIAL_SIGNAL',horizon_min:5,missing_count:3,recovered_count:1},
{sample_kind:'CONTROL',horizon_min:5,missing_count:4,recovered_count:2}
];
test('audit distinguishes historical matches, non-independent events and real missing coverage',()=>{
 const s=outcome('5'.repeat(44),'POTENTIAL_SIGNAL',5,1.25);
 const c=outcome('6'.repeat(44),'CONTROL',5,.9);
 const c2=outcome('8'.repeat(44),'CONTROL',5,1.1);
 const report=reviewRecoveredEvidence({rows:[s,c,c2],coverage,asOf:'2026-11-04T07:50:00Z',
 wallets:[{wallet:'4'.repeat(44),tx_type:'SWAP',n:8,self_fee_payer:3}]});
 assert.equal(report.totalOriginalMissing,7);
 assert.equal(report.totalHistoricalRecovered,3);
 assert.equal(report.stillMissing,4);
 assert.equal(report.validRecoveredRows,3);
 assert.equal(report.recoveryPct,42.9);
 assert.equal(report.horizonBands[0].medianChangePct,25);
 assert.equal(report.horizonBands[0].firstMintObservations,1);
 assert.equal(report.horizonBands[1].medianChangePct,0);
 assert.equal(report.timeMatchedComparisons[0].matchedFiveMinuteBuckets,1);
 assert.equal(report.timeMatchedComparisons[0].medianBucketSignalMinusControlPct,25);
 assert.equal(report.replayWalletCount,1);
 assert.equal(report.providerCalls,0);
 assert.equal(report.realTrades,0);
});
test('wrong pool, future window, reference mismatch and changed forward labels rejected',()=>{
 const a=outcome('5'.repeat(44),'POTENTIAL_SIGNAL',5,2);
 const b={...a,mint:'6'.repeat(44),original_pool:'8'.repeat(44)};
 const c={...a,mint:'8'.repeat(44),historical_candle_at:'2026-11-03T12:04:00Z'};
 const d={...a,mint:'9'.repeat(44),original_reference_price_usd:3};
 const e={...a,mint:'A'.repeat(44),original_status:'OBSERVED_SAME_POOL_USD_PRICE'};
 const f={...a,mint:'B'.repeat(44),historical_change_pct:100000};
 const report=reviewRecoveredEvidence({rows:[a,b,c,d,e,f]});
 assert.equal(report.validRecoveredRows,1);
 assert.equal(report.invalidRecoveredRows,5);
 assert.deepEqual(new Set(report.rejected.map(r=>r.reason)),new Set([
   'POOL_IDENTITY_MISMATCH','CANDLE_TIME_OUTSIDE_HORIZON',
   'REFERENCE_MISMATCH','FORWARD_STATUS_MUTATED_OR_NOT_MISSING',
   'RECORDED_PERCENT_MISMATCH']));
});
test('repeat sightings of the same mint do not create independent first-mint performance',()=>{
 const a=outcome('5'.repeat(44),'POTENTIAL_SIGNAL',5,1.2);
 const b=outcome('5'.repeat(44),'POTENTIAL_SIGNAL',5,.8,'2026-11-03T12:10:00.000Z');
 const report=reviewRecoveredEvidence({rows:[a,b]});
 assert.equal(report.horizonBands[0].records,2);
 assert.equal(report.horizonBands[0].uniqueMints,1);
 assert.equal(report.horizonBands[0].firstMintObservations,1);
 assert.equal(report.horizonBands[0].firstMintMedianPct,20);
});
test('strict bounded source input and asOf validation',()=>{
 assert.throws(()=>reviewRecoveredEvidence({rows:Array(501).fill({})}),/AUDIT_BOUNDED_INPUT_REQUIRED/);
 assert.throws(()=>reviewRecoveredEvidence({asOf:'broken'}),/ASOF_INVALID/);
});
