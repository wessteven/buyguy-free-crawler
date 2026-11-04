// GOGET independent Cloudflare five-minute D1 source health ledger.
// ZERO Helius calls. ZERO source-table updates. ZERO orders. Does not replace the three-wallet RPC poller.
import {SOURCE_WATCHDOG_BOUNDS,assessSourceHeartbeat} from './goget-live-source-watchdog.mjs';
import {GAP_WALLETS} from './goget-wallet-gap-wave.mjs';
export const SOURCE_WATCHDOG_BUILD='2026_11_05_D1_CRON_V1';
const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,
 headers:{'content-type':'application/json','cache-control':'no-store'}});
async function verifiedRead(db,sql,...params){
 const result=await db.prepare(sql).bind(...params).all();
 if(result?.success!==true||!Array.isArray(result.results))throw Error('WATCHDOG_D1_READ_UNVERIFIED');
 return result.results;
}
async function verifiedWrite(db,sql,...params){
 const result=await db.prepare(sql).bind(...params).run();
 if(result?.success!==true||!Number.isSafeInteger(result.meta?.changes)||
  result.meta.changes<0||result.meta.changes>1)
  throw Error('WATCHDOG_D1_WRITE_UNVERIFIED');
 return result.meta.changes;
}
export async function runSourceWatchdog(env,{now=Date.now(),scheduledAt=now,trigger='manual'}={}){
 if(env?.WATCHDOG_ENABLED!=='true')return {status:'DISABLED'};
 const stop=Date.parse(env.WATCHDOG_STOP_AT||'');
 if(!Number.isFinite(stop))throw Error('WATCHDOG_STOP_INVALID');
 if(now>=stop)return {status:'PILOT_EXPIRED',heliusCalls:0,trades:0};
 if(!env?.DB)throw Error('WATCHDOG_D1_MISSING');
 const db=env.DB,at=new Date(now).toISOString(),slot=new Date(scheduledAt).toISOString();
 let reads=0,writes=0;
 const read=async(sql,...args)=>{
   if(++reads>SOURCE_WATCHDOG_BOUNDS.maxD1Reads)throw Error('WATCHDOG_D1_READ_BUDGET');
   return verifiedRead(db,sql,...args);
 };
 const [control,deliveries,events,cursors,priorCron,counts]=await Promise.all([
   read("SELECT state FROM smart_wallet_webhook_control WHERE id='owned' LIMIT 1"),
   read('SELECT last_at FROM smart_wallet_webhook_credit_estimates ORDER BY day DESC LIMIT 1'),
   read('SELECT observed_at FROM smart_wallet_webhook_events ORDER BY observed_at DESC LIMIT 1'),
   read('SELECT wallet,status,last_polled_at FROM smart_wallet_live_cursors ORDER BY wallet LIMIT 32'),
   read("SELECT observed_at AS at FROM goget_live_source_watchdog_runs WHERE trigger='cron' ORDER BY observed_at DESC LIMIT 1"),
   read('SELECT COUNT(DISTINCT wallet) AS n FROM smart_wallet_webhook_events WHERE observed_at>=?',
    new Date(now-24*3600000).toISOString())
 ]);
 const report=assessSourceHeartbeat({at,control,deliveries,events,cursors,priorCron,
    walletsSeen24h:Number(counts[0]?.n),expectedRpcWallets:GAP_WALLETS});
 const summary=JSON.stringify(report);
 if(summary.length>SOURCE_WATCHDOG_BOUNDS.maxSummaryBytes)throw Error('WATCHDOG_SUMMARY_TOO_LARGE');
 if(++writes>SOURCE_WATCHDOG_BOUNDS.maxD1Writes)throw Error('WATCHDOG_D1_WRITE_BUDGET');
 const id=crypto.randomUUID();
 await verifiedWrite(db,'INSERT INTO goget_live_source_watchdog_runs(run_id,slot_utc,trigger,observed_at,status,last_provider_delivery,last_normalized_event,provider_delivery_age_minutes,normalized_age_minutes,rpc_expected,rpc_found,rpc_stale,rpc_pending,source_wallets_with_events_24h,prior_cron_age_minutes,summary_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
  id,slot,trigger==='cron'?'cron':'manual',at,report.status,
  report.lastProviderDeliveryAt,report.lastNormalizedEventAt,
  report.providerDeliveryAgeMinutes,report.normalizedAgeMinutes,
  report.rpcExpected,report.rpcFound,report.rpcStale,report.rpcPending,
  report.walletsWithNormalizedEvents24h,report.priorCronAgeMinutes,summary);
 console.log('GOGET_SOURCE_WATCHDOG',JSON.stringify({status:report.status,trigger:trigger==='cron'?'cron':'manual',
  rpcFound:report.rpcFound,rpcStale:report.rpcStale,rpcPending:report.rpcPending,
  webhookArmed:report.webhookArmed,deliveryAgeMin:report.providerDeliveryAgeMinutes,
  normalizedAgeMin:report.normalizedAgeMinutes,priorCronAgeMin:report.priorCronAgeMinutes,
  d1Reads:reads,d1Writes:writes,heliusCalls:0,trades:0}));
 return {...report,d1Reads:reads,d1Writes:writes,runId:id};
}
async function authorized(headers,secret){
 if(typeof secret!=='string'||secret.length<40)return false;
 const incoming=headers.get('authorization')||'';
 const supplied=incoming.startsWith('Bearer ')?incoming.slice(7):'';
 const [a,b]=await Promise.all([crypto.subtle.digest('SHA-256',new TextEncoder().encode(supplied)),
  crypto.subtle.digest('SHA-256',new TextEncoder().encode(secret))]);
 let delta=0;const left=new Uint8Array(a),right=new Uint8Array(b);
 for(let i=0;i<left.length;i++)delta|=left[i]^right[i];
 return delta===0;
}
export default {
 async fetch(request,env){
   const path=new URL(request.url).pathname;
   if(path==='/health'&&request.method==='GET')return reply({
    build:SOURCE_WATCHDOG_BUILD,enabled:env?.WATCHDOG_ENABLED==='true',
    scheduleMinutes:SOURCE_WATCHDOG_BOUNDS.scheduleMinutes,
    heliusCalls:0,trades:0});
   if(path!=='/run'||request.method!=='POST')return reply({error:'NOT_FOUND'},404);
   if(!await authorized(request.headers,env?.WATCHDOG_CONTROL_TOKEN))
    return reply({error:'UNAUTHORIZED'},401);
   try{return reply(await runSourceWatchdog(env));}
   catch(e){console.error('GOGET_SOURCE_WATCHDOG_ERROR',/^(WATCHDOG_[A-Z_]+)$/.test(e.message)?e.message:'SOURCE_HEARTBEAT_UNVERIFIED');
    return reply({error:'SOURCE_HEARTBEAT_UNVERIFIED'},503);}
 },
 async scheduled(controller,env){
   try{await runSourceWatchdog(env,{now:Date.now(),
      scheduledAt:Number.isFinite(controller?.scheduledTime)?controller.scheduledTime:Date.now(),
      trigger:'cron'});}
   catch(e){console.error('GOGET_SOURCE_WATCHDOG_CRON_FAILED',
       /^(WATCHDOG_[A-Z_]+)$/.test(e.message)?e.message:'SOURCE_HEARTBEAT_UNVERIFIED');
      throw e;}
 }
};
