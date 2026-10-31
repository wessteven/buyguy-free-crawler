#!/usr/bin/env node
// Read-only Cloudflare capacity audit. No billing changes, writes, private keys, raw payloads or API tokens logged.
const required = name => {const v=process.env[name];if(!v)throw Error('MISSING_'+name);return v;};
const numbers = x => typeof x==='number'&&Number.isFinite(x)?x:null;
async function call(url,token,{method='GET',body}={}){
  const response=await fetch(url,{method,headers:{authorization:'Bearer '+token,accept:'application/json',...(body?{'content-type':'application/json'}:{})},
    ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(18000)});
  if(!response.ok)throw Error('CLOUDFLARE_HTTP_'+response.status);
  const r=await response.json();if(r?.success===false)throw Error('CLOUDFLARE_API_REJECTED');
  return r;
}
async function main(){
  const account=required('CF_ACCOUNT_ID'),database=required('CF_DATABASE_ID'),key=required('CF_D1_API_TOKEN');
  const base='https://api.cloudflare.com/client/v4/accounts/'+encodeURIComponent(account)+'/d1/database/'+encodeURIComponent(database);
  const answer={at:new Date().toISOString(),accountPlan:'NOT_VERIFIED',
    databaseBytes:null,bytesInMiB:null,tableCounts:{},last24Hours:{},rowEvidenceBytes:null,
    graphqlUsage30d:{status:'UNAVAILABLE'},notes:[
    'Usage is for the designated GOGET D1 database only; there may be other Cloudflare services and databases.',
    'Database file size is a capacity measure, not a monthly bill.',
    'Helius credits and webhook costs are a separate provider and not covered by Workers Paid.'
  ]};
  try{
    const info=(await call(base,key)).result||{};
    answer.databaseBytes=numbers(info.file_size);
    if(answer.databaseBytes!==null)answer.bytesInMiB=Math.round(answer.databaseBytes/1048576*100)/100;
  }catch(e){answer.databaseMetadata='UNAVAILABLE_'+(/CLOUDFLARE_HTTP_\d+/.exec(e.message)?.[0]||'UNKNOWN');}
  const query=async(sql,params=[])=>{
    const response=await call(base+'/query',key,{method:'POST',body:{sql,params}});
    if(response.result?.[0]?.success!==true)throw Error('QUERY_FAILED');
    return response.result[0].results||[];
  };
  const tasks=[
    ['webhook',"SELECT COUNT(*) AS n,COALESCE(SUM(length(evidence_json)),0) AS evidence_bytes,MIN(observed_at) AS first_at,MAX(observed_at) AS latest_at FROM smart_wallet_webhook_events",[]],
    ['webhook24h',"SELECT COUNT(*) AS n,COUNT(DISTINCT wallet) AS wallets FROM smart_wallet_webhook_events WHERE observed_at>=?",[new Date(Date.now()-86400000).toISOString()]],
    ['webhookSchemaVersions',"SELECT COALESCE(json_extract(evidence_json, '$.schemaVersion'), 1) AS schema_version, COUNT(*) AS n FROM smart_wallet_webhook_events WHERE observed_at>=? GROUP BY schema_version ORDER BY schema_version",[new Date(Date.now()-86400000).toISOString()]],
    ['expandedWebhook',"SELECT COUNT(*) AS n,COUNT(DISTINCT wallet) AS wallets,MAX(observed_at) AS last_at FROM smart_wallet_webhook_events WHERE observed_at>=?",['2026-10-31T04:24:53.000Z']],
    ['wallet_polling',"SELECT COUNT(*) AS n,MIN(observed_at) AS first_at,MAX(observed_at) AS latest_at FROM smart_wallet_live_events",[]],
    ['wallet_polling24h',"SELECT COUNT(*) AS n FROM smart_wallet_live_events WHERE observed_at>=?",[new Date(Date.now()-86400000).toISOString()]],
    ['webhook_daily',"SELECT day,reserved FROM smart_wallet_webhook_budget ORDER BY day DESC LIMIT 7",[]],
    ['webhook_wallets',"SELECT wallet,COUNT(*) AS n FROM smart_wallet_webhook_events WHERE observed_at>=? GROUP BY wallet ORDER BY n DESC LIMIT 30",[new Date(Date.now()-86400000).toISOString()]],
    ['tables',"SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name LIMIT 100",[]],
  ];
  for(const [name,sql,params] of tasks){
    try{answer.tableCounts[name]=await query(sql,params)}
    catch(e){answer.tableCounts[name]=/CLOUDFLARE_HTTP_\d+/.exec(e.message)?.[0]||'QUERY_UNAVAILABLE';}
  }
  // Optional read-only R2 bucket inventory; no bucket created and no billing changes.
  try {
    const r2token=process.env.CF_DEPLOY_API_TOKEN||key;
    const buckets=(await call('https://api.cloudflare.com/client/v4/accounts/'+encodeURIComponent(account)+'/r2/buckets',r2token)).result?.buckets;
    answer.r2={status:Array.isArray(buckets)?'AVAILABLE':'UNVERIFIED',
      namedGogetBuckets:Array.isArray(buckets)?buckets.filter(b=>/goget|buyguy|radar/i.test(b.name||'')).length:null};
  }catch {answer.r2={status:'PERMISSIONS_OR_SERVICE_UNAVAILABLE'};}
  const graphqlToken=process.env.CF_ANALYTICS_API_TOKEN||key;
  const date=new Date().toISOString().slice(0,10),start=new Date(Date.now()-30*86400000).toISOString().slice(0,10);
  const q='query($accountTag: string!, $start: Date, $end: Date, $databaseId: string){ viewer { accounts(filter:{accountTag:$accountTag}) { d1AnalyticsAdaptiveGroups(limit:1000, filter:{date_geq:$start,date_leq:$end,databaseId:$databaseId}) { sum {rowsRead rowsWritten readQueries writeQueries} } } } }';
  try{
    const g=await call('https://api.cloudflare.com/client/v4/graphql',graphqlToken,
      {method:'POST',body:{query:q,variables:{accountTag:account,start,end:date,databaseId:database}}});
    const groups=g?.data?.viewer?.accounts?.[0]?.d1AnalyticsAdaptiveGroups||[];
    answer.graphqlUsage30d=Array.isArray(groups)?{
      status:'AVAILABLE',daysQueried:30,
      totals:groups.reduce((a,x)=>{for(const k of ['rowsRead','rowsWritten','readQueries','writeQueries'])
        a[k]=(a[k]||0)+(numbers(x?.sum?.[k])||0);return a;},{}),
      groupCount:groups.length}: {status:'NO_ANALYTICS_RESPONSE'};
  }catch{answer.graphqlUsage30d={status:'PERMISSION_OR_API_UNAVAILABLE'};}
  const info=answer.tableCounts.webhook?.[0];
  if(info && typeof info==='object')answer.rowEvidenceBytes=numbers(info.evidence_bytes);
  console.log('GOGET_CAPACITY_AUDIT',JSON.stringify(answer));
}
main().catch(e=>{console.error('GOGET_CAPACITY_AUDIT_FAILED',/^MISSING_[A-Z_]+$/.test(e.message)?e.message:'READ_ONLY_AUDIT_FAILED');process.exitCode=1;});
