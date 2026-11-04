#!/usr/bin/env node
// GOGET complete 12-wallet read-only D1 source ledger. No market API calls, no Helius RPC, no writes.
import {readFile,writeFile} from 'node:fs/promises';
import {expectedWebhookWallets,assessLiveCoverage,LIVE_COVERAGE_BOUNDS} from '../src/goget-live-source-coverage.mjs';
const requireEnv=k=>{const v=process.env[k];if(!v)throw Error('MISSING_'+k);return v;};
async function run(){
 const wanted=expectedWebhookWallets(
   JSON.parse(await readFile('research/smart-wallet-webhook-cohort.json','utf8')),
   await readFile('wrangler.smart-wallet.toml','utf8'));
 const account=requireEnv('CF_ACCOUNT_ID'),id=requireEnv('CF_DATABASE_ID'),token=requireEnv('CF_D1_API_TOKEN');
 const url='https://api.cloudflare.com/client/v4/accounts/'+encodeURIComponent(account)+
  '/d1/database/'+encodeURIComponent(id)+'/query';
 let queryCount=0;
 async function read(sql,params=[]){
   if(++queryCount>LIVE_COVERAGE_BOUNDS.maxD1Queries)throw Error('SOURCE_D1_QUERY_CAP');
   const response=await fetch(url,{method:'POST',headers:{
     authorization:'Bearer '+token,'content-type':'application/json'},
     body:JSON.stringify({sql,params}),signal:AbortSignal.timeout(15000)});
   if(!response.ok)throw Error('SOURCE_D1_HTTP_'+response.status);
   const payload=await response.json();
   if(payload?.success!==true||payload?.result?.[0]?.success!==true||
      !Array.isArray(payload.result[0].results))throw Error('SOURCE_D1_UNVERIFIED');
   const results=payload.result[0].results;
   if(results.length>LIVE_COVERAGE_BOUNDS.maxRows)throw Error('SOURCE_D1_RESULT_CAP');
   return results;
 }
 const now=new Date(),start=new Date(now.getTime()-24*3600000).toISOString();
 const [recentWalletRows,deliveries,cursors,control,rawHealth,budget]=await Promise.all([
   read('SELECT wallet,COUNT(*) AS n,MAX(observed_at) AS last_at FROM smart_wallet_webhook_events WHERE observed_at>=? GROUP BY wallet LIMIT 32',[start]),
   read('SELECT day,observed_deliveries,last_at FROM smart_wallet_webhook_credit_estimates ORDER BY day DESC LIMIT 2'),
   read('SELECT wallet,status,gaps,last_polled_at FROM smart_wallet_live_cursors ORDER BY wallet LIMIT 32'),
   read("SELECT state FROM smart_wallet_webhook_control WHERE id='owned' LIMIT 1"),
   read('SELECT day,degraded_requests,attempted_records,recovered_records,still_failed_records,last_at FROM smart_wallet_webhook_raw_health ORDER BY day DESC LIMIT 2'),
   read('SELECT day,reserved FROM smart_wallet_webhook_budget ORDER BY day DESC LIMIT 2')
 ]);
 const result=assessLiveCoverage({wanted,recentWalletRows,deliveries,cursors,control,rawHealth,budget,asOf:now.toISOString()});
 result.d1QueryCount=queryCount;result.heliusCalls=0;result.d1Writes=0;result.trades=0;
 await writeFile('goget-live-source-coverage-audit.json',JSON.stringify(result,null,2)+'\n');
 console.log('GOGET_LIVE_SOURCE_COVERAGE',JSON.stringify(result));
 if(result.status==='SCOPE_OR_CONTROL_UNVERIFIED')process.exitCode=1;
}
run().catch(e=>{console.error('GOGET_LIVE_SOURCE_COVERAGE_ERROR',
  /^(MISSING_[A-Z_]+|SOURCE_D1_[A-Z_0-9]+|WEBHOOK_[A-Z_0-9]+|WORKER_WEBHOOK_ROSTER_MISMATCH|SOURCE_AUDIT_[A-Z_0-9]+)$/.test(e?.message||'')?e.message:'UNKNOWN_SOURCE_READ_FAILURE');
 process.exitCode=1;});
