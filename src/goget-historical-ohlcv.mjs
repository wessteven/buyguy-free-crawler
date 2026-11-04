// Historical OHLCV evidence only: never alter forward-only GOGET outcome labels.
// GeckoTerminal candles are indicative trading prices, not executable entry/exit quotes.
const BASE58=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
export const HISTORY_BOUNDS=Object.freeze({
 maxPoolReads:5,maxMissingRows:100,maxApiCalls:10,maxCandles:160,
 maxBytes:300000,forwardWindowMinutes:10,fetchTimeoutMs:10000
});
const norm=x=>typeof x==='string'?x.replace(/^solana[_:]/,''):null;
const positive=x=>x!==null&&x!==undefined&&x!==''&&Number.isFinite(Number(x))&&Number(x)>0?Number(x):null;
export function parseHistoricalOhlcv(payload,{mint,pool}={}){
 if(!BASE58.test(mint||'')||!BASE58.test(pool||''))throw Error('INVALID_EXACT_PAIR');
 const meta=payload?.meta,sourcePool=norm(payload?.data?.id||'');
 const a=norm(meta?.base?.address||meta?.base?.id);
 const b=norm(meta?.quote?.address||meta?.quote?.id);
 if(sourcePool&&sourcePool!==pool)throw Error('POOL_IDENTITY_MISMATCH');
 if(a!==mint&&b!==mint)throw Error('MINT_IDENTITY_UNVERIFIED');
 const list=payload?.data?.attributes?.ohlcv_list;
 if(!Array.isArray(list)||list.length>HISTORY_BOUNDS.maxCandles)
   throw Error('HISTORICAL_CANDLE_RESPONSE_INVALID');
 const candles=[];
 for(const record of list){
  if(!Array.isArray(record)||record.length<6)throw Error('INVALID_CANDLE_RECORD');
  const [unix,open,high,low,close,volume]=record;
  if(!Number.isSafeInteger(unix)||unix<1500000000||
     !positive(open)||!positive(high)||!positive(low)||!positive(close)||
     !Number.isFinite(Number(volume))||Number(volume)<0)
    throw Error('INVALID_CANDLE_VALUE');
  if(Number(high)<Number(low))throw Error('CANDLE_PRICE_RANGE_INVALID');
  candles.push({candleAt:new Date(unix*1000).toISOString(),unix,
    closeUsd:Number(close),volumeUsd:Number(volume)});
 }
 return {mint,pool,quoteTokenMint:mint,provider:'GECKOTERMINAL_PUBLIC_HISTORICAL_OHLCV',
  validatedPoolFromEndpoint:true,validatedMintFromMetadata:true,candles};
}
export function matchHistoricOutcome(row,candles){
 const due=Date.parse(row?.due_at||'');
 const ref=positive(row?.reference_price_usd);
 if(!Number.isFinite(due)||!ref||!Array.isArray(candles))throw Error('INVALID_OUTCOME_ANCHOR');
 const end=due+HISTORY_BOUNDS.forwardWindowMinutes*60000;
 // Conservative rule: candle START must not precede dueAt; never use a
 // candle opened before the desired forward-time boundary.
 const possible=candles.filter(c=>{
  const t=Date.parse(c.candleAt||'');
  return Number.isFinite(t)&&t>=due&&t<=end&&positive(c.closeUsd);
 }).sort((a,b)=>a.candleAt.localeCompare(b.candleAt));
 if(!possible.length)return {status:'NO_POST_DUE_CANDLE_IN_WINDOW',changePct:null,
   candleAt:null,candleCloseUsd:null};
 const c=possible[0];
 const pct=(c.closeUsd/ref-1)*100;
 return {status:'HISTORICAL_INDICATIVE_OHLCV_MATCH',
   changePct:Number.isFinite(pct)?Math.round(pct*10000)/10000:null,
   candleAt:c.candleAt,candleCloseUsd:c.closeUsd,
   referenceUsd:ref,sourceKind:'BACKFILLED_AFTER_THE_FACT_NOT_FORWARD_OBSERVED'};
}
