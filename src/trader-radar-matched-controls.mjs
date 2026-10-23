// Matched historical-control eligibility. All classifications remain research-only.
// Pool quote outcomes must be collected independently; absent data => NO_RESULT.
import {studyTraderConvergence} from './trader-radar-forward-study.mjs';
import {isSolanaAddress} from './trader-radar.mjs';
const time=x=>typeof x==='string'&&Number.isFinite(Date.parse(x))?Date.parse(x):null;
const positive=x=>typeof x==='number'&&Number.isFinite(x)&&x>0;
const ratio=(a,b)=>Math.max(a,b)/Math.min(a,b);
export function matchContemporaneousControls(signals=[],universe=[],{
 asOf,maxCapitalizationRatio=2,maxLiquidityRatio=2,maxAgeRatio=3,minDistinctControls=1
}={}){
 const cutoff=time(asOf);if(cutoff===null)throw Error('Explicit asOf required');
 const matches=[],excluded=[];
 const occupied=new Set();
 for(const signal of (Array.isArray(signals)?signals:[]).slice(0,100)){
  const observed=time(signal?.observedAt);
  if(!isSolanaAddress(signal?.mint)||!isSolanaAddress(signal?.pool)||
    !positive(signal.marketCapUsd)||!positive(signal.liquidityUsd)||!positive(signal.ageMinutes)||
    observed===null||observed>cutoff||signal.eligibleResearchSignal!==true||signal.independenceVerified!==true){
   excluded.push({mint:signal?.mint||null,status:'INVALID_OR_UNVERIFIED_SIGNAL'});continue;
  }
  const candidates=(Array.isArray(universe)?universe:[]).filter(u=>{
   const recorded=time(u.recordedAt);
   return isSolanaAddress(u.mint)&&isSolanaAddress(u.pool)&&u.mint!==signal.mint&&u.pool!==signal.pool&&
    u.chain==='solana'&&u.poolProtocol===signal.poolProtocol&&
    !occupied.has(u.pool)&&!u.fromSignalGroup&&recorded!==null&&recorded<=observed&&
    positive(u.marketCapUsd)&&positive(u.liquidityUsd)&&positive(u.ageMinutes)&&
    ratio(u.marketCapUsd,signal.marketCapUsd)<=maxCapitalizationRatio&&
    ratio(u.liquidityUsd,signal.liquidityUsd)<=maxLiquidityRatio&&
    ratio(u.ageMinutes,signal.ageMinutes)<=maxAgeRatio;
  }).sort((a,b)=>(
   Math.log(ratio(a.marketCapUsd,signal.marketCapUsd))+
   Math.log(ratio(a.liquidityUsd,signal.liquidityUsd))+
   Math.log(ratio(a.ageMinutes,signal.ageMinutes)))-
  (Math.log(ratio(b.marketCapUsd,signal.marketCapUsd))+
   Math.log(ratio(b.liquidityUsd,signal.liquidityUsd))+
   Math.log(ratio(b.ageMinutes,signal.ageMinutes))));
  if(candidates.length<minDistinctControls){excluded.push({mint:signal.mint,status:'NO_MATCHED_CONTEMPORANEOUS_CONTROL'});continue;}
  const choice=candidates[0];occupied.add(choice.pool);
  matches.push({signalMint:signal.mint,signalPool:signal.pool,controlMint:choice.mint,
   controlPool:choice.pool,observedAt:signal.observedAt,eligible:true,
   matchingUsesOnlyPriorInfo:true,signal,control:choice});
 }
 return {status:'RESEARCH_MATCHES_ONLY',matches,excluded,
  alphaEstablished:false,caveat:'Ex ante market-cap, liquidity and age matching is not a backtest; full quote survival and selection bias remain unresolved.'};
}
export function evaluateMatchedQuoteOutcomes(matches=[],quotes=[],{asOf,horizonMinutes=15}={}){
 const asOfMs=time(asOf);if(asOfMs===null)throw Error('Explicit cutoff required');
 const entries=[];
 for(const pair of (Array.isArray(matches)?matches:[])){
  if(!pair.eligible)continue;
  const inputs=[
   {mint:pair.signalMint,pool:pair.signalPool,observedAt:pair.observedAt,eligibleResearchSignal:true,independenceVerified:true},
   {mint:pair.controlMint,pool:pair.controlPool,observedAt:pair.observedAt,eligibleResearchSignal:true,independenceVerified:true}
  ];
  const result=studyTraderConvergence(inputs,quotes,{asOf,horizonMinutes});
  const [a,b]=result.results;
  entries.push({signalMint:pair.signalMint,controlMint:pair.controlMint,
   signalStatus:a?.status??'NO_SIGNAL_PRICE',
   controlStatus:b?.status??'NO_CONTROL_PRICE',
   signalGrossPct:a?.grossReturnPct??null,controlGrossPct:b?.grossReturnPct??null,
   differencePct:a?.grossReturnPct!==null&&b?.grossReturnPct!==null?
    Math.round((a.grossReturnPct-b.grossReturnPct)*100)/100:null,
   evidenceClass:'UNADJUSTED_GROSS_QUOTE_PAIRS'});
 }
 const finished=entries.filter(x=>x.differencePct!==null);
 return {asOf,pairsAttempted:entries.length,pairsWithBothReturns:finished.length,
  pairsMissingEitherReturn:entries.length-finished.length,pairs:entries,
  meanGrossDifferencePct:finished.length?
   Math.round(finished.reduce((sum,x)=>sum+x.differencePct,0)/finished.length*100)/100:null,
  alphaEstablished:false,automaticTradeAllowed:false,
  caveat:'No predictive alpha established. Historic quote coverage, adverse execution, failed pools, population selection, fees, slippage and matched-control uncertainty remain.'};
}
