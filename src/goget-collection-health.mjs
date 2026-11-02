// Evidence freshness is separate from scheduler liveness. Read-only, bounded D1.
export const COLLECTION_LIMITS=Object.freeze({
  receiptFreshMs:15*60000,runFreshMs:12*60000,sampleRows:200,
  intervalMs:5*60000,historyRows:900,historyHours:72,
  pilotDeadline:'2026-11-08T00:00:00Z'
});
export const COLLECTION_SAMPLE_SQL=`SELECT e.signature,e.observed_at,
  EXISTS(SELECT 1 FROM smart_wallet_webhook_raw r WHERE r.signature=e.signature) AS raw_archived
  FROM (SELECT signature,observed_at FROM smart_wallet_webhook_events
    WHERE observed_at<=? ORDER BY observed_at DESC LIMIT ?) e`;
export const COLLECTION_HISTORY_SQL=`SELECT run_id,at,trigger,status,summary_json
  FROM goget_pre_signal_runs WHERE at>=? AND at<? AND trigger='cron'
  ORDER BY at DESC LIMIT ?`;
const clock=x=>{if(!Number.isSafeInteger(x)||x<0)throw Error('INVALID_CLOCK');return x;};
async function read(db,sql,...params){
  const result=await db.prepare(sql).bind(...params).all();
  if(result?.success!==true||!Array.isArray(result.results))throw Error('COLLECTION_READ_UNVERIFIED');
  return result.results;
}
export function assessCollectionSample(rows,{now=Date.now()}={}){
  clock(now);
  if(!Array.isArray(rows)||rows.length>COLLECTION_LIMITS.sampleRows)
    throw Error('COLLECTION_SAMPLE_INVALID');
  const unique=new Map();let latest=null;
  for(const row of rows){
    const time=Date.parse(row.observed_at);
    if(typeof row.signature!=='string'||!row.signature||!Number.isFinite(time)||time>now||
      ![0,1].includes(row.raw_archived))throw Error('COLLECTION_SAMPLE_INVALID');
    latest=latest===null?time:Math.max(latest,time);
    const previous=unique.get(row.signature);
    if(previous!==undefined&&previous!==row.raw_archived)throw Error('COLLECTION_SAMPLE_INVALID');
    unique.set(row.signature,row.raw_archived);
  }
  const age=latest===null?null:now-latest;
  const archived=[...unique.values()].filter(x=>x===1).length;
  const reasons=[];
  if(now>=Date.parse(COLLECTION_LIMITS.pilotDeadline))reasons.push('SOURCE_PILOT_EXPIRED');
  if(latest===null)reasons.push('NO_SOURCE_RECEIPTS');
  else if(age>COLLECTION_LIMITS.receiptFreshMs)reasons.push('NO_RECENT_SOURCE_RECEIPTS');
  if(archived<unique.size)reasons.push('INCOMPLETE_RAW_ARCHIVE_SAMPLE');
  return {
    status:reasons.length?'REQUIRES_ATTENTION':'FRESH_RECEIPTS_ARCHIVE_SAMPLED',
    checkedAt:new Date(now).toISOString(),latestReceiptAt:latest===null?null:new Date(latest).toISOString(),
    receiptAgeMs:age,reasons,
    archiveSample:{receiptRows:rows.length,uniqueSignatures:unique.size,archivedSignatures:archived,
      missingSignatures:unique.size-archived,bounded:true},
    providerRegistration:'NOT_VERIFIED_BY_RECEIPTS',populationCoverage:'NOT_PROVEN',
    caveat:'Quiet wallets and an inactive source can both produce no receipts. This is sampled archival evidence, not proof of complete collection.'
  };
}
export async function readCollectionSample(db,{now=Date.now()}={}){
  clock(now);
  try{return assessCollectionSample(await read(db,COLLECTION_SAMPLE_SQL,
    new Date(now).toISOString(),COLLECTION_LIMITS.sampleRows),{now});}
  catch{return {status:'UNVERIFIED',checkedAt:new Date(now).toISOString(),
    reasons:['COLLECTION_EVIDENCE_UNAVAILABLE'],providerRegistration:'NOT_VERIFIED_BY_RECEIPTS',
    populationCoverage:'NOT_PROVEN'};}
}
function decode(row){
  try{
    const summary=JSON.parse(row.summary_json);
    return summary&&typeof summary==='object'?summary:null;
  }catch{return null;}
}
export function latestCollectionStatus(row,{now=Date.now()}={}){
  clock(now);
  const summary=row?decode(row):null;
  const checked=Date.parse(row?.at),reasons=[];
  if(!Number.isFinite(checked)||checked>now)reasons.push('NO_VERIFIED_COLLECTION_CHECK');
  else if(now-checked>COLLECTION_LIMITS.runFreshMs)reasons.push('COLLECTION_CHECK_STALE');
  const health=summary?.collectionHealth;
  if(!health)reasons.push('COLLECTION_CHECK_NOT_INSTRUMENTED');
  else if(health.status!=='FRESH_RECEIPTS_ARCHIVE_SAMPLED')
    reasons.push(...(Array.isArray(health.reasons)&&health.reasons.length?
      health.reasons:['COLLECTION_EVIDENCE_UNVERIFIED']));
  const receipt=Date.parse(health?.latestReceiptAt);
  if(health&&(!Number.isFinite(receipt)||receipt>now))reasons.push('NO_VERIFIED_SOURCE_RECEIPT_TIME');
  else if(health&&now-receipt>COLLECTION_LIMITS.receiptFreshMs)reasons.push('NO_RECENT_SOURCE_RECEIPTS');
  if(row?.status&&row.status!=='OK')reasons.push(row.status);
  if(now>=Date.parse(COLLECTION_LIMITS.pilotDeadline))reasons.push('SOURCE_PILOT_EXPIRED');
  return {service:'goget-collection-health',ok:reasons.length===0,
    state:reasons.length?'REQUIRES_ATTENTION':'FRESH_RECEIPTS_ARCHIVE_SAMPLED',
    asOf:Number.isFinite(checked)?new Date(checked).toISOString():null,
    reasons:[...new Set(reasons)],continuousCoverageVerified:false};
}
export async function readLatestCollectionStatus(db,{now=Date.now()}={}){
  try{
    const rows=await read(db,"SELECT at,status,summary_json FROM goget_pre_signal_runs WHERE trigger='cron' ORDER BY at DESC LIMIT 1");
    return latestCollectionStatus(rows[0],{now});
  }catch{return {service:'goget-collection-health',ok:false,state:'UNVERIFIED',
    asOf:null,reasons:['COLLECTION_STATUS_READ_UNAVAILABLE'],continuousCoverageVerified:false};}
}
export function summarizeCollectionWindow(rows,{now=Date.now()}={}){
  clock(now);
  const step=COLLECTION_LIMITS.intervalMs,end=Math.floor(now/step)*step;
  const start=end-COLLECTION_LIMITS.historyHours*3600000;
  const groups=new Map();let ignored=0;
  for(const row of rows){
    const time=Date.parse(row.at);
    if(row.trigger!=='cron'||!Number.isFinite(time)||time<start||time>=end){ignored++;continue;}
    const slot=Math.floor(time/step)*step;
    const group=groups.get(slot)||[];group.push(row);groups.set(slot,group);
  }
  let eligible=0,degraded=0,uninstrumented=0,duplicates=0;
  const reasons={},marketStatuses={};let candidateQuoteGapSlots=0,missingOutcomeLabels=0;
  for(const group of groups.values()){
    duplicates+=group.length-1;
    const summaries=group.map(decode);
    for(const summary of summaries){
      if(!summary)continue;
      if(summary.market?.status)marketStatuses[summary.market.status]=(marketStatuses[summary.market.status]||0)+1;
      missingOutcomeLabels+=(Number(summary.missingFuturePriceCoverage)||0)+(Number(summary.market?.unknown)||0);
    }
    if(summaries.some(x=>x?.potentialSignalCount>0&&
      !(x.freshExactPoolQuotes>0)&&!(x.market?.asOfQuotes>0)))candidateQuoteGapSlots++;
    if(summaries.some(x=>!x?.collectionHealth)){
      uninstrumented++;continue;
    }
    if(group.every((r,i)=>r.status==='OK'&&
      summaries[i].collectionHealth.status==='FRESH_RECEIPTS_ARCHIVE_SAMPLED'))eligible++;
    else{
      degraded++;
      for(const [i,r] of group.entries()){
        const why=summaries[i].collectionHealth.reasons||[];
        for(const code of new Set([...(r.status==='OK'?[]:[r.status]),...why]))
          reasons[code]=(reasons[code]||0)+1;
      }
    }
  }
  const expected=(end-start)/step,missing=expected-groups.size;
  return {from:new Date(start).toISOString(),to:new Date(end).toISOString(),hours:72,
    expectedSlots:expected,observedSlots:groups.size,eligibleSlots:eligible,
    degradedSlots:degraded,uninstrumentedSlots:uninstrumented,missingSlots:missing,
    duplicateRuns:duplicates,ignoredRuns:ignored,
    readCapped:rows.length>=COLLECTION_LIMITS.historyRows,reasons,
    marketEvidence:{candidateQuoteGapSlots,missingOutcomeLabels,marketStatuses},
    observationGate:eligible===expected&&rows.length<COLLECTION_LIMITS.historyRows?
      'SAMPLED_EVIDENCE_WINDOW_COMPLETE':'INCOMPLETE',
    continuousCoverageVerified:false,
    caveat:'Scheduler slots and sampled receipts cannot establish full wallet or chain coverage, uninterrupted subscriptions, or profitable signals.'};
}
export async function readCollectionWindow(db,{now=Date.now()}={}){
  clock(now);
  const end=Math.floor(now/COLLECTION_LIMITS.intervalMs)*COLLECTION_LIMITS.intervalMs;
  const from=new Date(end-COLLECTION_LIMITS.historyHours*3600000).toISOString();
  return summarizeCollectionWindow(await read(db,COLLECTION_HISTORY_SQL,from,
    new Date(end).toISOString(),COLLECTION_LIMITS.historyRows),{now});
}
