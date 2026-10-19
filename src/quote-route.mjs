// Route discovery ONLY: two read-only quote requests, never build/sign/send swaps.
// Jupiter keyless API may rate-limit or deny; missing route is NOT proof of a honeypot.
export const USDC='EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const API='https://api.jup.ag/swap/v1/quote';
const b58=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const USDC_INPUT='40000000'; // USD $40 with 6 USDC decimals.
const pct=value=>Number(value)*100;
export function assessRoundTrip(buy,sell,{marketPriceUsd=null,decimals=null}={}){
  const result={source:'Jupiter read-only buy/sell route quotes',label:'NO_ROUTE_EVIDENCE',
    buyRoute:false,sellRoute:false,estimatedRoundTripLossPct:null,
    maxImpactPct:null,marketVsQuotePct:null,flags:[],note:'Two quotes are indicative only; no trade, transaction simulation, LP-lock verification or sell guarantee.'};
  if(!buy||buy.error||buy.inputMint!==USDC||!b58.test(buy.outputMint||'')||
    buy.inAmount!==USDC_INPUT||!/^\d+$/.test(buy.outAmount||'')||
    BigInt(buy.outAmount)<=0n||!Array.isArray(buy.routePlan)||!buy.routePlan.length){
    result.flags.push('BUY_ROUTE_UNAVAILABLE');return result;
  }
  result.buyRoute=true;
  if(!sell||sell.error||sell.inputMint!==buy.outputMint||sell.outputMint!==USDC||
    sell.inAmount!==buy.outAmount||!/^\d+$/.test(sell.outAmount||'')||
    !Array.isArray(sell.routePlan)||!sell.routePlan.length){
    result.flags.push('SELL_ROUTE_UNAVAILABLE');return result;
  }
  result.sellRoute=true;
  const inp=BigInt(USDC_INPUT),out=BigInt(sell.outAmount);
  result.estimatedRoundTripLossPct=Number(((inp-out)*10000n)/inp)/100;
  const impacts=[pct(buy.priceImpactPct),pct(sell.priceImpactPct)];
  if(!impacts.every(Number.isFinite) || impacts.some(n=>n<0)){
    result.flags.push('ROUTE_IMPACT_UNKNOWN');return result;
  }
  result.maxImpactPct=Math.max(...impacts);
  const hasDecimals=Number.isInteger(decimals)&&decimals>=0&&decimals<=18;
  const market=Number(marketPriceUsd);
  if(!hasDecimals||!(market>0)){
    result.flags.push('INDEPENDENT_PRICE_COMPARISON_MISSING');
  }else{
    const received=Number(BigInt(buy.outAmount))/10**decimals;
    const implied=received>0?40/received:NaN;
    if(!Number.isFinite(implied)||!(implied>0)){
      result.flags.push('ROUTE_PRICE_INVALID');
    }else{
      result.marketVsQuotePct=(implied/market-1)*100;
      if(Math.abs(result.marketVsQuotePct)>25)result.flags.push('DEX_AND_ROUTE_PRICE_DISAGREE_OVER_25_PERCENT');
    }
  }
  if(result.maxImpactPct>5)result.flags.push('HIGH_QUOTE_IMPACT');
  if(result.estimatedRoundTripLossPct>12)result.flags.push('ROUNDTRIP_LOSS_OVER_12_PERCENT');
  if(result.estimatedRoundTripLossPct< -30)result.flags.push('SUSPICIOUS_POSITIVE_ROUNDTRIP');
  result.label=result.flags.length?'ROUTE_CAUTION':'BOTH_DIRECTIONS_QUOTED';
  return result;
}
export async function getRoundTripQuotes(mint,{fetcher=fetch,key=null,marketPriceUsd=null,decimals=null,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}){
  if(!b58.test(mint||'')||mint===USDC)throw Error('Invalid candidate mint');
  const headers={accept:'application/json'};
  if(key)headers['x-api-key']=key;
  const request=async(inputMint,outputMint,amount)=>{
    const url=API+'?'+new URLSearchParams({
      inputMint,outputMint,amount,slippageBps:'200',instructionVersion:'V2'
    });
    const res=await fetcher(url,{headers});
    if(!res.ok)throw Error('Jupiter quote HTTP '+res.status);
    return res.json();
  };
  const buy=await request(USDC,mint,USDC_INPUT);
  if(!/^\d+$/.test(buy?.outAmount||'') || BigInt(buy.outAmount)<=0n)
    return assessRoundTrip(buy,null,{marketPriceUsd,decimals});
  // Jupiter keyless users are limited to 0.5 requests/sec: do not hammer the endpoint.
  await wait(2200);
  const sell=await request(mint,USDC,buy.outAmount);
  return assessRoundTrip(buy,sell,{marketPriceUsd,decimals});
}
