// WHAT'S GOOD evidence layer v2: research-only, additive to immutable OUR SCORE v1.
// Missing data never becomes a zero-risk claim or a fabricated flow measurement.
const finite=v=>typeof v==='number'&&Number.isFinite(v)?v:null;
const clamp=(x,a=0,b=100)=>Math.min(b,Math.max(a,x));
export function evaluateFlowWindow(w){
  const buys=finite(w?.buys),sells=finite(w?.sells),buyers=finite(w?.distinctBuyers),
    meaningful=finite(w?.meaningfulBuyers),buyUsd=finite(w?.buyUsd),sellUsd=finite(w?.sellUsd);
  const complete=w?.complete===true;
  const valid=complete&&[buys,sells,buyers,meaningful,buyUsd,sellUsd].every(v=>v!==null&&v>=0)
    &&buyers<=buys&&meaningful<=buyers;
  if(!valid)return {eligible:false,reason:complete?'MISSING_OR_INVALID_FLOW':'INCOMPLETE_WINDOW'};
  const netUsd=buyUsd-sellUsd;
  return {eligible:true,buys,sells,distinctBuyers:buyers,meaningfulBuyers:meaningful,
    buyUsd,sellUsd,netUsd,meaningfulRatio:buyers?meaningful/buyers:0,
    positive:netUsd>0&&meaningful>=5};
}
export function evaluateNightLabEvidence(e={}){
  const reasons=[],missing=[];
  const windows=(Array.isArray(e.windows)?e.windows:[]).map(evaluateFlowWindow);
  const completed=windows.filter(w=>w.eligible);
  // Never bridge over a missing/incomplete five-minute window. The most recent
  // TWO supplied windows must both be complete, with verifiable adjacency.
  const latest=windows.slice(-2);
  const rawWindows=Array.isArray(e.windows)?e.windows:[];
  const lastRaw=rawWindows.slice(-2);
  const timed=lastRaw.length===2&&lastRaw.every(w=>Number.isFinite(Date.parse(w.startUtc||''))&&Number.isFinite(Date.parse(w.endUtc||'')));
  const adjacent=timed&&Date.parse(lastRaw[0].endUtc)===Date.parse(lastRaw[1].startUtc)
    &&lastRaw.every(w=>Date.parse(w.endUtc)-Date.parse(w.startUtc)===300000);
  const persistent=latest.length===2&&latest.every(w=>w.eligible&&w.positive)&&adjacent;
  const liquidity=finite(e.liquidityUsd),cap=finite(e.marketCapUsd),
    fdv=finite(e.fdvUsd),quoteAge=finite(e.quoteAgeMinutes);
  const valuation=cap>0?cap:fdv>0?fdv:null;
  const ratio=liquidity!==null&&valuation?100*liquidity/valuation:null;
  if(!e.chain||!e.address||!e.pool)missing.push('EXACT_IDENTITY_OR_POOL');
  if(valuation===null)missing.push('CAP_AND_FDV');
  if(liquidity===null)missing.push('LIQUIDITY_USD');
  if(!persistent)missing.push('TWO_ADJACENT_POSITIVE_5M_WINDOWS');
  if(e.sellQuoteVerified!==true)missing.push('EXECUTABLE_SELL_QUOTE');
  if(e.lpCustodyVerified!==true)missing.push('INDEPENDENT_LP_CUSTODY');
  if(e.holderConcentrationVerified!==true)missing.push('HOLDER_CONCENTRATION');
  if(e.liquidityWithdrawn===true||e.poolNearEmpty===true){
    return {state:'TRASH',score:0,qualified:false,confidence:'HIGH_FOR_QUARANTINE',
      reasons:['VERIFIED_LIQUIDITY_EMERGENCY'],missing,flowWindows:windows,liquidityCapPct:ratio};
  }
  if(e.mintRisk===true||e.freezeRisk===true||e.holderRisk===true)reasons.push('ONCHAIN_RISK');
  if(!(liquidity>=15000))reasons.push('INSUFFICIENT_OR_UNKNOWN_LIQUIDITY');
  if(!(valuation>=50000&&valuation<=250000))reasons.push('OUTSIDE_TARGET_OR_UNKNOWN_VALUATION');
  if(!(quoteAge!==null&&quoteAge>=0&&quoteAge<=30))reasons.push('STALE_OR_UNKNOWN_QUOTE');
  if(!persistent)reasons.push('BUYER_PERSISTENCE_NOT_CONFIRMED');
  if(e.paidPromotion===true)reasons.push('PROMOTED_NOT_PROOF_OF_ORGANIC');
  if(e.sellQuoteVerified!==true)reasons.push('SELL_DEPTH_UNVERIFIED');
  if(e.lpCustodyVerified!==true)reasons.push('LP_CUSTODY_UNVERIFIED');
  const flow=persistent?35:latest.some(w=>w.eligible&&w.positive)?12:0;
  const market=liquidity>=25000?20:liquidity>=15000?12:0;
  const capFit=valuation>=50000&&valuation<=250000?15:0;
  const freshness=quoteAge!==null&&quoteAge>=0&&quoteAge<=15?10:quoteAge!==null&&quoteAge<=30&&quoteAge>=0?6:0;
  const verified=(e.sellQuoteVerified===true?8:0)+(e.lpCustodyVerified===true?7:0)+
    (e.holderConcentrationVerified===true?5:0);
  const raw=flow+market+capFit+freshness+verified;
  const hardRisk=e.mintRisk===true||e.freezeRisk===true||e.holderRisk===true;
  const score=clamp(Math.min(raw,hardRisk?15:e.sellQuoteVerified!==true?65:100));
  const qualified=missing.length===0&&reasons.filter(x=>x!=='PROMOTED_NOT_PROOF_OF_ORGANIC').length===0;
  return {state:qualified?'ACTIVE':hardRisk?'COOLING':'ACTIVE',qualified,score,
    confidence:missing.length?'PROVISIONAL':'SUPPORTED',reasons,missing,
    liquidityCapPct:ratio,valuationType:cap>0?'MARKET_CAP':'FDV_PROXY',flowWindows:windows};
}
