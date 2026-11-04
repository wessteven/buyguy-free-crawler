#!/usr/bin/env node
// Probe exact historical GeckoTerminal pool candles, READ ONLY, no Helius calls.
import {writeFile} from 'node:fs/promises';
import {parseHistoricalOhlcv,matchHistoricOutcome,HISTORY_BOUNDS} from '../src/goget-historical-ohlcv.mjs';
const required=n=>{const x=process.env[n];if(!x)throw Error('MISSING_'+n);return x;};
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function main(){
 const account=required('CF_ACCOUNT_ID'),database=required('CF_DATABASE_ID'),
   token=required('CF_D1_API_TOKEN');
 const d1url='https://api.cloudflare.com/client/v4/accounts/'+encodeURIComponent(account)+
   '/d1/database/'+encodeURIComponent(database)+'/query';
 const d1=await fetch(d1url,{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},
   body:JSON.stringify({sql:"SELECT o.pool,o.mint,COUNT(*) AS n,MIN(o.due_at) AS first_due,MAX(o.due_at) AS last_due FROM goget_pre_signal_market_outcomes o WHERE o.status='MISSING_FUTURE_USD_QUOTE_COVERAGE' GROUP BY o.pool,o.mint ORDER BY n DESC LIMIT 5",params:[]}),
   signal:AbortSignal.timeout(15000)});
 if(!d1.ok)throw Error('D1_HTTP_'+d1.status);
 const body=await d1.json();
 if(body?.success!==true||body?.result?.[0]?.success!==true||
    !Array.isArray(body?.result?.[0]?.results))throw Error('D1_INVALID');
 const groups=body.result[0].results;
 if(groups.length>HISTORY_BOUNDS.maxPoolReads)throw Error('POOL_LIMIT');
 let requests=0;
 const results=[];
 for(const g of groups.slice(0,1)){
  for(const due of [g.first_due]){
   if(requests>=HISTORY_BOUNDS.maxApiCalls)break;
   if(!Number.isFinite(Date.parse(due)))throw Error('BAD_DB_TIME');
   if(requests)await wait(7300); // conservative under public ~10/min budget
   const until=Math.floor((Date.parse(due)+11*60000)/1000);
   const u=new URL('https://api.geckoterminal.com/api/v2/networks/solana/pools/'+encodeURIComponent(g.pool)+'/ohlcv/minute');
   for(const [k,v] of Object.entries({aggregate:'1',before_timestamp:String(until),
    limit:'90',currency:'usd',token:g.mint}))u.searchParams.set(k,v);
   requests++;
   try{
    const r=await fetch(u,{headers:{accept:'application/json;version=20230203'},
      signal:AbortSignal.timeout(HISTORY_BOUNDS.fetchTimeoutMs)});
    if(r.status===429){results.push({pool:g.pool,mint:g.mint,due,kind:'RATE_LIMITED'});break;}
    if(!r.ok){results.push({pool:g.pool,mint:g.mint,due,kind:'HTTP_'+r.status});continue;}
    const size=r.headers.get('content-length');
    if(size&&Number(size)>HISTORY_BOUNDS.maxBytes)throw Error('OVERSIZE');
    const text=await r.text();
    if(text.length>HISTORY_BOUNDS.maxBytes)throw Error('OVERSIZE');
    const payload=JSON.parse(text);
    if(requests===1)console.log('GOGET_OHLCV_PROVIDER_SHAPE',JSON.stringify({
      id:String(payload?.data?.id||'').slice(0,160),
      base:String(payload?.meta?.base?.address||payload?.meta?.base?.id||'').slice(0,140),
      quote:String(payload?.meta?.quote?.address||payload?.meta?.quote?.id||'').slice(0,140),
      candleCount:payload?.data?.attributes?.ohlcv_list?.length??null,
      keys:Object.keys(payload?.data||{}).slice(0,8)
    }));
    const parsed=parseHistoricalOhlcv(payload,{mint:g.mint,pool:g.pool});
    const evidence=matchHistoricOutcome({due_at:due,reference_price_usd:1},parsed.candles);
    results.push({pool:g.pool,mint:g.mint,due,kind:evidence.status,
       candleAt:evidence.candleAt,closeUsd:evidence.candleCloseUsd,
       availableCandles:parsed.candles.length});
   }catch(e){
    const allowed=new Set(['MINT_IDENTITY_UNVERIFIED','POOL_IDENTITY_MISMATCH',
      'INVALID_CANDLE_RECORD','HISTORICAL_CANDLE_RESPONSE_INVALID',
      'INVALID_CANDLE_VALUE','CANDLE_PRICE_RANGE_INVALID','OVERSIZE']);
    results.push({pool:g.pool,mint:g.mint,due,
      kind:allowed.has(e?.message)?e.message:'FETCH_OR_RESPONSE_UNAVAILABLE'});
   }
  }
 }
 const report={at:new Date().toISOString(),mode:'DRY_RUN_NO_DB_WRITES',
   poolGroups:groups.length,requests,success:results.filter(x=>x.kind==='HISTORICAL_INDICATIVE_OHLCV_MATCH').length,
   results,provider:'GECKOTERMINAL_PUBLIC_POOL_OHLCV',heliusCalls:0,d1Writes:0,
   caveat:'Historical same-pool minute candles are not contemporaneously observed quotes, liquidity proof, or executable prices'};
 await writeFile('goget-ohlcv-recovery-probe.json',JSON.stringify(report,null,2)+'\n');
 console.log('GOGET_HISTORIC_OHLCV_PROBE',JSON.stringify(report));
}
main().catch(e=>{console.error('GOGET_HISTORIC_OHLCV_ERROR',/^D1_HTTP_\d+$/.test(e?.message||'')?e.message:'UNVERIFIED');process.exitCode=1;});
