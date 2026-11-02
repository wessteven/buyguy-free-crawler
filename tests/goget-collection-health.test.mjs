import test from 'node:test';
import assert from 'node:assert/strict';
import {COLLECTION_LIMITS,assessCollectionSample,readCollectionSample,
  latestCollectionStatus,readLatestCollectionStatus,summarizeCollectionWindow}
  from '../src/goget-collection-health.mjs';
const now=Date.parse('2026-11-02T07:00:00Z'),iso=n=>new Date(n).toISOString();
const sample=(age=60000,archived=1)=>[{signature:'one',observed_at:iso(now-age),raw_archived:archived}];
const run=(at=now-300000,overrides={})=>({run_id:String(at),at:iso(at),trigger:'cron',status:'OK',
  summary_json:JSON.stringify({collectionHealth:assessCollectionSample([
    {signature:'one',observed_at:iso(at-60000),raw_archived:1}],{now:at})}),...overrides});
test('quiet receipts require investigation and do not establish an inactive provider',()=>{
  const r=assessCollectionSample(sample(86400000),{now});
  assert.deepEqual(r.reasons,['NO_RECENT_SOURCE_RECEIPTS']);
  assert.equal(r.providerRegistration,'NOT_VERIFIED_BY_RECEIPTS');
  assert.equal(r.status,'REQUIRES_ATTENTION');
  assert.ok(assessCollectionSample([],{now}).reasons.includes('NO_SOURCE_RECEIPTS'));
});
test('raw coverage deduplicates exact signatures across watched wallets',()=>{
  const r=assessCollectionSample([...sample(),...sample(),
    {signature:'two',observed_at:iso(now-120000),raw_archived:0}],{now});
  assert.deepEqual(r.archiveSample,{receiptRows:3,uniqueSignatures:2,
    archivedSignatures:1,missingSignatures:1,bounded:true});
  assert.ok(r.reasons.includes('INCOMPLETE_RAW_ARCHIVE_SAMPLE'));
});
test('fresh complete samples do not certify population coverage',()=>{
  const r=assessCollectionSample(sample(),{now});
  assert.equal(r.status,'FRESH_RECEIPTS_ARCHIVE_SAMPLED');
  assert.equal(r.populationCoverage,'NOT_PROVEN');
});
test('invalid sample shape, conflicting duplicates and future timestamps fail closed',()=>{
  for(const rows of [[{...sample()[0],observed_at:iso(now+1)}],
    [{...sample()[0],raw_archived:null}],[...sample(),...sample(60000,0)],
    Array.from({length:201},()=>sample()[0])])
    assert.throws(()=>assessCollectionSample(rows,{now}),/SAMPLE_INVALID/);
});
test('pilot deadline is a collection blocker even with fresh receipts',()=>{
  const at=Date.parse(COLLECTION_LIMITS.pilotDeadline);
  const r=assessCollectionSample([{signature:'one',observed_at:iso(at-1000),raw_archived:1}],{now:at});
  assert.ok(r.reasons.includes('SOURCE_PILOT_EXPIRED'));
});
test('bounded D1 errors become explicit unknown evidence',async()=>{
  const db={prepare(){return {bind(){return {all(){throw Error('secret material must not escape')}}}}}};
  const r=await readCollectionSample(db,{now});
  assert.equal(r.status,'UNVERIFIED');
  assert.ok(!JSON.stringify(r).includes('secret material'));
  assert.equal((await readLatestCollectionStatus(db,{now})).ok,false);
});
test('current status recomputes receipt freshness and checks scheduler age',()=>{
  assert.equal(latestCollectionStatus(run(now-300000),{now}).ok,true);
  const stale=latestCollectionStatus(run(now-20*60000),{now});
  assert.equal(stale.ok,false);
  assert.ok(stale.reasons.includes('COLLECTION_CHECK_STALE'));
  assert.ok(stale.reasons.includes('NO_RECENT_SOURCE_RECEIPTS'));
  assert.equal(latestCollectionStatus(run(now+1),{now}).ok,false);
  assert.equal(latestCollectionStatus(run(now-1000,{summary_json:'bad'}),{now}).ok,false);
});
test('legacy OK runs cannot pass an uninstrumented 72-hour window',()=>{
  const r=summarizeCollectionWindow([run(now-300000,{summary_json:'{}'})],{now});
  assert.equal(r.expectedSlots,864);assert.equal(r.uninstrumentedSlots,1);
  assert.equal(r.missingSlots,863);assert.equal(r.observationGate,'INCOMPLETE');
});
test('manual runs and duplicate cron receipts cannot fill missing time slots',()=>{
  const r=summarizeCollectionWindow([run(),run(),run(now-600000,{trigger:'manual'})],{now});
  assert.equal(r.observedSlots,1);assert.equal(r.duplicateRuns,1);assert.equal(r.ignoredRuns,1);
  assert.equal(r.missingSlots,863);
});
test('all 864 slots must be instrumented; later retries cannot erase degraded evidence',()=>{
  const rows=Array.from({length:864},(_,i)=>run(now-(i+1)*300000));
  const pass=summarizeCollectionWindow(rows,{now});
  assert.equal(pass.observationGate,'SAMPLED_EVIDENCE_WINDOW_COMPLETE');
  assert.equal(pass.continuousCoverageVerified,false);
  const bad=run(now-300000,{status:'SOURCE_NOT_FRESH',summary_json:JSON.stringify({
    collectionHealth:{status:'REQUIRES_ATTENTION',reasons:['NO_RECENT_SOURCE_RECEIPTS']}})});
  const fail=summarizeCollectionWindow([...rows,bad],{now});
  assert.equal(fail.degradedSlots,1);assert.equal(fail.eligibleSlots,863);
  assert.equal(fail.observationGate,'INCOMPLETE');
});
test('history read caps never establish complete coverage',()=>{
  const r=summarizeCollectionWindow(Array.from({length:900},()=>run()),{now});
  assert.equal(r.readCapped,true);assert.equal(r.observationGate,'INCOMPLETE');
});
test('missing quote evidence remains visible alongside receipt coverage',()=>{
  const health=assessCollectionSample(sample(),{now});
  const r=summarizeCollectionWindow([run(now-300000,{summary_json:JSON.stringify({
    collectionHealth:health,potentialSignalCount:1,freshExactPoolQuotes:0,
    missingFuturePriceCoverage:2,market:{status:'COOLDOWN',asOfQuotes:0,unknown:3}})})],{now});
  assert.equal(r.marketEvidence.candidateQuoteGapSlots,1);
  assert.equal(r.marketEvidence.missingOutcomeLabels,5);
  assert.equal(r.marketEvidence.marketStatuses.COOLDOWN,1);
});
