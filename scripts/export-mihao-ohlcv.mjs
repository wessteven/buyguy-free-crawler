// Isolated GOGET market OHLCV research export; no production/D1/trading integration.
import {mkdir,writeFile} from 'node:fs/promises';
const pool='Ho1aSG6WGH1FfXdEHrK2f4Ggt1Hoxo9s5jcLMDqeyeBz';
const mint='4CxjZyMNoF1p6eXHXHv1TWpS2X47CuUmLwtGe18spump';
const periods={'1m':['minute',1,60],'5m':['minute',5,300],'15m':['minute',15,900],'1h':['hour',1,3600]};
const now=()=>new Date().toISOString();
const iso=n=>new Date(n*1000).toISOString();
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const beginning=Date.parse(process.env.START_UTC||'2026-10-27T00:00:00Z')/1000;
const ending=Date.parse(process.env.END_UTC||'2026-10-29T00:00:00Z')/1000;
const maxRequests=12;
if(!Number.isInteger(beginning)||!Number.isInteger(ending)||ending<=beginning||ending-beginning>7*86400)
 throw Error('INVALID_UTC_BOUNDED_RANGE');
const outDir='research-candle-export';await mkdir(outDir,{recursive:true});
const reports=[],summary={source:'GeckoTerminal public API',source_version:'20230203',
 chain:'solana',pool,mint,from_utc:iso(beginning),end_utc_exclusive:iso(ending),
 downloaded_at:now(),request_limit:maxRequests,requests:0,periods:{},
 raw_trade_transactions:false,unique_buyers_verified:false,executable_quotes:false,
 warning:'Provider aggregate bars, not independently verified on-chain fills. Missing minute bars are not filled.'};
let incomplete=false;
for(const [label,[timeframe,aggregate,step]] of Object.entries(periods)){
 if(summary.requests>=maxRequests){incomplete=true;break}
 let before=ending,gotStart=false,providerEnded=false,pages=0;const candles=new Map();
 while(before>beginning){
  if(summary.requests>=maxRequests){incomplete=true;break}
  if(summary.requests)await sleep(8000);
  const u=new URL('https://api.geckoterminal.com/api/v2/networks/solana/pools/'+pool+'/ohlcv/'+timeframe);
  for(const [k,v] of Object.entries({aggregate,limit:1000,before_timestamp:before,currency:'usd',token:mint}))u.searchParams.set(k,String(v));
  summary.requests++;const received_at=now();
  const result=await fetch(u,{headers:{accept:'application/json;version=20230203'}});
  if(!result.ok)throw Error('GECKO_HTTP_'+result.status);
  const data=await result.json(),rows=data?.data?.attributes?.ohlcv_list;
  if(!Array.isArray(rows))throw Error('MALFORMED_OHLCV');
  const addresses=[data?.meta?.base?.address,data?.meta?.quote?.address].filter(Boolean).map(s=>s.replace(/^solana_/,''));
  if(addresses.length&&!addresses.includes(mint))throw Error('WRONG_POOL_TOKEN');
  reports.push({label,received_at,url:u.toString(),provider_response:data});pages++;
  if(!rows.length){providerEnded=true;break}
  let oldest=before;
  for(const row of rows){
   if(!Array.isArray(row)||row.length!==6||!Number.isInteger(row[0])||row[0]<=0||
    !row.slice(1).every(v=>typeof v==='number'&&Number.isFinite(v))||
    Math.min(row[1],row[2],row[3],row[4])<=0||row[5]<0||
    row[2]<Math.max(row[1],row[4])||row[3]>Math.min(row[1],row[4]))throw Error('INVALID_CANDLE');
   oldest=Math.min(oldest,row[0]);
   if(row[0]>=beginning&&row[0]+step<=ending){
    if(candles.has(row[0])&&JSON.stringify(candles.get(row[0]))!==JSON.stringify(row))throw Error('CONFLICTING_CANDLE');
    candles.set(row[0],row);
   }
  }
  if(oldest>=before)throw Error('NONADVANCING_CANDLE_CURSOR');
  if(oldest<=beginning){gotStart=true;break}
  if(rows.length<1000){providerEnded=true;break}
  before=oldest;
 }
 const list=[...candles.values()].sort((a,b)=>a[0]-b[0]);
 const csv=['timestamp_s,utc,open_usd,high_usd,low_usd,close_usd,volume_usd,pool,mint',
  ...list.map(r=>[r[0],iso(r[0]),...r.slice(1),pool,mint].join(','))].join('\n')+'\n';
 await writeFile(outDir+'/ohlcv_'+label+'.csv',csv);
 summary.periods[label]={rows:list.length,pages,startReached:gotStart,providerHistoryEnded:providerEnded,
  budgetExceeded:incomplete,first: list.length?iso(list[0][0]):null,
  last:list.length?iso(list[list.length-1][0]):null};
 if(incomplete)break;
}
summary.status=incomplete?'INCOMPLETE_REQUEST_BUDGET':'FETCHED_PROVIDER_AGGREGATES';
await writeFile(outDir+'/raw_responses.json',JSON.stringify(reports,null,2)+'\n');
await writeFile(outDir+'/manifest.json',JSON.stringify(summary,null,2)+'\n');
console.log('GOGET_OHLCV_EXPORT',JSON.stringify({status:summary.status,requests:summary.requests,periods:summary.periods}));
if(!reports.length)process.exitCode=1;
