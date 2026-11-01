// Evidence-only, bounded GOGET wallet-cohort research.
// Never turn transfer hints, fee-payer identity, or program invocation into a buy or profit claim.
const ADDR=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const SIG=/^[1-9A-HJ-NP-Za-km-z]{64,88}$/;
const EXCLUDED=new Set([
  'So11111111111111111111111111111111111111112',
  'EPjFWdd5AufqSSqeM2qQowt4rMSRaFCfPvU1rNKz'
]);
export const QUALITY_BOUNDS=Object.freeze({
  hours:24,maxWallets:20,maxSampleRows:320,maxEvidenceChars:18000,
  maxMintsPerSample:32,maxPollRows:60,maxOutcomes:48
});
const count=v=>Number.isSafeInteger(Number(v))&&Number(v)>=0?Number(v):0;
const percent=(a,b)=>b>0?Math.round(a/b*1000)/10:null;
const validTime=v=>typeof v==='string'&&Number.isFinite(Date.parse(v));
const isMint=v=>typeof v==='string'&&ADDR.test(v)&&!EXCLUDED.has(v);
function parseSource(v){
  if(typeof v!=='string'||v.length>QUALITY_BOUNDS.maxEvidenceChars)return null;
  try{
    const obj=JSON.parse(v);
    return obj&&typeof obj==='object'&&!Array.isArray(obj)&&obj.schemaVersion===2?obj:null;
  }catch{return null;}
}
function asOfAge(when,now){
  if(!validTime(when))return null;
  const diff=Date.parse(now)-Date.parse(when);
  return diff>=0?Math.round(diff/60000):null;
}
export function inspectWalletQuality({
 cohort=[],walletRows=[],sampleRows=[],pollRows=[],marketOutcomes=[],
 signalRows=[],agentRows=[],asOf=new Date().toISOString()
}={}){
  if(!validTime(asOf))throw Error('INVALID_ASOF_TIME');
  if(!Array.isArray(cohort)||cohort.length>QUALITY_BOUNDS.maxWallets||
    !Array.isArray(walletRows)||walletRows.length>QUALITY_BOUNDS.maxWallets||
    !Array.isArray(sampleRows)||sampleRows.length>QUALITY_BOUNDS.maxSampleRows||
    !Array.isArray(pollRows)||pollRows.length>QUALITY_BOUNDS.maxPollRows||
    !Array.isArray(marketOutcomes)||marketOutcomes.length>QUALITY_BOUNDS.maxOutcomes||
    !Array.isArray(signalRows)||signalRows.length>QUALITY_BOUNDS.maxOutcomes||
    !Array.isArray(agentRows)||agentRows.length>QUALITY_BOUNDS.maxOutcomes)
      throw Error('COHORT_AUDIT_INPUT_LIMIT');
  const cohortNames=cohort.map(x=>typeof x==='string'?x:x?.wallet);
  if(cohortNames.some(x=>!ADDR.test(x))||new Set(cohortNames).size!==cohortNames.length)
    throw Error('INVALID_OR_DUPLICATE_WALLET');
  const stats=new Map(cohortNames.map(wallet=>[wallet,{
    wallet,observations:0,feePayerMatchedSource:0,enhancedSwapLabels:0,
    sampledReceipts:0,sampledV2Receipts:0,invalidSampleRows:0,
    sampledInboundOwnerHints:0,sampledSwapOutputHints:0,tokenMints:new Set(),
    pollingSignedAmmTokenIncrease:0,pollingReferencedNotSigner:0,
    pollingIncompleteMapping:0,latestSourceAt:null
  }]));
  let outside=0,sourceCount=0,lastAt=null;
  for(const row of walletRows){
    const a=stats.get(row?.wallet);
    if(!a){outside++;continue;}
    a.observations=count(row.n);
    a.feePayerMatchedSource=count(row.fee_payer_matched);
    a.enhancedSwapLabels=count(row.swap_labelled);
    a.latestSourceAt=validTime(row.latest_at)?row.latest_at:null;
    sourceCount+=a.observations;
    if(a.latestSourceAt&&(!lastAt||a.latestSourceAt>lastAt))lastAt=a.latestSourceAt;
  }
  const seen=new Set();
  for(const row of sampleRows){
    const a=stats.get(row?.wallet);
    if(!a||!SIG.test(row?.signature||''))continue;
    const key=row.wallet+':'+row.signature;
    if(seen.has(key))continue;seen.add(key);
    a.sampledReceipts++;
    const source=parseSource(row.evidence_json);
    if(!source){a.invalidSampleRows++;continue;}
    a.sampledV2Receipts++;
    const minted=new Set();
    let inbound=false,swapOutput=false;
    for(const t of Array.isArray(source.tokenTransfers)?
      source.tokenTransfers.slice(0,24):[]){
      if(t?.to===row.wallet&&isMint(t?.mint)){
        inbound=true;minted.add(t.mint);
      }
    }
    // Helius labels cannot independently attest the swap route or the owner.
    if(row.fee_payer_observed===1||row.fee_payer_observed===true){
      for(const t of Array.isArray(source.swapHints?.tokenOutputs)?
        source.swapHints.tokenOutputs.slice(0,8):[]){
        if(isMint(t?.mint)){swapOutput=true;minted.add(t.mint);}
      }
    }
    if(inbound)a.sampledInboundOwnerHints++;
    if(swapOutput)a.sampledSwapOutputHints++;
    for(const mint of minted){
      if(a.tokenMints.size<QUALITY_BOUNDS.maxMintsPerSample)a.tokenMints.add(mint);
    }
  }
  for(const row of pollRows){
    const a=stats.get(row?.wallet);
    if(!a)continue;
    if(row.classification==='AMM_INVOCATION_WITH_TOKEN_INCREASE_UNPRICED')
      a.pollingSignedAmmTokenIncrease+=count(row.n);
    if(row.classification==='WALLET_REFERENCED_NOT_SIGNER')
      a.pollingReferencedNotSigner+=count(row.n);
    if(row.classification==='TOKEN_INCREASE_OWNER_MAPPING_PARTIAL')
      a.pollingIncompleteMapping+=count(row.n);
  }
  const sorted=[...stats.values()].sort((a,b)=>b.observations-a.observations||
    a.wallet.localeCompare(b.wallet));
  const leaders=sorted.slice(0,2).reduce((n,x)=>n+x.observations,0);
  const concentrationPct=percent(leaders,sourceCount);
  const wallets=sorted.map(a=>{
    let investigationPriority='LOW_EVIDENCE_OR_UNSAMPLED';
    if(a.pollingSignedAmmTokenIncrease>0)
      investigationPriority='SIGNED_AMM_ACTIVITY_NEEDS_ROUTE_AND_PNL_REPLAY';
    else if(sourceCount&&a.observations/sourceCount>=0.3)
      investigationPriority='HIGH_VOLUME_UNVERIFIED_SPAM_RISK';
    else if(a.sampledInboundOwnerHints>0||a.sampledSwapOutputHints>0)
      investigationPriority='SOURCE_TOKEN_HINTS_NEED_INDEPENDENT_REPLAY';
    return {
      wallet:a.wallet,observations:a.observations,
      shareOfCohortReceiptsPct:percent(a.observations,sourceCount),
      feePayerMatchedSource:a.feePayerMatchedSource,
      feePayerMatchedPct:percent(a.feePayerMatchedSource,a.observations),
      enhancedSwapLabels:a.enhancedSwapLabels,
      sampledReceipts:a.sampledReceipts,sampledV2Receipts:a.sampledV2Receipts,
      invalidSampleRows:a.invalidSampleRows,
      sampledInboundOwnerHints:a.sampledInboundOwnerHints,
      sampledSwapOutputHints:a.sampledSwapOutputHints,
      distinctSampledHintMints:a.tokenMints.size,
      pollingSignedAmmTokenIncrease:a.pollingSignedAmmTokenIncrease,
      pollingReferencedNotSigner:a.pollingReferencedNotSigner,
      pollingIncompleteMapping:a.pollingIncompleteMapping,
      latestSourceAt:a.latestSourceAt,
      investigationPriority,
      independentlyVerifiedBuys:0,profitableTradesVerified:null,
      realizedProfitUsd:null,copyTradeEligible:false
    };
  });
  const normal=(rows,key)=>rows.map(row=>({
    [key]:typeof row[key]==='string'?row[key]:'UNKNOWN',
    ...(row.sample_kind?{sampleKind:row.sample_kind}:{}),
    ...(row.category?{category:row.category}:{}),
    ...(row.horizon_min!==undefined?{horizonMinutes:count(row.horizon_min)}:{}),
    count:count(row.n)
  }));
  const sampleCount=sorted.reduce((n,x)=>n+x.sampledReceipts,0);
  return {
    at:asOf,mode:'READ_ONLY_WALLET_EVIDENCE_NOT_A_PROFIT_RANKING',
    sampleWindowHours:QUALITY_BOUNDS.hours,
    cohortWalletCount:cohort.length,observedWalletCount:wallets.filter(x=>x.observations>0).length,
    receipts:sourceCount,unlistedWalletGroups:outside,
    latestSourceAt:lastAt,latestSourceAgeMinutes:asOfAge(lastAt,asOf),
    topTwoReceiptSharePct:concentrationPct,
    sampledReceipts:sampleCount,sampleCapacity:QUALITY_BOUNDS.maxSampleRows,
    sampleCoverage:'MOST_RECENT_GLOBAL_SAMPLE_NOT_PER_WALLET_RANDOM_SAMPLE',
    sampleSkewWarning:sampleCount===QUALITY_BOUNDS.maxSampleRows||
      (sourceCount>0&&sampleCount<sourceCount),
    wallets,
    publicUsdOutcomes:normal(marketOutcomes,'status'),
    activitySignalSamples:normal(signalRows,'sample_kind'),
    agentReviewVerdicts:normal(agentRows,'verdict'),
    verifiedCopyTrades:0,verifiedRealizedCopyPnlUsd:null,realTrades:0,
    notes:[
      'Transaction-volume share measures webhook receipts, not unique independent traders or profitable trades.',
      'Helius fee payer and token transfer/swap output hints are not independent verification of a buy or ownership.',
      'Signed program invocation with owner token increases is not proof of a standalone swap, sellability or realized PnL.',
      'USD MISSING_FUTURE quote coverage must be excluded from return statistics; never count it as zero or a loss.',
      'Global recent JSON sampling can overrepresent busy wallets and must not be treated as a complete mint census.',
      'No Helius RPC or DEX request, no wallet signing, no candidate auto-promotion, no scanner or paper changes.'
    ]
  };
}
