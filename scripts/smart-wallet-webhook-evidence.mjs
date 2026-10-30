#!/usr/bin/env node
// Read-only, bounded production evidence snapshot. Never logs credentials or full webhook payloads.
async function main(){
  const names=['CF_ACCOUNT_ID','CF_DATABASE_ID','CF_D1_API_TOKEN'];
  const values=names.map(x=>process.env[x]);
  if(values.some(x=>!x))throw Error('D1_CREDENTIALS_UNAVAILABLE');
  const [account,database,token]=values;
  const endpoint='https://api.cloudflare.com/client/v4/accounts/'+encodeURIComponent(account)+
    '/d1/database/'+encodeURIComponent(database)+'/query';
  async function query(sql){
    const res=await fetch(endpoint,{method:'POST',headers:{
      authorization:'Bearer '+token,'content-type':'application/json'},
      body:JSON.stringify({sql,params:[]}),signal:AbortSignal.timeout(20000)});
    if(!res.ok)throw Error('D1_HTTP_'+res.status);
    const data=await res.json();
    if(data?.success!==true||data.result?.[0]?.success!==true)throw Error('D1_QUERY_FAILURE');
    return data.result[0].results||[];
  }
  const recent=await query("SELECT wallet,observed_at,classification,delay_ms FROM smart_wallet_webhook_events ORDER BY observed_at DESC LIMIT 12");
  const quotas=await query("SELECT day,reserved FROM smart_wallet_webhook_budget ORDER BY day DESC LIMIT 2");
  const last=recent[0]?.observed_at||null,now=Date.now(),age=last===null?null:Math.round((now-Date.parse(last))/1000);
  if(age!==null&&!Number.isFinite(age))throw Error('INVALID_EVENT_TIME');
  const classificationCounts={};
  for(const r of recent)classificationCounts[r.classification]=(classificationCounts[r.classification]||0)+1;
  console.log('GOGET_WEBHOOK_LIVE_EVIDENCE',JSON.stringify({
    checkedAt:new Date(now).toISOString(),lastDeliveredEventAt:last,
    lastDeliveredEventAgeSeconds:age,recentRows:recent.length,
    recentUniqueWallets:new Set(recent.map(r=>r.wallet)).size,
    classificationsInRecentSample:classificationCounts,dailyQuota:quotas,
    notes:'Only observed webhook D1 entries; NOT proof of complete coverage, fast delivery or profitable copied trades.'
  }));
}
main().catch(e=>{
  console.error('GOGET_WEBHOOK_LIVE_EVIDENCE_FAILED',
    /^(D1_CREDENTIALS_UNAVAILABLE|D1_HTTP_[0-9]+|D1_QUERY_FAILURE|INVALID_EVENT_TIME)$/.test(e.message)
      ?e.message:'STATUS_UNKNOWN');
  process.exitCode=1;
});
