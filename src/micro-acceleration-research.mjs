// GOGET short-window transaction acceleration research; pure and read-only.
// Uses recorded Helius-enhanced swap observations only. NOT a live subscriber.
// No D1, worker, provider fetches, contract safety claims or trade recommendations.
export const MICRO_RULE=Object.freeze({
 windowSeconds:30,consecutiveWindows:2,
 firstWindowMinBuys:3,secondWindowMinBuys:5,
 minSecondToFirstBuyRatio:1.3,
 minRecentBuySellRatio:1.5,
 minDistinctFeePayers:5,
 maxSingleFeePayerBuyShare:0.5,
 dedupeSeconds:120
});
const base58=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const signatureRE=/^[1-9A-HJ-NP-Za-km-z]{80,90}$/;
const numeric=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0;
const at=t=>new Date(t*1000).toISOString();
export function normalizeRecordedSwaps(observations, {source='UNKNOWN'}={}){
 if(!Array.isArray(observations))throw Error('OBSERVATIONS_REQUIRED');
 if(observations.length>5000)throw Error('BOUNDED_RESEARCH_INPUT_REQUIRED');
 const seen=new Map();let duplicates=0,conflicts=0,rejected=0,unknownSide=0;
 for(const o of observations){
  const t=o?.t??o?.timestamp,signature=o?.sig??o?.signature,
    payer=o?.payer??o?.fee_payer,side=o?.side,
    quoteSol=o?.sol??o?.quote_sol;
  if(!Number.isSafeInteger(t)||t<=0||!signatureRE.test(signature||'')||
    !base58.test(payer||'')||!numeric(quoteSol)){
   rejected++;continue;
  }
  const normalized={t,signature,payer,side:side==='buy'||side==='sell'?side:'unknown',
    quoteSol,source};
  if(normalized.side==='unknown')unknownSide++;
  const prior=seen.get(signature);
  if(prior){
   duplicates++;
   if(prior.t!==normalized.t||prior.payer!==normalized.payer||
      prior.side!==normalized.side||prior.quoteSol!==normalized.quoteSol)conflicts++;
   continue; // the same tx may have multiple swaps: do not double count one as two independent payers
  }
  seen.set(signature,normalized);
 }
 const events=[...seen.values()].sort((a,b)=>a.t-b.t||a.signature.localeCompare(b.signature));
 return {events,rawCount:observations.length,dedupedCount:events.length,
  duplicates,conflicts,rejected,unknownSide,
  caveat:'One event per signature in this sampled feed. Fee payer != independently verified beneficial buyer. Multi-swap transactions may be undercounted.'};
}
export function parseCompleteness(windows){
 if(!Array.isArray(windows))throw Error('COMPLETENESS_PROVENANCE_REQUIRED');
 const complete=[];
 for(const w of windows){
  if(w?.complete!==true&&w?.fully_covered_by_pagination!==true)continue;
  const start=Date.parse(w.start??w.start_utc??''),end=Date.parse(w.end??w.end_utc??'');
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start||
    start%30000!==0||end%30000!==0)continue;
  complete.push({start:start/1000,end:end/1000});
 }
 return complete.sort((a,b)=>a.start-b.start||a.end-b.end);
}
function completeWindow(t,seconds,coverage){
 // Each window must fit entirely within one evidenced complete interval.
 return coverage.some(x=>x.start<=t&&t+seconds<=x.end);
}
export function analyzeMicroAcceleration(observations,windows,{
 rule=MICRO_RULE,source='HELIUS_ARCHIVED_RECONSTRUCTION',
 receivedAt=null,asOf=null
}={}){
 if(!Number.isInteger(rule.windowSeconds)||rule.windowSeconds!==30)
   throw Error('ONLY_30_SECOND_WINDOW_SUPPORTED');
 const normalized=normalizeRecordedSwaps(observations,{source});
 const coverage=parseCompleteness(windows);
 // asOf is an *inclusive* event-time cutoff for causal replay, not a receipt claim.
 const cutoff=asOf===null?Infinity:Date.parse(asOf)/1000;
 if(asOf!==null&&!Number.isFinite(cutoff))throw Error('INVALID_CAUSAL_CUTOFF');
 if(receivedAt!==null&&(!Number.isFinite(Date.parse(receivedAt))||
    !/Z$/.test(receivedAt)))throw Error('UTC_RECEIPT_REQUIRED');
 const observationsAtCutoff=normalized.events.filter(x=>x.t<=cutoff);
 const earliest=coverage.length?coverage[0].start:0;
 const latest=coverage.length?Math.max(...coverage.map(x=>x.end)):0;
 if(latest-earliest>86400)throw Error('WINDOW_SPAN_EXCEEDS_RESEARCH_BUDGET');
 const windowsByStart=new Map();
 for(let t=earliest;t<latest;t+=rule.windowSeconds){
  if(t+rule.windowSeconds>cutoff)continue; // no partial bars or future trades
  if(!completeWindow(t,rule.windowSeconds,coverage))continue;
  windowsByStart.set(t,{start:t,end:t+rule.windowSeconds,buys:0,sells:0,
   unknown:0,buyQuoteSol:0,sellQuoteSol:0,feePayers:new Map(),buyFeePayers:new Map(),
   signatureCount:0});
 }
 // Bounded to at most 5k observations and complete archived windows.
 for(const e of observationsAtCutoff){
  const k=Math.floor(e.t/rule.windowSeconds)*rule.windowSeconds;
  const w=windowsByStart.get(k);
  if(!w)continue;
  w.signatureCount++;
  if(e.side==='buy'){w.buys++;w.buyQuoteSol+=e.quoteSol;
    w.buyFeePayers.set(e.payer,(w.buyFeePayers.get(e.payer)||0)+1)}
  else if(e.side==='sell'){w.sells++;w.sellQuoteSol+=e.quoteSol}
  else w.unknown++;
  w.feePayers.set(e.payer,(w.feePayers.get(e.payer)||0)+1);
 }
 const summaries=[...windowsByStart.values()].map(w=>({
  start:w.start,end:w.end,buys:w.buys,sells:w.sells,unknown:w.unknown,
  signatureCount:w.signatureCount,buyQuoteSol:+w.buyQuoteSol.toFixed(9),
  sellQuoteSol:+w.sellQuoteSol.toFixed(9),
  distinctBuyFeePayers:w.buyFeePayers.size,distinctAllFeePayers:w.feePayers.size,
  maxBuyFeePayerShare:w.buys?
   Math.max(...w.buyFeePayers.values())/w.buys:null,
  evidence:'ARCHIVED_PAGINATION_COMPLETE_5M_PARENT',
  independentBuyers:null
 })).sort((a,b)=>a.start-b.start);
 const alerts=[],episodes=[];let lastEmitted=-Infinity;
 for(let i=1;i<summaries.length;i++){
  const prior=summaries[i-1],current=summaries[i];
  if(prior.end!==current.start)continue;
  const distinct=observationsAtCutoff.filter(e=>e.t>=prior.start&&e.t<current.end&&
   e.side==='buy').reduce((s,e)=>(s.add(e.payer),s),new Set()).size;
  const allBuyCount=prior.buys+current.buys;
  const buyCounts=new Map();
  for(const e of observationsAtCutoff)
   if(e.side==='buy'&&e.t>=prior.start&&e.t<current.end)
    buyCounts.set(e.payer,(buyCounts.get(e.payer)||0)+1);
  const dominant=allBuyCount?Math.max(...buyCounts.values())/allBuyCount:null;
  const accelRatio=prior.buys?current.buys/prior.buys:null;
  const imbalance=current.buys/Math.max(1,current.sells);
  const matched=prior.buys>=rule.firstWindowMinBuys&&
   current.buys>=rule.secondWindowMinBuys&&
   accelRatio>=rule.minSecondToFirstBuyRatio&&
   imbalance>=rule.minRecentBuySellRatio&&
   distinct>=rule.minDistinctFeePayers;
  if(!matched)continue;
  const warnings=[];
  if(dominant>rule.maxSingleFeePayerBuyShare)warnings.push('FEE_PAYER_CONCENTRATION');
  if(normalized.conflicts)warnings.push('SAME_SIGNATURE_CONFLICTS_IN_SOURCE');
  if(normalized.rejected)warnings.push('MALFORMED_EVENTS_EXCLUDED');
  const out={candidateClass:'EARLY_ACCELERATION_RESEARCH_HYPOTHESIS',
   source,windowFrom:at(prior.start),windowEnd:at(current.end),
   earliestCausalCalculationAt:at(current.end),
   actualCollectorReceiptAt:receivedAt,
   archiveAgeAtReceiptSeconds:receivedAt===null?null:
    Math.max(0,(Date.parse(receivedAt)/1000-current.end)),
   liveLatencySeconds:null,
   firstWindowBuys:prior.buys,secondWindowBuys:current.buys,
   buysInLast30s:current.buys,sellsInLast30s:current.sells,
   buyAccelerationRatio:accelRatio,buySellRatio:imbalance,
   feePayerCount:distinct,largestBuyFeePayerShare:dominant,
   independentBuyers:null,knownLiquidityUsd:null,
   sourceDataCompleteness:'PARENT_5M_SAMPLE_FLAGGED_COMPLETE',
   warnings,verifiedMarketSafety:false,buyQualified:false,
   caveat:'Earliest causal calculation is retrospective. Actual archived receipt, backfill delay and trade execution are separate and unproven.'};
  alerts.push(out);
  if(current.end-lastEmitted>=rule.dedupeSeconds){
   episodes.push(out);lastEmitted=current.end;
  }
 }
 return {mode:'OFFLINE_SHORT_WINDOW_RESEARCH',rule,receivedAt,
  sourceCompletenessWindows:coverage,rawCount:normalized.rawCount,
  normalizedCount:normalized.dedupedCount,duplicates:normalized.duplicates,
  conflicts:normalized.conflicts,rejected:normalized.rejected,
  evaluated30sWindows:summaries.length,windowSummaries:summaries,
  rawHypothesisHits:alerts.length,episodeCount:episodes.length,episodes,
  insufficientProvenCoverage:coverage.length===0,
  caveat:'All analyzed historical events were retrieved later than their chain timestamps. No claim of live GOGET delivery or beneficiary-independent buyers.'};
}
