// Independent report gate. It does not contact providers or assert end-to-end coverage.
export const EXPECTED_UNATTENDED_SLOTS=864;
const FIFTEEN_MINUTES=15*60*1000;
const numberOk=n=>Number.isSafeInteger(n)&&n>=0;
const validTime=s=>typeof s==='string'&&Number.isFinite(Date.parse(s));

export function evaluateUnattendedReport(report,{now=Date.now()}={}){
  const latest=report?.latest,window=report?.window;
  if(!numberOk(now)||typeof latest?.ok!=='boolean'||window?.hours!==72||
    window?.expectedSlots!==EXPECTED_UNATTENDED_SLOTS||
    !['observedSlots','missingSlots','eligibleSlots','degradedSlots','uninstrumentedSlots','duplicateRuns'].every(k=>numberOk(window[k]))||
    typeof window.readCapped!=='boolean'||typeof window.observationGate!=='string'||
    !validTime(window.from)||!validTime(window.to))throw Error('UNATTENDED_REPORT_SHAPE_UNVERIFIED');
  if(window.observedSlots+window.missingSlots!==EXPECTED_UNATTENDED_SLOTS||
    window.eligibleSlots+window.degradedSlots+window.uninstrumentedSlots!==window.observedSlots||
    Date.parse(window.to)-Date.parse(window.from)!==72*3600000)
    throw Error('UNATTENDED_REPORT_COUNTERS_INCONSISTENT');
  const reasons=[];
  if(!latest.ok)reasons.push('LATEST_COLLECTION_UNHEALTHY');
  const latestAt=Date.parse(latest.asOf);
  if(!Number.isFinite(latestAt)||latestAt>now||now-latestAt>FIFTEEN_MINUTES)
    reasons.push('LATEST_CHECK_STALE_OR_UNKNOWN');
  const end=Date.parse(window.to);
  if(end>now||now-end>FIFTEEN_MINUTES)reasons.push('WINDOW_END_STALE_OR_FUTURE');
  if(window.missingSlots)reasons.push('WINDOW_MISSING_SLOTS');
  if(window.uninstrumentedSlots)reasons.push('WINDOW_UNINSTRUMENTED_SLOTS');
  if(window.degradedSlots)reasons.push('WINDOW_DEGRADED_SLOTS');
  if(window.readCapped)reasons.push('WINDOW_QUERY_CAPPED');
  if(window.eligibleSlots!==EXPECTED_UNATTENDED_SLOTS||
    window.observationGate!=='SAMPLED_EVIDENCE_WINDOW_COMPLETE')
    reasons.push('WINDOW_OBSERVATION_INCOMPLETE');
  const sampled72hComplete=window.missingSlots===0&&window.uninstrumentedSlots===0&&
    window.degradedSlots===0&&!window.readCapped&&
    window.eligibleSlots===EXPECTED_UNATTENDED_SLOTS&&
    window.observationGate==='SAMPLED_EVIDENCE_WINDOW_COMPLETE';
  if(window.observationGate==='SAMPLED_EVIDENCE_WINDOW_COMPLETE'&&!sampled72hComplete)
    throw Error('UNATTENDED_REPORT_GATE_CONTRADICTS_COUNTS');
  return {status:reasons.length?'INCOMPLETE':'SAMPLED_WINDOW_PASS',
    currentCheckHealthy:latest.ok,sampled72hComplete,
    continuousCoverageVerified:false, // Must also prove actual provider/cohort/market continuity.
    expectedSlots:EXPECTED_UNATTENDED_SLOTS,observedSlots:window.observedSlots,
    eligibleSlots:window.eligibleSlots,reasons,
    caveat:'Sampled window evidence is not end-to-end on-chain collection proof. Provider registration, exact cohort, source receipts, archives and market outcomes require independent validation.'};
}
