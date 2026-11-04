#!/usr/bin/env node
// Authenticate one D1-only heartbeat, after verifying the newly deployed Worker build.
import {createHmac} from 'node:crypto';
const admin=process.env.ADMIN_TOKEN;
if(!admin||admin.length<24)throw Error('GOGET_WATCHDOG_ADMIN_UNAVAILABLE');
const bearer=createHmac('sha256',admin).update('GOGET:SOURCE_WATCHDOG:RUN:v1').digest('base64url');
const url='https://goget-live-source-watchdog.wessteven.workers.dev';
const health=await fetch(url+'/health',{signal:AbortSignal.timeout(12000)});
const info=await health.json();
if(health.status!==200||info.build!=='2026_11_05_D1_CRON_V1'||
  info.enabled!==true||info.heliusCalls!==0||info.trades!==0)
 throw Error('GOGET_WATCHDOG_HEALTH_UNVERIFIED');
let report=null,lastStatus=null,lastError=null,good=false;
for(let attempt=0;attempt<6;attempt++){
 try{
  const r=await fetch(url+'/run',{method:'POST',headers:{authorization:'Bearer '+bearer},
    signal:AbortSignal.timeout(20000)});
  report=await r.json();lastStatus=r.status;lastError=report?.error??null;
  good=r.status===200&&report.rpcExpected===3&&report.rpcFound===3&&
    report.webhookRosterExpected===12&&report.d1Reads===6&&report.d1Writes===1&&
    report.heliusCalls===0&&report.trades===0&&typeof report.runId==='string';
  if(good)break;
  // Never repeat D1 manual writes if a 200 response had an invalid shape.
  if(r.status===200)break;
 }catch{lastError='NETWORK_OR_JSON_UNVERIFIED';lastStatus=null;}
 if(attempt<5)await new Promise(resolve=>setTimeout(resolve,1200));
}
if(!good){
 console.error('GOGET_WATCHDOG_GATE_DIAGNOSTIC',JSON.stringify({
  httpStatus:lastStatus,errorCode:typeof lastError==='string'&&/^[A-Z_]+$/.test(lastError)?
    lastError:'UNKNOWN',buildVerified:true,manualD1Verified:false}));
 throw Error('GOGET_WATCHDOG_D1_PRODUCTION_UNVERIFIED');
}
console.log('GOGET_WATCHDOG_PRODUCTION',JSON.stringify({status:report.status,
 providerDeliveryAgeMinutes:report.providerDeliveryAgeMinutes,
 rpcStale:report.rpcStale,rpcPending:report.rpcPending,
 sourceWalletsWithEvents24h:report.walletsWithNormalizedEvents24h,
 d1Reads:report.d1Reads,d1Writes:report.d1Writes,heliusCalls:0,trades:0,
 scheduleCron:'*/5 * * * *',cronInvocationsVerified:0,
 caveat:'Manual production test is not proof that future cron runs have executed.'}));
