// Strict point-in-time minute OHLCV audit for original missing future USD outcomes.
// Historical-only: candle timestamps must be exactly minute-aligned and matched
// to the ORIGINAL mint/pool/due timestamp, never silently shifted or inferred.
import {parseHistoricalOhlcv,matchHistoricOutcome} from './goget-historical-ohlcv.mjs';
export const MINUTE_REPLAY_LIMITS=Object.freeze({
 perRunApiCalls:4,dailyApiCalls:96,minimumGapMs:8500,
 maxBytes:400000,maxCandles:180,expectedMaxGapMinutes:10,
 maxSourceResultRows:5,maxD1Calls:60,maxRetries:3,
 retryDelayMinutes:90,stopUtc:'2026-11-08T00:00:00Z',
 heliusCalls:0,trades:0
});
const b58=s=>typeof s==='string'&&/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s);
export function requireOriginalOutcome(o,{asOf=Date.now()}={}){
 const due=Date.parse(o?.due_at||'');
 if(!b58(o?.pool)||!b58(o?.mint)||!Number.isFinite(due)||
  due>asOf-11*60000||due<1500000000000||
  ![5,60,360,1440].includes(Number(o?.horizon_min))||
  !Number.isFinite(Number(o?.reference_price_usd))||Number(o.reference_price_usd)<=0||
  typeof o.bucket!=='string'||!o.bucket||
  o.status!=='MISSING_FUTURE_USD_QUOTE_COVERAGE')
  throw Error('MINUTE_ORIGINAL_OUTCOME_UNVERIFIED');
 return {...o,dueAt:due};
}
export function assessExactMinuteCandles(payload,row,{asOf=Date.now()}={}){
 const x=requireOriginalOutcome(row,{asOf});
 const parsed=parseHistoricalOhlcv(payload,{mint:x.mint,pool:x.pool});
 if(parsed.candles.length>MINUTE_REPLAY_LIMITS.maxCandles)
  throw Error('MINUTE_CANDLE_RESPONSE_TOO_LONG');
 const seen=new Set();
 for(const c of parsed.candles){
  if(!Number.isSafeInteger(c.unix)||c.unix%60!==0||seen.has(c.unix))
   throw Error('MINUTE_PROVIDER_SERIES_UNVERIFIED');
  seen.add(c.unix);
 }
 const due=x.dueAt,begin=Math.ceil(due/60000)*60000,
   final=Math.floor((due+10*60000)/60000)*60000;
 const wanted=[];
 for(let when=begin;when<=final;when+=60000)wanted.push(when/1000);
 const available=parsed.candles.filter(c=>wanted.includes(c.unix));
 const covered=new Set(available.map(c=>c.unix));
 const missing=wanted.filter(t=>!covered.has(t));
 const match=matchHistoricOutcome(row,parsed.candles);
 const selected=available.sort((a,b)=>a.unix-b.unix)[0]??null;
 if((match.status==='HISTORICAL_INDICATIVE_OHLCV_MATCH')!==!!selected||
  (selected&&selected.candleAt!==match.candleAt))
  throw Error('MINUTE_MATCH_RECONCILIATION_FAILED');
 return {status:selected?'RETROSPECTIVE_ONE_MINUTE_USD_CLOSE_MATCH':
  'NO_POST_DUE_ONE_MINUTE_CANDLE_IN_TEN_MINUTES',
  pool:x.pool,mint:x.mint,bucket:x.bucket,horizonMin:x.horizon_min,
  dueAt:x.due_at,matchAt:selected?.candleAt??null,closeUsd:selected?.closeUsd??null,
  matchedChangePct:match.changePct,
  expectedOneMinuteCells:wanted.length,observedOneMinuteCells:available.length,
  missingOneMinuteCells:missing.length,
  missingMinuteStarts:missing.slice(0,11).map(x=>new Date(x*1000).toISOString()),
  completeOneMinuteSeries:missing.length===0,
  exactPoolTokenMetadataVerified:true,
  historicalOnly:true,provider:'GECKOTERMINAL_PUBLIC_HISTORICAL_MINUTE_USD_OHLCV',
  originalAsOfMarketOutcomeReplaced:false,
  certifiedExecutablePrice:false,tradeEligible:false};
}
export function nextMinuteReplayStatus(record,tries){
 if(!Number.isSafeInteger(tries)||tries<1||tries>MINUTE_REPLAY_LIMITS.maxRetries)
  throw Error('MINUTE_ATTEMPT_INVALID');
 return tries>=MINUTE_REPLAY_LIMITS.maxRetries?'PROVIDER_RETRY_EXHAUSTED':
   record==='RATE_LIMITED'?'RATE_LIMITED_RETRY_PENDING':'PROVIDER_RETRY_PENDING';
}
