// Public OHLCV evidence probe; bounded, read-only and explicitly NON-executable.
// No account credentials, no D1, no trading, no token promotion.
import {normalizeGeckoPoolOHLCV} from '../src/trader-radar-gecko-candles.mjs';
const mint='Cbkg5w7V7W2J2sUmecnyN825CbvwvXwasfhduVtNpump';
const pool='YQ4NNeQxHAtdcB8ohx21eJ9U8eTzxNRvGNHkRaA4Pnw';
const asOf='2026-10-21T07:00:00Z';
const url='https://api.geckoterminal.com/api/v2/networks/solana/pools/'+pool+'/ohlcv/minute?aggregate=1&limit=240&currency=usd&before_timestamp='+Math.floor(Date.parse(asOf)/1000);
const events=[
 {name:'PHP_FIRST_ACQUISITION',at:'2026-10-21T05:14:39Z'},
 {name:'PHP_LAST_ACQUISITION',at:'2026-10-21T05:22:48Z'},
 {name:'PHP_FIRST_DISPOSAL',at:'2026-10-21T06:06:39Z'},
 {name:'PHP_LAST_DISPOSAL',at:'2026-10-21T06:15:30Z'}
];
const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),12000);
let result={status:'NO_PROVIDER_RESPONSE',mint,pool,barCount:0,examples:[],historicalLiquidityVerified:false,
  executableQuotesVerified:false};
try{
 const response=await fetch(url,{signal:controller.signal,headers:{accept:'application/json;version=20230203'}});
 if(!response.ok)result.status='HTTP_'+response.status;
 else{
  const raw=await response.json();
  if(raw?.errors?.length)result.status='PROVIDER_ERROR';
  else{
   const decoded=normalizeGeckoPoolOHLCV(raw,{mint,pool,asOf,maxBars:240,endpointPoolExact:true});
   result.status=decoded.status;
   result.providerSeriesId=String(raw?.data?.id||'').slice(0,160);
   result.providerSeriesType=raw?.data?.type||null;
   result.providerBaseMint=raw?.meta?.base?.address||null;
   result.providerBarsReturned=Array.isArray(raw?.data?.attributes?.ohlcv_list)?raw.data.attributes.ohlcv_list.length:0;
   result.barCount=decoded.bars.length;
   result.earliestBar=decoded.bars[0]?.closeAt??null;
   result.latestBar=decoded.bars.at(-1)?.closeAt??null;
   result.examples=events.map(e=>{
    const cutoff=Date.parse(e.at)+60000;
    const later=decoded.bars.find(x=>Date.parse(x.closeAt)>=cutoff&&Date.parse(x.closeAt)-cutoff<=120000);
    return {event:e.name,eventAt:e.at,
     barClosedAt:later?.closeAt??null,barCloseUsd:later?.closeUsd??null,
     barHighUsd:later?.highUsd??null,barLowUsd:later?.lowUsd??null,
     independentHistoricalLiquidityVerified:false,
     executableQuoteVerified:false};
   });
  }
 }
}catch(error){result.status=error?.name==='AbortError'?'PUBLIC_OHLCV_TIMEOUT':'PUBLIC_OHLCV_UNAVAILABLE';}
finally{clearTimeout(timeout);}
console.log('TRADER_RADAR_PUBLIC_OHLCV',JSON.stringify({...result,
 quoteCurrency:'USD',asOf,claimedPriceType:'CLOSED_INTERVAL_OHLCV_ONLY',
 matchedControlReturn:null,predictiveAlphaEstablished:false,
 caveat:'Historical pool candle close is not an executable fill and lacks independently timestamped liquidity. Never backfill contemporaneous depth from live pool reserves.'}));
