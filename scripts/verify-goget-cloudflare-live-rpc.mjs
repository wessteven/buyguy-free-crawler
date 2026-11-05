#!/usr/bin/env node
// One authenticated bounded production cycle; the Helius key is never logged.
import {createHmac} from 'node:crypto';
const admin=process.env.ADMIN_TOKEN;
if(!admin||admin.length<24)throw Error('RPC_VERIFY_ADMIN_MISSING');
const token=createHmac('sha256',admin).update('GOGET:LIVE_RPC:READ_ONLY:v1').digest('base64url');
const url='https://goget-live-rpc-source.wessteven.workers.dev';
let health=null;
for(let i=0;i<5;i++){
 try{
  const response=await fetch(url+'/health',{signal:AbortSignal.timeout(10000)});
  health=await response.json();
  if(response.status===200&&health.build==='GOGET_2026_11_05_SOURCE_CYCLE_V1'&&
   health.enabled===true&&health.trades===0&&health.rpcWallets===3&&
   health.archiveCreditsPerRunMax===30)break;
 }catch{}
 if(i<4)await new Promise(resolve=>setTimeout(resolve,1400));
}
if(health?.build!=='GOGET_2026_11_05_SOURCE_CYCLE_V1'||health.enabled!==true||
 health.trades!==0)throw Error('RPC_DEPLOYED_REVISION_UNVERIFIED');
const response=await fetch(url+'/run',{method:'POST',
 headers:{authorization:'Bearer '+token},signal:AbortSignal.timeout(45000)});
const report=await response.json().catch(()=>null);
if(response.status!==200||report?.status!=='SOURCES_ARCHIVED_GAPS_DISCLOSED'||
 report.walletsExpected!==3||report.walletsScanned!==3||
 report.heliusCalls!==3||report.creditsReserved!==30||report.dbReads>3||
 report.dbWrites>52||report.trades!==0||!Array.isArray(report.sourceReports)||
 report.sourceReports.length!==3){
 console.error('GOGET_RPC_PRODUCTION_GATE',JSON.stringify({
   http:response.status,state:report?.status??'UNVERIFIED',
   expected:report?.walletsExpected??null,scanned:report?.walletsScanned??null,
   calls:report?.heliusCalls??null,credits:report?.creditsReserved??null}));
 throw Error('RPC_PRODUCTION_D1_AND_HELIUS_UNVERIFIED');
}
console.log('GOGET_RPC_PRODUCTION_VERIFIED',JSON.stringify({
 slot:report.slot,status:report.status,
 walletsExpected:report.walletsExpected,walletsScanned:report.walletsScanned,
 signaturesSaved:report.signaturesSaved,gapsRecorded:report.sourceGaps,
 sourceStates:report.sourceReports.map(x=>({wallet:x.wallet,status:x.status,fetched:x.fetched,saved:x.saved,gap:x.gap})),
 d1Reads:report.dbReads,d1Writes:report.dbWrites,heliusCalls:report.heliusCalls,
 estimatedCreditsReserved:report.creditsReserved,
 pilotDeadline:'2026-11-08T00:00:00Z',trades:0,
 note:'One authenticated manual source scan, not proof of future scheduled runs or exhaustive chain history.'
}));
