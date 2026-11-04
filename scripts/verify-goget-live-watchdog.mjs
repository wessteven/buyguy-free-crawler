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
const r=await fetch(url+'/run',{method:'POST',headers:{authorization:'Bearer '+bearer},
 signal:AbortSignal.timeout(20000)});
const report=await r.json();
if(r.status!==200||report.rpcExpected!==3||report.rpcFound!==3||
  report.webhookRosterExpected!==12||report.d1Reads!==6||report.d1Writes!==1||
  report.heliusCalls!==0||report.trades!==0||typeof report.runId!=='string')
 throw Error('GOGET_WATCHDOG_D1_PRODUCTION_UNVERIFIED');
console.log('GOGET_WATCHDOG_PRODUCTION',JSON.stringify({status:report.status,
 providerDeliveryAgeMinutes:report.providerDeliveryAgeMinutes,
 rpcStale:report.rpcStale,rpcPending:report.rpcPending,
 sourceWalletsWithEvents24h:report.walletsWithNormalizedEvents24h,
 d1Reads:report.d1Reads,d1Writes:report.d1Writes,heliusCalls:0,trades:0,
 scheduleCron:'*/5 * * * *',cronInvocationsVerified:0,
 caveat:'Manual production test is not proof that future cron runs have executed.'}));
