#!/usr/bin/env node
// Production smoke verification of GOGET's existing authenticated dashboard.
// This script never sends a scan, market, Helius, D1 write or trading request.
import {writeFile} from 'node:fs/promises';
const key=process.env.ADMIN_TOKEN;
if(typeof key!=='string'||key.length<24)throw Error('WALLET_PANEL_ADMIN_MISSING');
const base='https://buyguy-free-radar.wessteven.workers.dev',out={
  at:new Date().toISOString(),endpoint:'/api/wallet-source-quality',
  status:'UNVERIFIED',checks:[],d1Writes:0,heliusCalls:0,trades:0
};
async function get(path,{method='GET',auth=false}={}){
 const r=await fetch(base+path,{method,
  headers:auth?{authorization:'Bearer '+key}:undefined,
  signal:AbortSignal.timeout(18000),redirect:'manual'});
 let body='';try{body=await r.text();}catch{}
 return {status:r.status,body};
}
async function run(){
 const health=await get('/health');
 if(health.status!==200||JSON.parse(health.body)?.server!=='online')
  throw Error('WALLET_PANEL_HEALTH_UNVERIFIED');
 out.checks.push('PUBLIC_HEALTH_OK');
 const page=await get('/dashboard');
 if(page.status!==200||!page.body.includes('id="walletSourceLoad"')||
   !page.body.includes('HISTORICAL VS LIVE'))
   throw Error('WALLET_PANEL_PRODUCTION_REVISION_UNVERIFIED');
 out.checks.push('EXPECTED_PUBLIC_HTML_REVISION');
 const anonymous=await get('/api/wallet-source-quality');
 if(anonymous.status!==401)throw Error('WALLET_PANEL_ANONYMOUS_AUTH_BYPASS');
 out.checks.push('ANONYMOUS_401');
 const invalidMethod=await get('/api/wallet-source-quality',{method:'POST',auth:true});
 if(invalidMethod.status!==405)throw Error('WALLET_PANEL_METHOD_AUTH_BYPASS');
 out.checks.push('AUTHORIZED_POST_405');
 const response=await get('/api/wallet-source-quality',{auth:true});
 if(response.status!==200)throw Error('WALLET_PANEL_AUTH_D1_HTTP_'+response.status);
 const report=JSON.parse(response.body);
 if(report?.walletsExpected!==3||report?.wallets?.length!==3||
   report.historicalBridgesComplete!==3||
   report.wallets.some(w=>w.historical?.bridgeComplete!==true||
     w.historical?.legacyAnchorStillArchived!==true||
     w.historical?.seedHeadStillArchived!==true||
     w.historical?.originalCursorStillPreserved!==true)||
   report.d1Reads!==10||report.d1Writes!==0||report.heliusCalls!==0||
   report.trades!==0||report.marketCandles?.minuteOhlcvContinuityVerified!==false||
   report.historicalRecoveryIsLiveContinuity!==false)
   throw Error('WALLET_PANEL_SCOPE_OR_INTEGRITY_UNVERIFIED');
 out.checks.push('AUTHENTICATED_3_OF_3_INDEPENDENT_ANCHORS_AND_D1');
 out.status='AUTHENTICATED_DASHBOARD_AND_READ_ONLY_SOURCE_VERIFIED';
 out.summary={asOf:report.asOf,historicalBridgesComplete:report.historicalBridgesComplete,
  sampleCronCycles:report.forwardSource.sampledCronCycles,
  completeCronCycles:report.forwardSource.completeThreeWalletCronCycles,
  decodedExactMatches:report.wallets.map(w=>({wallet:w.wallet,
    historicOriginal:w.historical.exactOriginalRpcEventMatches,
    historicEnhanced:w.historical.exactHistoricalEnhancedMatches,
    forwardLegacy:w.decoding.originalRpcDecodedMatches,
    forwardWebhook:w.decoding.liveEnhancedWebhookMatches})),
  marketSampled:report.marketCandles.outcomeSampled,
  marketStillMissingUsd:report.marketCandles.stillMissingUsdInSample,
  minuteOhlcvContinuityVerified:false};
 console.log('GOGET_AUTHENTICATED_WALLET_PANEL_PRODUCTION',JSON.stringify(out));
}
try{await run();}
catch(e){
 out.status='PRODUCTION_NOT_VERIFIED';
 out.failureCode=/^WALLET_PANEL_[A-Z0-9_]+$/.test(e?.message||'')?e.message:'NETWORK_OR_PROVIDER_BLOCK';
 console.error('GOGET_AUTHENTICATED_WALLET_PANEL_FAILED',out.failureCode);
 process.exitCode=1;
}finally{
 await writeFile('goget-wallet-dashboard-production-evidence.json',JSON.stringify(out,null,2)+'\n');
}
