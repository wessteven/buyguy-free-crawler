#!/usr/bin/env node
// Real deployment smoke test: public health and authenticated read-only six-agent run.
// The explicit /run route exists only for the deployment verifier and is rate bounded
// by the same D1 lease and 200-record ceiling as Cron.
import {createHmac} from 'node:crypto';
const url='https://goget-six-agent.wessteven.workers.dev';
const secret=process.env.ADMIN_TOKEN;
if(!secret||secret.length<24)throw Error('ADMIN_TOKEN_NOT_CONFIGURED');
const token=createHmac('sha256',secret).update('GOGET:SIX_AGENT:MANUAL_RUN:v1').digest('base64url');
let ready=false,code='UNREACHABLE';
for(let attempt=0;attempt<6;attempt++){
  try{
    const h=await fetch(url+'/health',{signal:AbortSignal.timeout(15000)});
    code=String(h.status);
    const data=await h.json().catch(()=>null);
    if(h.status===200&&data?.service==='goget-six-agent-cloudflare'&&
      data?.mode==='PAPER_ONLY_NO_LLM'&&data?.enabled===true){ready=true;break;}
    if(![502,503,504].includes(h.status))break;
  }catch{code='NETWORK_OR_ACCESS';}
  if(attempt<5)await new Promise(r=>setTimeout(r,4000));
}
if(!ready)throw Error('AGENT_WORKER_HEALTH_UNVERIFIED_'+code);
const response=await fetch(url+'/run',{method:'POST',
  headers:{authorization:'Bearer '+token},signal:AbortSignal.timeout(50000)});
const state=await response.json().catch(()=>null);
if(response.status!==200||!state||
  !['OK','LEASE_BUSY','DISABLED'].includes(state.status))throw Error('AGENT_RUN_UNVERIFIED_'+response.status);
if(state.status==='DISABLED')throw Error('AGENT_RUN_DISABLED');
if(state.status==='LEASE_BUSY'){
  console.log('GOGET_CLOUDFLARE_AGENT_SMOKE',{status:'LEASE_BUSY_SCHEDULED_RUN_MAY_BE_ACTIVE'});
}else{
  if(state.realTrades!==0||state.modelCalls!==0||state.heliusCalls!==0||
    state.paperBuys!==0||state.persisted>200||state.observed>200)
    throw Error('AGENT_OUTPUT_CONTRACT_INVALID');
  console.log('GOGET_CLOUDFLARE_AGENT_SMOKE',JSON.stringify({status:state.status,
    observed:state.observed,persisted:state.persisted,backlog:state.backlog,
    modelCalls:state.modelCalls,heliusCalls:state.heliusCalls,realTrades:state.realTrades,
    ...state.statistics}));
}
