// Read-only Helius management audit. No registration, deletion, billing or key logging.
export const GOGET_RECEIVER='https://goget-smart-wallet-hook.wessteven.workers.dev/webhook';
const schemes=[
  {host:'https://api-mainnet.helius-rpc.com/v0/webhooks',bearer:true},
  {host:'https://api-mainnet.helius-rpc.com/v0/webhooks',bearer:false},
  {host:'https://api.helius.xyz/v0/webhooks',bearer:false},
  {host:'https://mainnet.helius-rpc.com/v0/webhooks',bearer:false}
];
export async function auditSourceControl({apiKey,expectedWallets,projectId=null,fetcher=fetch,now=Date.now()}={}){
  if(typeof apiKey!=='string'||apiKey.length<12)throw Error('SOURCE_CREDENTIAL_UNAVAILABLE');
  if(!Array.isArray(expectedWallets)||!expectedWallets.length||new Set(expectedWallets).size!==expectedWallets.length)
    throw Error('SOURCE_COHORT_INVALID');
  const report={at:new Date(now).toISOString(),mode:'READ_ONLY',subscription:'UNVERIFIED',
    expectedWallets:expectedWallets.length,observedWallets:null,cohortMatches:false,
    creditUsage:{status:'PROJECT_ID_UNAVAILABLE'},managementCalls:0,mutations:0};
  if(now>=Date.parse('2026-11-08T00:00:00Z')){
    report.subscription='SOURCE_PILOT_EXPIRED';return report;
  }
  let option=null,list=null;
  async function request(choice,path=''){
    report.managementCalls++;
    const response=await fetcher(choice.host+path+(choice.bearer?'':'?api-key='+encodeURIComponent(apiKey)),{
      method:'GET',headers:{accept:'application/json',...(choice.bearer?{authorization:'Bearer '+apiKey}:{})},
      signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw Error('HTTP_'+response.status);
    return response.json();
  }
  try{
    for(const candidate of schemes){
      try{list=await request(candidate);option=candidate;break;}
      catch(e){
        if(!/^HTTP_(400|401|403|404)$/.test(e?.message||''))throw e;
      }
    }
    if(!Array.isArray(list)||!option)throw Error('SOURCE_LIST_UNAVAILABLE');
    const own=list.filter(x=>x?.webhookURL===GOGET_RECEIVER);
    if(own.length>1){report.subscription='DUPLICATE_OWN_SUBSCRIPTIONS';return report;}
    if(!own.length)report.subscription='MISSING_OWN_SUBSCRIPTION';
    else{
      let details=own[0];
      let addresses=details.accountAddresses??details.account_addresses??details.addresses;
      if(!Array.isArray(addresses)){
        if(!/^[a-zA-Z0-9-]{10,128}$/.test(details.webhookID||''))throw Error('SOURCE_ID_UNVERIFIED');
        details=await request(option,'/'+encodeURIComponent(details.webhookID));
        addresses=details?.accountAddresses??details?.account_addresses??details?.addresses;
      }
      report.observedWallets=Array.isArray(addresses)?addresses.length:null;
      report.cohortMatches=Array.isArray(addresses)&&addresses.length===expectedWallets.length&&
        new Set(addresses).size===addresses.length&&expectedWallets.every(x=>addresses.includes(x));
      report.subscription=details?.active===false||own[0]?.active===false?'PROVIDER_MARKED_INACTIVE':
        report.cohortMatches?'REGISTERED_MATCHED_COHORT':'COHORT_UNVERIFIED_OR_MISMATCH';
      projectId=projectId||details?.projectId||own[0]?.projectId;
    }
  }catch(e){
    report.subscription='CONTROL_API_UNAVAILABLE';
    report.error=/^HTTP_\d+$/.test(e?.message||'')?e.message:'SOURCE_LIST_UNAVAILABLE';
  }
  if(typeof projectId==='string'&&/^[A-Za-z0-9-]{8,128}$/.test(projectId)){
    try{
      report.managementCalls++;
      const r=await fetcher('https://admin-api.helius.xyz/v0/admin/projects/'+encodeURIComponent(projectId)+
        '/usage?api-key='+encodeURIComponent(apiKey),{method:'GET',headers:{accept:'application/json'},
        signal:AbortSignal.timeout(15000)});
      if(!r.ok)throw Error('HTTP_'+r.status);
      const data=await r.json();
      if(!Number.isSafeInteger(data?.creditsRemaining)||data.creditsRemaining<0)throw Error('USAGE_UNVERIFIED');
      report.creditUsage={status:'VERIFIED',creditsRemaining:data.creditsRemaining,
        creditsUsed:Number.isSafeInteger(data.creditsUsed)?data.creditsUsed:null};
    }catch(e){report.creditUsage={status:'UNAVAILABLE',reason:
      /^HTTP_\d+$/.test(e?.message||'')?e.message:'USAGE_UNVERIFIED'};}
  }
  return report;
}
