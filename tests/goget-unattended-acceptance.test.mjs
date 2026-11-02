import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateUnattendedReport} from '../src/goget-unattended-acceptance.mjs';
const now=Date.parse('2026-11-02T09:15:50Z');
const iso=n=>new Date(n).toISOString();
function report({latestHealthy=true,observed=864,eligible=864,degraded=0,uninstrumented=0,
  capped=false,gate='SAMPLED_EVIDENCE_WINDOW_COMPLETE',lastCheck=now-300000,
  windowEnd=now-50000}={}){
  return {latest:{ok:latestHealthy,asOf:iso(lastCheck)},window:{
    hours:72,expectedSlots:864,observedSlots:observed,missingSlots:864-observed,
    eligibleSlots:eligible,degradedSlots:degraded,uninstrumentedSlots:uninstrumented,
    duplicateRuns:0,readCapped:capped,observationGate:gate,
    from:iso(windowEnd-72*3600000),to:iso(windowEnd)}};
}
test('healthy latest run alone is not enough: must complete all 864 five-minute slots',()=>{
  const r=evaluateUnattendedReport(report({observed:358,eligible:0,uninstrumented:358,gate:'INCOMPLETE'}),{now});
  assert.equal(r.status,'INCOMPLETE');
  assert.ok(r.reasons.includes('WINDOW_MISSING_SLOTS'));
  assert.ok(r.reasons.includes('WINDOW_UNINSTRUMENTED_SLOTS'));
});
test('a fully sampled 72-hour window passes only a sampled evidence gate',()=>{
  const r=evaluateUnattendedReport(report(),{now});
  assert.equal(r.status,'SAMPLED_WINDOW_PASS');
  assert.equal(r.sampled72hComplete,true);
  assert.equal(r.continuousCoverageVerified,false);
});
test('stale or failed live checks block an otherwise complete historic window',()=>{
  for(const p of [{latestHealthy:false},{lastCheck:now-20*60000},{lastCheck:now+1}]){
    assert.equal(evaluateUnattendedReport(report(p),{now}).status,'INCOMPLETE');
  }
});
test('stale window, capped D1 read, or degraded slot prevents acceptance',()=>{
  const cases=[{windowEnd:now-20*60000},{capped:true,gate:'INCOMPLETE'},
    {eligible:863,degraded:1,gate:'INCOMPLETE'}];
  for(const p of cases)assert.equal(evaluateUnattendedReport(report(p),{now}).status,'INCOMPLETE');
});
test('counter mismatches and a contradictory complete claim fail closed',()=>{
  const wrong=report();wrong.window.eligibleSlots=863;
  assert.throws(()=>evaluateUnattendedReport(wrong,{now}),/COUNTERS_INCONSISTENT/);
  assert.throws(()=>evaluateUnattendedReport(report({observed:863,eligible:863}),{now}),/GATE_CONTRADICTS_COUNTS/);
});
test('missing values and incorrect 72-hour boundaries fail closed',()=>{
  assert.throws(()=>evaluateUnattendedReport({}, {now}),/SHAPE_UNVERIFIED/);
  const p=report();p.window.from=iso(now-3600000);
  assert.throws(()=>evaluateUnattendedReport(p,{now}),/COUNTERS_INCONSISTENT/);
});
