// GOGET recovered research outcomes: descriptive evidence only.
// Never mix retrospective candles with genuinely forward-observed prices.
const ISO=t=>typeof t==='string'&&Number.isFinite(Date.parse(t));
const KINDS=new Set(['CONTROL','POTENTIAL_SIGNAL']);
const HORIZONS=new Set([5,60,360,1440]);
const pct=(n,d)=>d?Math.round(n/d*1000)/10:null;
const fix=(n,p=4)=>Number.isFinite(n)?Math.round(n*10**p)/10**p:null;
const quantile=(list,q)=>{
 if(!list.length)return null;
 const v=[...list].sort((a,b)=>a-b),at=(v.length-1)*q,i=Math.floor(at);
 return fix(v[i]+(v[Math.min(i+1,v.length-1)]-v[i])*(at-i));
};
const stat=rs=>{
 const nums=rs.map(x=>x.changePct).filter(Number.isFinite);
 const uniqMint=new Set(rs.map(x=>x.mint));
 const uniqEvent=new Set(rs.map(x=>x.mint+'|'+x.bucket));
 const earliestByMint=new Map();
 for(const x of [...rs].sort((a,b)=>a.bucket.localeCompare(b.bucket))){
   if(!earliestByMint.has(x.mint))earliestByMint.set(x.mint,x);
 }
 const first=[...earliestByMint.values()].map(x=>x.changePct);
 return {records:rs.length,uniqueMints:uniqMint.size,
   uniqueMintBuckets:uniqEvent.size,firstMintObservations:first.length,
   positive:nums.filter(x=>x>0).length,negative:nums.filter(x=>x<0).length,
   unchanged:nums.filter(x=>x===0).length,
   positiveSharePct:pct(nums.filter(x=>x>0).length,nums.length),
   medianChangePct:quantile(nums,0.5),q25ChangePct:quantile(nums,0.25),
   q75ChangePct:quantile(nums,0.75),
   meanChangePct:nums.length?fix(nums.reduce((a,b)=>a+b,0)/nums.length):null,
   extremeOver500Pct:nums.filter(x=>Math.abs(x)>500).length,
   firstMintMedianPct:quantile(first,0.5),
   firstMintPositiveSharePct:pct(first.filter(x=>x>0).length,first.length)};
};
export function reviewRecoveredEvidence({rows=[],coverage=[],wallets=[],asOf=new Date().toISOString()}={}){
 if(!ISO(asOf))throw Error('ASOF_INVALID');
 if(!Array.isArray(rows)||rows.length>500||!Array.isArray(coverage)||coverage.length>24||
    !Array.isArray(wallets)||wallets.length>40)throw Error('AUDIT_BOUNDED_INPUT_REQUIRED');
 const valid=[],rejected=[];
 const identities=new Set();
 for(const r of rows){
  const key=r.mint+'|'+r.bucket+'|'+r.horizon_min;
  const due=Date.parse(r.due_at||''),candle=Date.parse(r.historical_candle_at||'');
  const ref=Number(r.reference_price_usd),refOriginal=Number(r.original_reference_price_usd);
  const historicalClose=Number(r.historical_candle_close_usd),reported=Number(r.historical_change_pct);
  const computed=(historicalClose/ref-1)*100;
  const reason=identities.has(key)?'DUPLICATE_IDENTITY':
   !KINDS.has(r.sample_kind)||r.sample_kind!==r.snapshot_kind?'SAMPLE_KIND_MISMATCH':
   r.original_status!=='MISSING_FUTURE_USD_QUOTE_COVERAGE'?'FORWARD_STATUS_MUTATED_OR_NOT_MISSING':
   !HORIZONS.has(Number(r.horizon_min))?'HORIZON_UNKNOWN':
   r.pool!==r.original_pool?'POOL_IDENTITY_MISMATCH':
   !ISO(r.bucket)||!Number.isFinite(due)||!Number.isFinite(candle)||
     candle<due||candle>due+600000?'CANDLE_TIME_OUTSIDE_HORIZON':
   !(ref>0&&refOriginal>0&&historicalClose>0)||!Number.isFinite(computed)?
     'INVALID_REFERENCE_OR_PRICE':
   Math.abs(ref-refOriginal)/refOriginal>1e-10?'REFERENCE_MISMATCH':
   !Number.isFinite(reported)||Math.abs(reported-computed)>0.011?
     'RECORDED_PERCENT_MISMATCH':
   r.source!=='GECKOTERMINAL_HISTORICAL_1M_USD'?'SOURCE_UNVERIFIED':null;
  identities.add(key);
  if(reason){rejected.push({key,reason});continue;}
  valid.push({mint:r.mint,bucket:r.bucket,pool:r.pool,
    horizonMin:Number(r.horizon_min),sampleKind:r.sample_kind,
    changePct:reported,candleAt:r.historical_candle_at});
 }
 const bands=[];
 for(const horizonMin of [5,60,360,1440]){
  for(const sampleKind of ['POTENTIAL_SIGNAL','CONTROL']){
   const sample=valid.filter(x=>x.horizonMin===horizonMin&&x.sampleKind===sampleKind);
   const sources=coverage.filter(x=>Number(x.horizon_min)===horizonMin&&x.sample_kind===sampleKind);
   const totalMissing=sources.reduce((n,x)=>n+Number(x.missing_count||0),0);
   const recoveredCount=sources.reduce((n,x)=>n+Number(x.recovered_count||0),0);
   bands.push({horizonMin,sampleKind,totalMissing,recoveredCount,
     remainingMissing:Math.max(0,totalMissing-recoveredCount),
     recoveredSharePct:pct(recoveredCount,totalMissing),...stat(sample)});
  }
 }
 const comparisons=[];
 for(const horizonMin of [5,60,360,1440]){
  const byBucket=new Map();
  for(const row of valid.filter(x=>x.horizonMin===horizonMin)){
   const cur=byBucket.get(row.bucket)||{signals:[],controls:[]};
   cur[row.sampleKind==='POTENTIAL_SIGNAL'?'signals':'controls'].push(row.changePct);
   byBucket.set(row.bucket,cur);
  }
  const pairs=[...byBucket].filter(([,x])=>x.signals.length&&x.controls.length).map(([bucket,x])=>({
    bucket,signalMedianPct:quantile(x.signals,.5),controlMedianPct:quantile(x.controls,.5)
  }));
  comparisons.push({horizonMin,matchedFiveMinuteBuckets:pairs.length,
    medianBucketSignalMinusControlPct:quantile(pairs.map(x=>x.signalMedianPct-x.controlMedianPct),.5),
    caveat:'Same-time observational grouping; wallets and token observations are not independent.'});
 }
 // Repeated 5m snapshots and four horizons can reference the same token.
 // Publish every first-observed signal mint's horizon evidence, not a cherry-picked winner.
 const byMint=new Map();
 for(const item of valid.filter(x=>x.sampleKind==='POTENTIAL_SIGNAL')
   .sort((a,b)=>a.bucket.localeCompare(b.bucket)||a.horizonMin-b.horizonMin)){
   const itemGroup=byMint.get(item.mint)||{mint:item.mint,firstObservedBucket:item.bucket,
     recoveredRecordCount:0,uniqueSignalBuckets:new Set(),horizons:new Map()};
   itemGroup.recoveredRecordCount++;
   itemGroup.uniqueSignalBuckets.add(item.bucket);
   if(!itemGroup.horizons.has(item.horizonMin)){
     itemGroup.horizons.set(item.horizonMin,{
       horizonMinutes:item.horizonMin,firstSignalBucket:item.bucket,
       recoveredHistoricalChangePct:fix(item.changePct),
       exactPool:item.pool,historicalCandleAt:item.candleAt});
   }
   byMint.set(item.mint,itemGroup);
 }
 const signalMintDetails=[...byMint.values()].sort((a,b)=>
  a.firstObservedBucket.localeCompare(b.firstObservedBucket)||a.mint.localeCompare(b.mint))
  .map(x=>({mint:x.mint,firstObservedBucket:x.firstObservedBucket,
    recoveredRecordCount:x.recoveredRecordCount,
    uniqueSignalBuckets:x.uniqueSignalBuckets.size,
    firstSignalOutcomeByHorizon:[...x.horizons.values()].sort((a,b)=>a.horizonMinutes-b.horizonMinutes)}));
 const walletRows=wallets.map(x=>({
   wallet:x.wallet,txType:x.tx_type,rows:Number(x.n),
   feePayerSelf:Number(x.self_fee_payer||0)}));
 const historicalWalletCount=new Set(walletRows.map(x=>x.wallet)).size;
 const totals=coverage.reduce((x,r)=>{
  x.missing+=Number(r.missing_count||0);
  x.recovered+=Number(r.recovered_count||0);
  return x;
 },{missing:0,recovered:0});
 return {
  at:asOf,mode:'READ_ONLY_DESCRIPTIVE_RECOVERY_EFFICACY_NO_PROFIT_CLAIMS',
  recoveredRowsRead:rows.length,validRecoveredRows:valid.length,
  invalidRecoveredRows:rejected.length,rejected:rejected.slice(0,30),
  totalOriginalMissing:totals.missing,totalHistoricalRecovered:totals.recovered,
  stillMissing:Math.max(0,totals.missing-totals.recovered),
  recoveryPct:pct(totals.recovered,totals.missing),
  horizonBands:bands,timeMatchedComparisons:comparisons,signalMintDetails,
  replayWalletCount:historicalWalletCount,replayTypeCounts:walletRows,
  providerCalls:0,d1Writes:0,realTrades:0,
  independentlyVerifiedProfitableCopyTrades:0,
  repeatObservationWarning:'Repeated observations of one mint/bucket or mint across horizons are not independent signals; return statistics are descriptive.',
  missingNotAtRandomWarning:'Historical bars are available for some pools more than others; positive-only recoveries could introduce survivorship bias.',
  historicalCandleWarning:'These minute candle CLOSE prices were retrieved after the target time and were not executable live prices; no fee/slippage/sellability proof.'
 };
}
