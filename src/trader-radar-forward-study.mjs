// GOGET Trader Radar: forward-quote study, strict no-lookahead, no trades.
// Historical observations alone cannot establish predictive alpha.
import {isSolanaAddress} from './trader-radar.mjs';
const stamp=x=>typeof x==='string'&&Number.isFinite(Date.parse(x))?Date.parse(x):null;
const good=x=>typeof x==='number'&&Number.isFinite(x)&&x>0;
const round=x=>Math.round(x*100)/100;
export function studyTraderConvergence(signals=[],quotes=[],{
 asOf,horizonMinutes=15,latencySeconds=60,maxQuoteLagSeconds=120,minLiquidityUsd=15000
}={}){
 const end=stamp(asOf);if(end===null)throw Error('Explicit asOf required');
 const horizon=Math.max(1,Math.min(1440,Math.floor(Number(horizonMinutes)||15)))*60000;
 const delay=Math.max(1,Math.min(3600,Math.floor(Number(latencySeconds)||60)))*1000;
 const tolerance=Math.max(1,Math.min(600,Math.floor(Number(maxQuoteLagSeconds)||120)))*1000;
 const floor=Math.max(0,Number(minLiquidityUsd)||0);
 const byKey=new Map();
 for(const q of (Array.isArray(quotes)?quotes:[]).slice(0,10000)){
  const ts=stamp(q?.at);
  if(!isSolanaAddress(q?.mint)||!isSolanaAddress(q?.pool)||ts===null||ts>end||!good(q.priceUsd)||!good(q.liquidityUsd))continue;
  const key=q.mint+':'+q.pool;
  const rows=byKey.get(key)||[];rows.push({...q,ts});byKey.set(key,rows);
 }
 for(const rows of byKey.values())rows.sort((a,b)=>a.ts-b.ts);
 const output=[],dedup=new Set();
 for(const s of (Array.isArray(signals)?signals:[]).slice(0,500)){
  const observed=stamp(s?.observedAt),key=s?.mint+':'+s?.pool+':'+s?.observedAt;
  if(dedup.has(key))continue;dedup.add(key);
  const excluded=(reason)=>({mint:s?.mint||null,pool:s?.pool||null,observedAt:s?.observedAt||null,
   status:reason,grossReturnPct:null,entryAt:null,exitAt:null});
  if(s?.eligibleResearchSignal!==true||!isSolanaAddress(s?.mint)||!isSolanaAddress(s?.pool)||observed===null||
    observed>end||s?.independenceVerified!==true){output.push(excluded('SIGNAL_NOT_INDEPENDENTLY_VERIFIED'));continue;}
  const target=observed+delay+horizon;
  if(target>end){output.push(excluded('HORIZON_NOT_YET_ELAPSED'));continue;}
  const arr=byKey.get(s.mint+':'+s.pool)||[];
  const entry=arr.find(x=>x.ts>=observed+delay&&x.ts<=observed+delay+tolerance&&x.liquidityUsd>=floor);
  if(!entry){output.push(excluded('NO_EXECUTABLE_ENTRY_QUOTE'));continue;}
  const exit=arr.find(x=>x.ts>=entry.ts+horizon&&x.ts<=entry.ts+horizon+tolerance&&x.liquidityUsd>=floor);
  if(!exit){output.push(excluded('NO_EXIT_QUOTE'));continue;}
  output.push({mint:s.mint,pool:s.pool,observedAt:s.observedAt,status:'GROSS_QUOTE_RETURN_ONLY',
   entryAt:new Date(entry.ts).toISOString(),exitAt:new Date(exit.ts).toISOString(),
   grossReturnPct:round((exit.priceUsd/entry.priceUsd-1)*100),
   entryPriceUsd:entry.priceUsd,exitPriceUsd:exit.priceUsd,entryLiquidityUsd:entry.liquidityUsd,
   exitLiquidityUsd:exit.liquidityUsd,feesAndSlippageIncluded:false,source:entry.source||'UNATTRIBUTED_QUOTE'});
 }
 const resolved=output.filter(x=>x.status==='GROSS_QUOTE_RETURN_ONLY');
 return {asOf,horizonMinutes:horizon/60000,signalCount:output.length,resolvedCount:resolved.length,
  pendingOrExcluded:output.length-resolved.length,results:output,
  meanGrossPct:resolved.length?round(resolved.reduce((sum,x)=>sum+x.grossReturnPct,0)/resolved.length):null,
  positiveGrossRatioPct:resolved.length?round(100*resolved.filter(x=>x.grossReturnPct>0).length/resolved.length):null,
  predictiveAlphaEstablished:false,automaticTradeAllowed:false,
  caveat:'Unadjusted historical quote moves with latency; missing or failed exits are excluded rather than scored as wins. No gas, DEX fees, routing, slippage, adverse selection, contemporaneous control group or significance test.'};
}
