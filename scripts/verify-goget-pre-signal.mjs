#!/usr/bin/env node
// Verify actual Cloudflare signal receiver with existing research-only D1.
import {createHmac} from 'node:crypto';
const url='https://goget-pre-signal.wessteven.workers.dev';
const admin=process.env.ADMIN_TOKEN;
if(!admin||admin.length<24)throw Error('ADMIN_TOKEN_MISSING');
const token=createHmac('sha256',admin).update('GOGET:PRE_SIGNAL:RUN:v1').digest('base64url');
async function get(path,options={}){
  const response=await fetch(url+path,{...options,signal:AbortSignal.timeout(40000)});
  const result=await response.json().catch(()=>null);
  return {status:response.status,result};
}
let ready=false;
for(let i=0;i<6;i++){
  try{
    const h=await get('/health');
    if(h.status===200&&h.result?.service==='goget-pre-signal'&&
      h.result?.mode==='RESEARCH_ONLY'&&h.result?.enabled===true){ready=true;break;}
  }catch{}
  if(i<5)await new Promise(r=>setTimeout(r,4000));
}
if(!ready)throw Error('PRE_SIGNAL_HEALTH_UNVERIFIED');
let answer=null;
for(let i=0;i<6;i++){
  try{
    const a=await get('/run',{method:'POST',
      headers:{authorization:'Bearer '+token}});
    answer=a;
    if(a.status===200&&['OK','INCOMPLETE_SOURCE_WINDOW','LEASE_BUSY'].includes(a.result?.status))break;
    if(a.status!==503||a.result?.error!=='NOT_CONFIGURED')break;
  }catch{}
  if(i<5)await new Promise(r=>setTimeout(r,4000));
}
if(answer?.status!==200||!['OK','INCOMPLETE_SOURCE_WINDOW','LEASE_BUSY'].includes(answer.result?.status))
  throw Error('PRE_SIGNAL_RUN_UNVERIFIED_'+(answer?.result?.error||answer?.status||'NETWORK'));
const x=answer.result;
if(x.status==='LEASE_BUSY'){console.log('GOGET_PRE_SIGNAL_SMOKE',JSON.stringify({status:'LEASE_BUSY'}));}
else{
 if(x.modelCalls!==0||x.heliusCalls!==0||x.trades!==0||
  x.sampledSnapshots>40||x.observedSourceRows>1200)throw Error('PRE_SIGNAL_OUTPUT_GUARD_FAILED');
 console.log('GOGET_PRE_SIGNAL_SMOKE',JSON.stringify({
  status:x.status,observedSourceRows:x.observedSourceRows,
  potentialSignals:x.potentialSignalCount,controls:x.controlCount,
  snapshots:x.storedSnapshots,quotes:x.freshExactPoolQuotes,
  forwardLabels:x.observedOutcomes,missingCoverage:x.missingFuturePriceCoverage,
  modelCalls:x.modelCalls,heliusCalls:x.heliusCalls,trades:x.trades
 }));
}
