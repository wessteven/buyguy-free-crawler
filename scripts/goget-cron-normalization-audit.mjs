#!/usr/bin/env node
// D1-only independent audit: never edit source data or add Helius requests.
import {writeFile} from 'node:fs/promises';
import {checkCronEvidence} from '../src/goget-cron-evidence.mjs';
const env=x=>{const v=process.env[x];if(!v)throw Error('MISSING_'+x);return v;};
const a=env('CF_ACCOUNT_ID'),d=env('CF_DATABASE_ID'),token=env('CF_D1_API_TOKEN');
const url='https://api.cloudflare.com/client/v4/accounts/'+encodeURIComponent(a)+'/d1/database/'+encodeURIComponent(d)+'/query';
let reads=0;async function read(sql,params=[]){
 if(++reads>5)throw Error('AUDIT_D1_READ_CAP');
 const r=await fetch(url,{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},
  body:JSON.stringify({sql,params}),signal:AbortSignal.timeout(16000)});
 if(!r.ok)throw Error('AUDIT_D1_HTTP_'+r.status);
 const j=await r.json();
 if(j?.success!==true||j.result?.[0]?.success!==true||!Array.isArray(j.result[0].results))
   throw Error('AUDIT_D1_SOURCE_INVALID');
 return j.result[0].results;
}
const start='2026-11-04T13:35:00.000Z',end=new Date().toISOString();
const [cron,quota,normal,raw,states]=await Promise.all([
 read("SELECT slot_utc,observed_at,status,rpc_stale,rpc_pending,provider_delivery_age_minutes,normalized_age_minutes FROM goget_live_source_watchdog_runs WHERE trigger='cron' AND slot_utc>=? AND slot_utc<=? ORDER BY slot_utc ASC LIMIT 500",[start,end]),
 read('SELECT day,observed_deliveries,last_at FROM smart_wallet_webhook_credit_estimates ORDER BY day DESC LIMIT 3'),
 read('SELECT substr(observed_at,1,10) AS day,COUNT(*) AS n,COUNT(DISTINCT wallet) AS wallets,MAX(observed_at) AS last_at FROM smart_wallet_webhook_events WHERE observed_at>=? GROUP BY substr(observed_at,1,10) ORDER BY day DESC LIMIT 3',[start]),
 read('SELECT substr(observed_at,1,10) AS day,COUNT(*) AS n,MAX(observed_at) AS last_at FROM smart_wallet_webhook_raw WHERE observed_at>=? GROUP BY substr(observed_at,1,10) ORDER BY day DESC LIMIT 3',[start]),
 read('SELECT wallet,status,gaps,last_polled_at FROM smart_wallet_live_cursors ORDER BY wallet LIMIT 10')
]);
const report=checkCronEvidence({cron,start,end,quota,normal,raw,states});
report.d1Reads=reads;report.d1Writes=0;report.heliusCalls=0;report.trades=0;
await writeFile('goget-cron-normalization-evidence.json',JSON.stringify(report,null,2)+'\n');
console.log('GOGET_CRON_NORMALIZATION_EVIDENCE',JSON.stringify(report));
if(!report.scopeVerified)process.exitCode=1;
