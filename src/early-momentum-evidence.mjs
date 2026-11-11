// GOGET early-momentum research POC: snapshot-only evidence classification.
// No network, D1, scanner, current rankings, wallet or trading integration.
const mintRE=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const positive=(v,k)=>{
 if(typeof v!=='number'||!Number.isFinite(v)||v<=0)throw Error('INVALID_'+k);
 return v;
};
const isoUTC=(v)=>{
 if(typeof v!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(v)
   ||!Number.isFinite(Date.parse(v)))throw Error('EXACT_UTC_SNAPSHOT_TIME_REQUIRED');
 return v;
};

/**
 * Classify only one timestamped as-of research observation.
 * No future candles or later screenshot are accepted as an input.
 * A quoted level is a user-defined hypothesis, NOT confirmed resistance.
 */
export function evaluateEarlyMomentumSnapshot({
 mint,asOf,price,ema9_15m,ema21_15m,ema9_1h,atr15m,
 confirmationLow,confirmationHigh,evidenceSource='USER_SUPPLIED_INDICATORS'
}={}){
 if(!mintRE.test(mint||''))throw Error('VALID_MINT_REQUIRED');
 isoUTC(asOf);
 for(const [key,value] of Object.entries({
  price,ema9_15m,ema21_15m,ema9_1h,atr15m,confirmationLow,confirmationHigh
 }))positive(value,key);
 if(confirmationLow>=confirmationHigh)throw Error('INVALID_CONFIRMATION_ZONE');
 const levelState=price<confirmationLow?'BELOW_CONFIRMATION':
  price<confirmationHigh?'INSIDE_CONFIRMATION_ZONE':'ABOVE_ZONE_UNCONFIRMED';
 return {
  kind:'RESEARCH_ONLY_SNAPSHOT',asOf,mint,levelState,
  candidateClass:levelState==='BELOW_CONFIRMATION'?'CONFIRMATION_PENDING':
   'PRICE_ZONE_CROSSED_NOT_MOMENTUM_CONFIRMED',
  price,over15mEma9:price>ema9_15m,over15mEma21:price>ema21_15m,
  over1hEma9:price>ema9_1h,
  atrPctOfPrice:100*atr15m/price,
  distanceToConfirmationPct:100*(confirmationLow-price)/price,
  indicatorSource:evidenceSource,
  candlesVerified:false,independentBuyersVerified:false,
  uniqueBuyers:null,transactionCompleteness:null,
  liquidityVerified:false,executableExitVerified:false,buyQualified:false,
  caution:'Price crossing a research level does not verify a sustained breakout. No future data, independent trades or executable quotes were supplied.'
 };
}

/**
 * A later undated screenshot may demonstrate an observed price comparison.
 * It must never be used to assert what was known or executable at prior time.
 */
export function compareUndatedMarketImage({baselinePrice,observedPrice}={}){
 positive(baselinePrice,'baselinePrice');positive(observedPrice,'observedPrice');
 return {kind:'UNDATED_SCREENSHOT_PRICE_COMPARISON',
  percentDifference:(observedPrice/baselinePrice-1)*100,
  screenshotTime:null,signalTime:null,breakoutTime:null,
  executableReturn:null,buyQualified:false,
  caution:'Price comparison only; screenshot lacks a verified capture time, OHLCV and executable fills.'};
}
