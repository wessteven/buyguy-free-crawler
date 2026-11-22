import test from 'node:test';
import assert from 'node:assert/strict';
import {assessCapacityAnalytics} from '../src/goget-capacity-analytics.mjs';
const response=groups=>({data:{viewer:{accounts:[{d1AnalyticsAdaptiveGroups:groups}]}}});
test('GraphQL errors and absent or empty evidence cannot certify zero usage',()=>{
 for(const r of [{errors:[{message:'PRIVATE'}]}, {},response([])]){
   const a=assessCapacityAnalytics(r);assert.notEqual(a.status,'AVAILABLE');assert.equal(a.totals,undefined);
   assert.ok(!JSON.stringify(a).includes('PRIVATE'));
 }
});
test('partial fields stay unknown; positive and measured zero totals remain evidence',()=>{
 const partial=assessCapacityAnalytics(response([{sum:{rowsRead:2}},{sum:{rowsRead:3}}]));
 assert.equal(partial.status,'PARTIAL_ANALYTICS_FIELDS');assert.equal(partial.totals.rowsRead,5);
 assert.equal(partial.totals.rowsWritten,null);
 const a=assessCapacityAnalytics(response([{sum:{rowsRead:2,rowsWritten:0,readQueries:1,writeQueries:0}}]));
 assert.equal(a.status,'AVAILABLE');assert.equal(a.totals.rowsWritten,0);
});
