// Read-only independent post-deploy GOGET stream evidence report.
import {createHmac} from 'node:crypto';
const root='https://goget-event-stream-pilot.wessteven.workers.dev';
const admin=process.env.ADMIN_TOKEN;
if(typeof admin!=='string'||admin.length<24)throw Error('PILOT_CONTROL_AUTH_UNAVAILABLE');
const bearer=createHmac('sha256',admin).update('GOGET:EVENT_PILOT:READ_ONLY:v1').digest('base64url');
async function live(){
 const r=await fetch(root+'/status',{headers:{authorization:'Bearer '+bearer,
   'User-Agent':'GOGET-Independent-Evidence-Audit/1.0',accept:'application/json'},
   signal:AbortSignal.timeout(12000)});
 const j=await r.json().catch(()=>null);
 if(r.status!==200||j?.build!=='GOGET_EVENT_STREAM_PILOT_2026_11_07_V2_HELIUS_ADMISSION')
  throw Error('PILOT_STATUS_UNVERIFIED_HTTP_'+r.status);
 return j;
}
let s=null;
for(let i=0;i<7;i++){
 try{s=await live()}catch(e){console.log('PILOT_LIVE_AUDIT_STATUS_ERROR',e.message)}
 if(s?.run?.pools===10&&s.activeAcknowledgements===10)break;
 if(i<6)await new Promise(r=>setTimeout(r,2500));
}
if(!s)throw Error('PILOT_LIVE_STATUS_UNAVAILABLE');
const m=s.metrics||{},run=s.run;
console.log('PILOT_LIVE_ACK_EVIDENCE',JSON.stringify({
 status:run?.status||'NOT_ARMED',runId:run?.id??null,
 frozenPools:run?.pools??null,activeAcknowledgements:s.activeAcknowledgements??null,
 fullAckSets:m.full_acknowledgement_sets??0,
 wsConnections:m.ws_connections??0,uniqueEvents:m.unique_events??0,
 duplicateEvents:m.duplicate_events??0,rawBytes:m.streamed_bytes??0,
 streamParseErrors:m.stream_parse_errors??0,
 disconnects:m.disconnects??0,isolateRestartGaps:m.isolate_restart_gaps??0,
 checkedAt:new Date().toISOString(),
 verdict:run?.pools===10&&s.activeAcknowledgements===10?
  'TEN_POOL_ACKS_OBSERVED_NOT_YET_RECONCILED':
  'TEN_POOL_ACKS_NOT_VERIFIED',
 caution:'Only a 10/10 acknowledgement plus events and independent end-of-run RPC reconcile can prove useful coverage'}));
const cf=process.env.CF_ACCOUNT_ID,db=process.env.CF_DATABASE_ID,key=process.env.CF_D1_API_TOKEN;
if(!cf||!db||!key)throw Error('PILOT_READ_ONLY_D1_CREDENTIALS_UNAVAILABLE');
async function d1(name,sql,params){
 const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+cf+'/d1/database/'+db+'/query',
  {method:'POST',headers:{authorization:'Bearer '+key,'content-type':'application/json'},
  body:JSON.stringify({sql,params}),signal:AbortSignal.timeout(14000)});
 const data=await r.json();
 if(!r.ok||data.success!==true||data.result?.[0]?.success!==true){
  console.log('PILOT_LIVE_D1',name,JSON.stringify({status:'READ_UNVERIFIED',http:r.status}));return null;
 }
 const output=(data.result[0].results||[]).slice(0,25);
 console.log('PILOT_LIVE_D1',name,JSON.stringify({status:'PROVIDER_RECORD',rows:output}));
 return output;
}
if(run?.id){
 await d1('run',`SELECT run_id,status,requested_pools,armed_pools,started_at,ends_at,reserved_credits,
 streamed_bytes,unique_events,duplicate_events,ws_connections,stream_gap_count,rpc_attempts,
 provider_billed_credits,cloudflare_billed_usd FROM goget_event_pilot_runs WHERE run_id=?`,[run.id]);
 await d1('roster',`SELECT COUNT(*) AS total,COUNT(DISTINCT pool) AS distinct_pools,COUNT(DISTINCT mint) AS mints
 FROM goget_event_pilot_roster WHERE run_id=?`,[run.id]);
 await d1('coverage_windows',`SELECT coverage,COUNT(*) AS windows,COUNT(DISTINCT pool) AS pools
 FROM goget_event_pilot_windows WHERE run_id=? GROUP BY coverage LIMIT 10`,[run.id]);
 await d1('reconciliation',`SELECT status,COUNT(*) AS pools,SUM(missing) AS missing_events,
 SUM(rpc_in_window) AS rpc_events,SUM(websocket_matched) AS received_match
 FROM goget_event_pilot_reconciliation WHERE run_id=? GROUP BY status LIMIT 10`,[run.id]);
 await d1('forward_outcomes',`SELECT horizon_min,status,COUNT(*) AS n FROM goget_event_pilot_outcomes
 WHERE run_id=? GROUP BY horizon_min,status LIMIT 15`,[run.id]);
}
