// GeckoTerminal public OHLCV decoder, OFFLINE only. No API requests.
// OHLCV candles are historical interval aggregates, NOT executable tick quotes.
import {isSolanaAddress} from './trader-radar.mjs';
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const asNumber=x=>{if((typeof x!=='number'&&typeof x!=='string')||x==='')return null;
 const n=Number(x);return finite(n)?n:null;};
const stamp=x=>typeof x==='string'&&Number.isFinite(Date.parse(x))?Date.parse(x):null;
export const GECKOTERMINAL_POOLS_API='https://api.geckoterminal.com/api/v2/networks/solana/tokens/{MINT}/pools';
export const GECKOTERMINAL_CANDLES_API='https://api.geckoterminal.com/api/v2/networks/solana/pools/{POOL}/ohlcv/minute';
export function normalizeGeckoPoolOHLCV(payload,{mint,pool,asOf,aggregate=1,maxBars=500}={}){
 const no=reason=>({status:reason,bars:[],executionQuotes:[],completeHistoricalLiquidity:false});
 if(!isSolanaAddress(mint)||!isSolanaAddress(pool)||stamp(asOf)===null)return no('INVALID_IDENTITY_OR_CUTOFF');
 if(![1,5,15].includes(aggregate))return no('INVALID_INTERVAL');
 const base=payload?.meta?.base?.address,raw=payload?.data?.attributes?.ohlcv_list;
 const id=payload?.data?.id;
 if(base!==mint||!Array.isArray(raw))return no('NO_INDEPENDENT_MINT_MATCH');
 if(typeof id==='string'&&!id.includes(pool))return no('POOL_ID_MISMATCH');
 const map=new Map();const cutoff=stamp(asOf);
 for(const bar of raw.slice(0,Math.max(1,Math.min(1000,maxBars)))){
  if(!Array.isArray(bar)||bar.length<6)continue;
  const [secs,...data]=bar,ts=Number(secs)*1000;
  const [open,high,low,close,vol]=data.map(asNumber);
  const closeTs=ts+aggregate*60000;
  if(!Number.isSafeInteger(ts)||ts<=0||closeTs>cutoff||
    ![open,high,low,close,vol].every(x=>finite(x))||
    open<=0||high<=0||low<=0||close<=0||vol<0||high<low||
    high<Math.max(open,close)||low>Math.min(open,close))continue;
  map.set(ts,{mint,pool,startAt:new Date(ts).toISOString(),closeAt:new Date(closeTs).toISOString(),
   openUsd:open,highUsd:high,lowUsd:low,closeUsd:close,volumeUsd:vol,
   historicalLiquidityUsd:null,intervalMinutes:aggregate,source:'GECKOTERMINAL_PUBLIC_OHLCV',
   executablePriceVerified:false});
 }
 return {status:map.size?'INTERVAL_CANDLES_ONLY':'NO_VALID_HISTORICAL_CANDLES',
  bars:[...map.values()].sort((a,b)=>a.startAt.localeCompare(b.startAt)),
  executionQuotes:[],completeHistoricalLiquidity:false,
  caveat:'Pool OHLCV is interval data, cannot prove wallet fill price or executable liquidity. A later pool liquidity reading must not be projected backwards.'};
}
export function joinHistoricalLiquidity(candles=[],snapshots=[],{maxAgeSeconds=120}={}){
 const maxAge=Math.max(1,Math.min(300,Number(maxAgeSeconds)||120))*1000;
 return (Array.isArray(candles)?candles:[]).map(c=>{
  const time=stamp(c?.closeAt);
  const valid=(Array.isArray(snapshots)?snapshots:[]).filter(s=>
   s?.pool===c?.pool&&s?.mint===c?.mint&&stamp(s.at)!==null&&stamp(s.at)<=time&&
   time-stamp(s.at)<=maxAge&&finite(s.liquidityUsd)&&s.liquidityUsd>0&&
   s.observationType==='HISTORICAL_POOL_LIQUIDITY');
  const snapshot=valid.sort((a,b)=>stamp(b.at)-stamp(a.at))[0];
  return {...c,historicalLiquidityUsd:snapshot?.liquidityUsd??null,
   liquidityEvidenceAt:snapshot?.at??null,executablePriceVerified:false,
   usableForExecutionBacktest:false};
 });
}
