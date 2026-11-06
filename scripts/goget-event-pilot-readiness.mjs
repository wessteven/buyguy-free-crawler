// Read-only GOGET pilot admission and independently measured provider usage audit.
// Uses existing GitHub Actions secrets, prints only bounded aggregate facts.
const account=process.env.CF_ACCOUNT_ID,dbId=process.env.CF_DATABASE_ID;
const d1token=process.env.CF_D1_API_TOKEN,cfToken=process.env.CF_DEPLOY_API_TOKEN;
if(!account||!dbId||!d1token)throw Error('PILOT_READINESS_CREDENTIALS_MISSING');
const now=Date.now(),ago=m=>new Date(now-m*60000).toISOString();
async function query(label,sql,params=[]){
 try{
  const response=await fetch('https://api.cloudflare.com/client/v4/accounts/'+account+'/d1/database/'+dbId+'/query',{
   method:'POST',headers:{authorization:'Bearer '+d1token,'content-type':'application/json'},
   body:JSON.stringify({sql,params}),signal:AbortSignal.timeout(18000)});
  const data=await response.json();
  if(response.status!==200||data.success!==true||data.result?.[0]?.success!==true){
   const errors=(data.result?.[0]?.error||data.errors||'UNVERIFIED');
   console.log('PILOT_READINESS',label,JSON.stringify({status:'D1_QUERY_FAILED',http:response.status,errorType:typeof errors==='string'?errors.slice(0,90):'PROVIDER_ERROR'}));
   return null;
  }
  const out=(data.result[0].results||[]).slice(0,30);
  console.log('PILOT_READINESS',label,JSON.stringify({status:'PROVIDER_MEASURED',rows:out}));
  return out;
 }catch(e){console.log('PILOT_READINESS',label,JSON.stringify({status:'D1_REQUEST_UNVERIFIED',type:e.name}));return null;}
}
const countSQL=`SELECT COUNT(*) AS n FROM assets a WHERE a.chain='solana'
 AND a.pool IS NOT NULL AND LENGTH(a.pool) BETWEEN 32 AND 44
 AND EXISTS (SELECT 1 FROM observations o WHERE o.asset_key=a.asset_key
 AND o.pool=a.pool AND o.price>0 AND o.seen_at >= ? AND o.seen_at<=?)`;
const countSample=`SELECT COUNT(*) AS n FROM assets a WHERE a.chain='solana'
 AND a.pool IS NOT NULL AND EXISTS(SELECT 1 FROM chain_radar_samples r
 WHERE r.chain='solana' AND r.pool=a.pool AND r.minute>=? AND r.minute<=?
 AND r.price_sol>0)`;
await query('all_solana_assets','SELECT COUNT(*) AS n FROM assets WHERE chain=?',['solana']);
await query('solana_pooled_assets','SELECT COUNT(*) AS n FROM assets WHERE chain=? AND pool IS NOT NULL',['solana']);
for(const m of [10,30,120,1440]){
 await query('matching_observed_pools_'+m+'m',countSQL,[ago(m),ago(0)]);
}
for(const m of [10,30,120]){
 await query('matching_native_candle_pools_'+m+'m',countSample,[ago(m),ago(0)]);
}
await query('newest_exact_pooled_observations',`SELECT a.asset_key,a.address AS mint,a.pool,
 MAX(o.seen_at) AS quote_at,MAX(a.last_seen) AS discovery_at
 FROM assets a JOIN observations o ON o.asset_key=a.asset_key AND o.pool=a.pool
 WHERE a.chain='solana' AND o.price>0 AND o.seen_at>=?
 GROUP BY a.asset_key,a.pool,a.address ORDER BY quote_at DESC LIMIT 18`,[ago(1440)]);
await query('recent_pilot_runs',`SELECT run_id,started_at,ends_at,status,requested_pools,
 armed_pools,reserved_credits,unique_events,ws_connections,stream_gap_count,
 rpc_attempts,provider_billed_credits,cloudflare_billed_usd
 FROM goget_event_pilot_runs ORDER BY started_at DESC LIMIT 3`);
await query('reconciliation_counts',`SELECT status,COUNT(*) AS n,SUM(missing) AS missing_events
 FROM goget_event_pilot_reconciliation GROUP BY status LIMIT 10`);
await query('hour_outcomes',`SELECT status,COUNT(*) AS n FROM goget_event_pilot_outcomes
 WHERE horizon_min=60 GROUP BY status LIMIT 10`);
if(cfToken){
 const q=`query Metrics($accountTag:string,$datetimeStart:string,$datetimeEnd:string,$scriptName:string){
 viewer { accounts(filter:{accountTag:$accountTag}){
 workersInvocationsAdaptive(limit:100,filter:{scriptName:$scriptName,datetime_geq:$datetimeStart,datetime_leq:$datetimeEnd}){
 sum{requests errors subrequests} quantiles{cpuTimeP50 cpuTimeP99}
 dimensions{datetime scriptName status}
 }}}}`;
 try{
  const response=await fetch('https://api.cloudflare.com/client/v4/graphql',{
   method:'POST',headers:{authorization:'Bearer '+cfToken,'content-type':'application/json'},
   body:JSON.stringify({query:q,variables:{accountTag:account,datetimeStart:ago(360),datetimeEnd:ago(0),
     scriptName:'goget-event-stream-pilot'}}),signal:AbortSignal.timeout(20000)});
  const result=await response.json(),values=result.data?.viewer?.accounts?.flatMap(a=>a.workersInvocationsAdaptive||[])||[];
  console.log('PILOT_PROVIDER_USAGE_CLOUDFLARE',JSON.stringify({
   status:result.errors?.length?'ANALYTICS_ERROR':response.ok?'METERED_METRICS':'HTTP_UNVERIFIED',
   http:response.status,measuredRequests:values.reduce((n,x)=>n+(Number(x.sum?.requests)||0),0),
   measuredErrors:values.reduce((n,x)=>n+(Number(x.sum?.errors)||0),0),
   measuredSubrequests:values.reduce((n,x)=>n+(Number(x.sum?.subrequests)||0),0),
   groupsReturned:values.length,
   warnings:result.errors?.map(x=>x.message?.slice(0,120)).slice(0,2)||[],
   billedUsd:null,meaning:'Cloudflare account-measured Worker invocation metrics; not invoice-level cost'}));
 }catch(e){console.log('PILOT_PROVIDER_USAGE_CLOUDFLARE',JSON.stringify({status:'UNAVAILABLE',errorType:e.name}));}
}
// Helius Admin usage requires provider project ID and Admin API entitlement;
// the RPC API key alone is not sufficient to assert a billed credit delta.
console.log('PILOT_PROVIDER_USAGE_HELIUS',JSON.stringify({
 status:process.env.HELIUS_PROJECT_ID?'PROJECT_ID_AVAILABLE_ADMIN_QUERY_NOT_INSTALLED':'PROJECT_ID_OR_ADMIN_ACCESS_UNAVAILABLE',
 billedCredits:null,meaning:'Provider meter requires project-scoped Admin API usage or account dashboard export'}));
