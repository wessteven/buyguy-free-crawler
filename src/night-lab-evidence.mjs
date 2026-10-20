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
  const latest=completed.slice(-2);
  const liquidity=finite(e.liquidityUsd),cap=finite(e.marketCapUsd),
    fdv=finite(e.fdvUsd),quoteAge=finite(e.quoteAgeMinutes);
  const valuation=cap>0?cap:fdv>0?fdv:null;
  const ratio=liquidity!==null&&valuation?100*liquidity/valuation:null;
  if(!e.chain||!e.address||!e.pool)missing.push('EXACT_IDENTITY_OR_POOL');
  if(valuation===null)missing.push('CAP_AND_FDV');
  if(liquidity===null)missing.push('LIQUIDITY_USD');
  if(completed.length<2)missing.push('TWO_COMPLETE_FLOW_WINDOWS');
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
  if(latest.length<2||!latest.every(w=>w.positive))reasons.push('BUYER_PERSISTENCE_NOT_CONFIRMED');
  if(e.paidPromotion===true)reasons.push('PROMOTED_NOT_PROOF_OF_ORGANIC');
  if(e.sellQuoteVerified!==true)reasons.push('SELL_DEPTH_UNVERIFIED');
  if(e.lpCustodyVerified!==true)reasons.push('LP_CUSTODY_UNVERIFIED');
  const flow=latest.length===2&&latest.every(w=>w.positive)?35:latest.some(w=>w.positive)?12:0;
  const market=liquidity>=25000?20:liquidity>=15000?12:0;
  const capFit=valuation>=50000&&valuation<=250000?15:0;
  const freshness=quoteAge!==null&&quoteAge>=0&&quoteAge<=15?10:quoteAge<=30&&quoteAge>=0?6:0;
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
