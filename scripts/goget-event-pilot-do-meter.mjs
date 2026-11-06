// Provider-measured Cloudflare Durable Object usage, read-only; never confuses estimates with invoiced charges.
const account=process.env.CF_ACCOUNT_ID,token=process.env.CF_DEPLOY_API_TOKEN;
if(!/^[a-f0-9]{32}$/i.test(account||'')||typeof token!=='string'||token.length<16)
 throw Error('PILOT_DO_USAGE_CREDENTIALS_UNAVAILABLE');
const day=new Date(Date.now()-6*3600000).toISOString().slice(0,10);
const query=`query Usage($account:String!) {
 viewer { accounts(filter:{accountTag:$account}) {
  durableObjectsPeriodicGroups(limit:1000,filter:{date_geq:"${day}"}) {
   dimensions { name namespaceId datetimeFiveMinutes }
   sum { duration cpuTime activeTime inboundWebsocketMsgCount
    outboundWebsocketMsgCount rowsRead rowsWritten subrequests }
  }
 } }
}`;
try{
 const r=await fetch('https://api.cloudflare.com/client/v4/graphql',{
  method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},
  body:JSON.stringify({query,variables:{account}}),signal:AbortSignal.timeout(20000)});
 const response=await r.json();
 if(!r.ok||response.errors?.length||!Array.isArray(response.data?.viewer?.accounts)){
  console.log('GOGET_PROVIDER_DO_USAGE',JSON.stringify({status:'PROVIDER_METRICS_UNAVAILABLE',http:r.status,
   errorTypes:response.errors?.map(x=>String(x.message).slice(0,100)).slice(0,3)||[]}));
  process.exit(0);
 }
 const all=response.data.viewer.accounts.flatMap(x=>x.durableObjectsPeriodicGroups||[]);
 const exact=all.filter(x=>x?.dimensions?.name==='goget-independent-stream-pilot-v1');
 const sum=(k,src=exact)=>src.reduce((a,x)=>a+(Number(x.sum?.[k])||0),0);
 const namespaces=[...new Set(exact.map(x=>x.dimensions.namespaceId))];
 console.log('GOGET_PROVIDER_DO_USAGE',JSON.stringify({
  status:exact.length?'EXACT_NAMED_OBJECT_PROVIDER_MEASURED':'EXACT_OBJECT_NOT_REPORTED',
  name:'goget-independent-stream-pilot-v1',groups:exact.length,
  namespacesCount:namespaces.length,
  durationGbSeconds:sum('duration'),cpuMicroseconds:sum('cpuTime'),
  activeMicroseconds:sum('activeTime'),
  inboundWebsocketMessages:sum('inboundWebsocketMsgCount'),
  outboundWebsocketMessages:sum('outboundWebsocketMsgCount'),
  sqliteRowsRead:sum('rowsRead'),sqliteRowsWritten:sum('rowsWritten'),
  subrequests:sum('subrequests'),
  providerBilledUSD:null,
  accountWidePeriodicGroups:all.length,
  note:'Cloudflare account-supplied periodic metrics with exact Durable Object name; not a billing invoice. In-progress windows may lag.'
 }));
}catch(e){console.log('GOGET_PROVIDER_DO_USAGE',JSON.stringify({status:'REQUEST_UNAVAILABLE',errorType:e.name}));}
