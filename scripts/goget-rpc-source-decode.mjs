#!/usr/bin/env node
// Cost-capped read-only Helius getTransaction enrichment for EXACT 3 wallet sources.
// Does not update original live, archived source, legacy history, webhook or outcomes.
import {writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {GAP_WALLETS} from '../src/goget-wallet-gap-wave.mjs';
import {DECODE_BOUNDS as L,inspectExactTransaction,validSig,assertExactSourceRoster,
 reservedForRemainingForwardCycles} from '../src/goget-rpc-decoding.mjs';
const need=k=>{const x=process.env[k];if(!x)throw Error('DECODE_MISSING_'+k);return x};
const secret=need('CF_D1_API_TOKEN');
const url='https://api.cloudflare.com/client/v4/accounts/'+encodeURIComponent(need('CF_ACCOUNT_ID'))+
 '/d1/database/'+encodeURIComponent(need('CF_DATABASE_ID'))+'/query';
const key=need('HELIUS_API_KEY');const rpc='https://mainnet.helius-rpc.com/?api-key='+encodeURIComponent(key);
const at=new Date().toISOString(),time=Date.parse(at),day=at.slice(0,10),runId=randomUUID();
let d1=0,credits=0,providerCalls=0,decoded=0;
const wallets=[],errors=[];
const report={at,runId,mode:'ISOLATED_RPC_GETTRANSACTION_RETROSPECTIVE_ENRICHMENT',
 expectedWallets:3,wallets,checkedWallets:0,sourceCalls:0,decodeSucceeded:0,
 localCreditsReserved:0,d1Calls:0,errors,
 liveRpcSourceUntouched:true,originalHistoricalRecordsUntouched:true,
 twelveWalletWebhookUntouched:true,marketOutcomesUntouched:true,trades:0,
 caveats:['Bounded archival RPC calls are not as-of source observations.',
 'A transaction signature or program interaction is not evidence of a buyer, profitable trade, or executable USD price.',
 'All three wallets are enumerated every run even if no eligible signatures or daily budget.',
 'Forward 5-minute source collection is reserved before decoder credit use.']};
async function db(sql,params=[],write=false){
 if(++d1>L.maxD1Queries)throw Error('DECODE_D1_QUERY_CAP');
 const r=await fetch(url,{method:'POST',headers:{authorization:'Bearer '+secret,'content-type':'application/json'},
  body:JSON.stringify({sql,params}),signal:AbortSignal.timeout(19000)});
 if(!r.ok)throw Error('DECODE_D1_HTTP_'+r.status);
 const x=await r.json(),v=x?.result?.[0];
 if(x?.success!==true||v?.success!==true)throw Error('DECODE_D1_RESULT_UNVERIFIED');
 if(write){
  if(!Number.isSafeInteger(v.meta?.changes)||v.meta.changes<0)throw Error('DECODE_D1_WRITE_UNVERIFIED');
  return v.meta.changes;
 }
 if(!Array.isArray(v.results)||v.results.length>20)throw Error('DECODE_D1_READ_UNVERIFIED');
 return v.results;
}
async function candidate(wallet){
 const rows=await db(
 'SELECT s.wallet,s.signature,s.slot,s.failed,s.observed_at FROM goget_rpc_source_signatures s'+
 ' LEFT JOIN goget_rpc_decoded_signatures d ON d.wallet=s.wallet AND d.signature=s.signature'+
 ' LEFT JOIN goget_rpc_decode_attempts a ON a.wallet=s.wallet AND a.signature=s.signature'+
 ' WHERE s.wallet=? AND d.signature IS NULL AND'+
 ' (a.signature IS NULL OR (a.attempts<? AND a.next_eligible_at<=?))'+
 ' ORDER BY s.observed_at ASC LIMIT 1',
 [wallet,L.maxAttempts,at]);
 return rows[0]||null;
}
async function reserveCredit(){
 await db('INSERT OR IGNORE INTO goget_rpc_decode_budget(day,reserved_credits) VALUES(?,0)',[day],true);
 const future=reservedForRemainingForwardCycles(time);
 const n=await db(
  'UPDATE goget_rpc_source_budget SET reserved_credits=reserved_credits+? WHERE day=?'+
  ' AND reserved_credits+?+?<=?'+
  ' AND reserved_credits+?+COALESCE((SELECT observed_deliveries FROM smart_wallet_webhook_credit_estimates WHERE day=?),0)<=?'+
  ' AND COALESCE((SELECT reserved_credits FROM goget_rpc_decode_budget WHERE day=?),0)+?<=?'+
  " AND EXISTS(SELECT 1 FROM smart_wallet_webhook_control WHERE id='owned' AND state='ARMED')",
 [L.costPerArchivalTransaction,day,L.costPerArchivalTransaction,future,L.sharedRpcCredits,
  L.costPerArchivalTransaction,day,L.localCombinedCredits,day,
  L.costPerArchivalTransaction,L.perUtcDayCredits],true);
 if(n!==1)return false;
 // The shared cap already reserved the credit; a failure of this second
 // journaling write must not trigger a provider call.
 const second=await db('UPDATE goget_rpc_decode_budget SET reserved_credits=reserved_credits+?'+
  ' WHERE day=? AND reserved_credits+?<=?',
 [L.costPerArchivalTransaction,day,L.costPerArchivalTransaction,L.perUtcDayCredits],true);
 if(second!==1)throw Error('DECODE_JOURNAL_BUDGET_UNVERIFIED');
 credits+=L.costPerArchivalTransaction;return true;
}
async function transaction(s){
 providerCalls++;
 const r=await fetch(rpc,{method:'POST',headers:{'content-type':'application/json'},
  body:JSON.stringify({jsonrpc:'2.0',id:1,method:'getTransaction',
   params:[s.signature,{encoding:'jsonParsed',commitment:'confirmed',
    maxSupportedTransactionVersion:0}]}),signal:AbortSignal.timeout(18000)});
 if(!r.ok)throw Error('DECODE_RPC_HTTP_'+r.status);
 const length=Number(r.headers.get('content-length'));
 if(Number.isFinite(length)&&length>L.maxRawResponseBytes)throw Error('DECODE_PROVIDER_BYTES_CAP');
 const raw=await r.text();
 if(raw.length>L.maxRawResponseBytes)throw Error('DECODE_PROVIDER_BYTES_CAP');
 let data;try{data=JSON.parse(raw)}catch{throw Error('DECODE_PROVIDER_JSON_UNVERIFIED')}
 if(data?.error)throw Error('DECODE_RPC_REJECTED');
 return inspectExactTransaction(data?.result,s,{retrievedAt:new Date().toISOString()});
}
async function logAttempt(s,status){
 const next=new Date(Date.now()+L.backoffMinutes*60000).toISOString();
 const n=await db('INSERT INTO goget_rpc_decode_attempts(wallet,signature,attempts,last_at,next_eligible_at,status)'+
  ' VALUES(?,?,1,?,?,?) ON CONFLICT(wallet,signature) DO UPDATE SET'+
  ' attempts=attempts+1,last_at=excluded.last_at,next_eligible_at=excluded.next_eligible_at,status=excluded.status',
  [s.wallet,s.signature,at,next,status],true);
 if(n!==1)throw Error('DECODE_ATTEMPT_JOURNAL_UNVERIFIED');
}
async function one(wallet){
 const x={wallet,state:'NOT_STARTED',attempted:0,decoded:0,creditsReserved:0};
 wallets.push(x);
 const selected=await candidate(wallet);
 if(!selected){x.state='NO_ELIGIBLE_UNDECODED_SIGNATURE';return;}
 if(selected.wallet!==wallet||!validSig(selected.signature)||
  !Number.isSafeInteger(selected.slot)||!Number.isSafeInteger(selected.failed)||
  ![0,1].includes(selected.failed))throw Error('DECODE_SELECTED_SOURCE_INVALID');
 x.signature=selected.signature;
 if(!await reserveCredit()){x.state='BUDGET_PROTECTS_REMAINING_LIVE_CYCLES';return;}
 x.creditsReserved=L.costPerArchivalTransaction;x.attempted=1;
 try{
  const evidence=await transaction(selected);
  const json=JSON.stringify(evidence);
  if(json.length>5000)throw Error('DECODE_EVIDENCE_BYTES_CAP');
  const inserted=await db(
   'INSERT OR IGNORE INTO goget_rpc_decoded_signatures(wallet,signature,source_slot,checked_at,decode_status,source_observed_at,decoded_summary_json,provider)'+
   ' VALUES(?,?,?,?,?,?,?,?)',
   [wallet,selected.signature,selected.slot,new Date().toISOString(),evidence.status,
    selected.observed_at,json,'HELIUS_RPC_GETTRANSACTION_ARCHIVAL'],true);
  if(inserted>1)throw Error('DECODE_INSERT_COUNT_UNKNOWN');
  decoded+=inserted;x.decoded=inserted;x.state=inserted===1?'DECODED_SIGNATURE_AND_SLOT_VERIFIED':'ALREADY_RECORDED';
 }catch(e){
  x.state='DECODE_UNVERIFIED';
  x.error=/^(DECODE_[A-Z0-9_]+|DECODE_RPC_HTTP_\d+)$/.test(e?.message||'')?
   e.message:'PROVIDER_OR_STORAGE_ERROR';
  // This is separate from a successful decoded transaction; it stays retryable.
 }finally{
  await logAttempt(selected,x.state);
 }
}
async function run(){
 try{
  if(time>=Date.parse(L.stopUtc))throw Error('DECODE_PILOT_CUTOFF_REACHED');
  if(GAP_WALLETS.length!==3||new Set(GAP_WALLETS).size!==3)
   throw Error('DECODE_ROSTER_INVALID');
  await db('INSERT OR IGNORE INTO goget_rpc_source_budget(day,reserved_credits) VALUES(?,0)',[day],true);
  for(const wallet of GAP_WALLETS){
   try{await one(wallet);}
   catch(e){const row=wallets.find(x=>x.wallet===wallet)||{wallet};
    row.state='SOURCE_OR_D1_UNVERIFIED';
    errors.push({wallet,reason:/^DECODE_[A-Z0-9_]+$/.test(e?.message||'')?
     e.message:'RESEARCH_SOURCE_UNKNOWN'});
    if(!wallets.includes(row))wallets.push(row);
   }
  }
  assertExactSourceRoster(wallets);
 }catch(e){
  errors.push({reason:/^DECODE_[A-Z0-9_]+$/.test(e?.message||'')?
   e.message:'PRECONDITION_OR_D1_UNVERIFIED'});
 }
 report.checkedWallets=wallets.length;report.decodeSucceeded=decoded;
 report.sourceCalls=providerCalls;report.localCreditsReserved=credits;report.d1Calls=d1;
 report.status=wallets.length===3&&errors.length===0?
  'THREE_WALLET_DECODING_ATTEMPT_RECORDED_NOT_FULL_COVERAGE':'INCOMPLETE_WITH_EXPLICIT_ERRORS';
 try{
  await db('INSERT OR IGNORE INTO goget_rpc_decode_runs'+
   '(run_id,started_at,finished_at,status,wallets_expected,wallets_considered,requested_rpc,reserved_credits,decoded,summary_json)'+
   ' VALUES(?,?,?,?,?,?,?,?,?,?)',
   [runId,at,new Date().toISOString(),report.status,3,wallets.length,providerCalls,credits,decoded,
    JSON.stringify(report).slice(0,7000)],true);
 }catch{errors.push({reason:'DECODE_RUN_JOURNAL_UNVERIFIED'});report.status='INCOMPLETE_WITH_EXPLICIT_ERRORS';}
 await writeFile('goget-rpc-decoder-report.json',JSON.stringify(report,null,2)+'\n');
 console.log('GOGET_RPC_DECODER_RUN',JSON.stringify(report));
 if(errors.length||wallets.length!==3)process.exitCode=1;
}
run().catch(e=>{console.error('GOGET_RPC_DECODER_FATAL',/^DECODE_[A-Z0-9_]+$/.test(e?.message||'')?e.message:'SOURCE_UNVERIFIED');process.exitCode=1});
