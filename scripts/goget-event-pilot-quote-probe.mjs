// One-time read-only feasibility test for GOGET exact pool admission.
// Does not insert any quote, alter cooldowns, reserve credits or launch a stream.
const account=process.env.CF_ACCOUNT_ID,db=process.env.CF_DATABASE_ID,key=process.env.CF_D1_API_TOKEN;
if(!account||!db||!key)throw Error('PROBE_EXISTING_D1_MISSING');
const now=Date.now(),at=new Date(now).toISOString(),from=new Date(now-2*3600000).toISOString();
async function d1(sql,params=[]){
 const resp=await fetch('https://api.cloudflare.com/client/v4/accounts/'+account+'/d1/database/'+db+'/query',
  {method:'POST',headers:{authorization:'Bearer '+key,'content-type':'application/json'},
   body:JSON.stringify({sql,params}),signal:AbortSignal.timeout(20000)});
 const body=await resp.json();if(!resp.ok||body.success!==true||
  body.result?.[0]?.success!==true)throw Error('PROBE_D1_READ_UNVERIFIED');
 return body.result[0].results||[];
}
const cooldowns=await d1("SELECT name,expires_at FROM leases WHERE name IN ('discovery-provider:dex','fast-radar:dex-quotes') LIMIT 2");
const presignal=await d1("SELECT name,until_ms FROM goget_pre_signal_provider_state WHERE name='dex' LIMIT 1");
const until=Math.max(0,...cooldowns.map(x=>Number(x.expires_at)||0),...presignal.map(x=>Number(x.until_ms)||0));
if(until>now){console.log('PILOT_EXACT_POOL_PROBE',JSON.stringify({status:'SHARED_PROVIDER_COOLDOWN',minutesRemaining:Math.ceil((until-now)/60000)}));process.exit(0)}
const rows=await d1(`SELECT a.pool,a.address AS mint,a.asset_key,MAX(o.seen_at) AS quote_at,MAX(a.score) AS score
 FROM assets a JOIN observations o ON o.asset_key=a.asset_key AND o.pool=a.pool
 WHERE a.chain='solana' AND o.price>0 AND o.seen_at>=? AND o.seen_at<=?
 GROUP BY a.pool,a.address,a.asset_key ORDER BY MAX(a.score) DESC,quote_at DESC LIMIT 30`,[from,at]);
const valid=x=>typeof x==='string'&&/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(x);
const pools=[...new Set(rows.map(x=>x.pool).filter(valid))].slice(0,30);
if(pools.length<10){console.log('PILOT_EXACT_POOL_PROBE',JSON.stringify({status:'INSUFFICIENT_RECENT_EXACT_POOLS',recentPools:pools.length}));process.exit(0)}
const url='https://api.dexscreener.com/latest/dex/pairs/solana/'+pools.join(',');
let response=null,payload=null;
try{
 response=await fetch(url,{headers:{accept:'application/json','User-Agent':'GOGET-Research-Pilot/1.0'},signal:AbortSignal.timeout(12000)});
 if(!response.ok)throw Error('DEX_HTTP_'+response.status);
 if(Number(response.headers.get('content-length'))>450000)throw Error('DEX_RESPONSE_OVERSIZE');
 const raw=await response.text();if(raw.length>450000)throw Error('DEX_RESPONSE_OVERSIZE');
 payload=JSON.parse(raw);
}catch(e){console.log('PILOT_EXACT_POOL_PROBE',JSON.stringify({status:'LIVE_PROVIDER_UNVERIFIED',type:e.message.slice(0,70),recentPools:pools.length}));process.exit(0)}
const candidates=new Map(rows.map(x=>[x.pool,x]));
const verified=new Map();
for(const pair of Array.isArray(payload?.pairs)?payload.pairs:[]){
 const source=candidates.get(pair?.pairAddress);
 if(!source||pair?.chainId!=='solana'||pair?.baseToken?.address!==source.mint)continue;
 const price=Number(pair.priceUsd),liq=Number(pair.liquidity?.usd);
 if(!(price>0)||!Number.isFinite(price)||!Number.isFinite(liq)||liq<1000)continue;
 verified.set(pair.pairAddress,{pool:source.pool,mint:source.mint,priceUsd:price,liquidityUsd:liq,
   quoteReceiptAt:new Date(Date.now()).toISOString(),asOf:'RECEIPT_TIMESTAMP_ONLY'});
}
console.log('PILOT_EXACT_POOL_PROBE',JSON.stringify({
 status:verified.size>=10?'TEN_CURRENT_EXACT_PAIRS_AVAILABLE':'FEWER_THAN_TEN_CURRENT_EXACT_PAIRS',
 recentCandidates:rows.length,uniquePoolQueries:pools.length,
 exactSameMintAndPoolPriceLiquidityVerified:verified.size,
 verifiedPools:[...verified.values()].slice(0,10),
 caveat:'Public Dex aggregate quotes are indicative and have no exchange-time freshness guarantee; no trades certified or executed'}));
