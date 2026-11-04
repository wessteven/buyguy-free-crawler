#!/usr/bin/env node
// Read ONLY independent recovered USD evidence and historical Helius replay.
// No Gecko/Helius calls, no D1 writes, no original outcome relabeling.
import {writeFile} from 'node:fs/promises';
import {reviewRecoveredEvidence} from '../src/goget-historical-recovery-review.mjs';
const requireEnv=n=>{const v=process.env[n];if(!v)throw Error('MISSING_'+n);return v;};
async function main(){
 const account=requireEnv('CF_ACCOUNT_ID'),database=requireEnv('CF_DATABASE_ID'),
    token=requireEnv('CF_D1_API_TOKEN');
 const url='https://api.cloudflare.com/client/v4/accounts/'+encodeURIComponent(account)+
   '/d1/database/'+encodeURIComponent(database)+'/query';
 let calls=0;
 async function read(query,params=[]){
  if(!/^SELECT\s/i.test(query)||++calls>4)throw Error('AUDIT_READ_ONLY_BOUND');
  const response=await fetch(url,{method:'POST',headers:{
    authorization:'Bearer '+token,'content-type':'application/json'},
    body:JSON.stringify({sql:query,params}),signal:AbortSignal.timeout(18000)});
  if(!response.ok)throw Error('D1_HTTP_'+response.status);
  const body=await response.json();
  if(body?.success!==true||body.result?.[0]?.success!==true||
      !Array.isArray(body.result[0].results))throw Error('D1_QUERY_UNVERIFIED');
  return body.result[0].results;
 }
 const rows=await read(
  "SELECT r.mint,r.bucket,r.horizon_min,r.due_at,r.pool,r.reference_price_usd,r.historical_candle_at,r.historical_candle_close_usd,r.historical_change_pct,r.sample_kind,r.source,o.status AS original_status,o.pool AS original_pool,o.reference_price_usd AS original_reference_price_usd,s.sample_kind AS snapshot_kind FROM goget_historical_price_recovery r LEFT JOIN goget_pre_signal_market_outcomes o ON r.mint=o.mint AND r.bucket=o.bucket AND r.horizon_min=o.horizon_min LEFT JOIN goget_pre_signal_snapshots s ON r.mint=s.mint AND r.bucket=s.bucket ORDER BY r.due_at ASC LIMIT 500");
 const coverage=await read(
  "SELECT s.sample_kind,o.horizon_min,COUNT(*) AS missing_count,COUNT(r.mint) AS recovered_count FROM goget_pre_signal_market_outcomes o JOIN goget_pre_signal_snapshots s ON s.mint=o.mint AND s.bucket=o.bucket LEFT JOIN goget_historical_price_recovery r ON r.mint=o.mint AND r.bucket=o.bucket AND r.horizon_min=o.horizon_min WHERE o.status='MISSING_FUTURE_USD_QUOTE_COVERAGE' GROUP BY s.sample_kind,o.horizon_min ORDER BY o.horizon_min,s.sample_kind LIMIT 24");
 const wallets=await read(
  "SELECT wallet,tx_type,COUNT(*) AS n,SUM(CASE WHEN fee_payer=wallet THEN 1 ELSE 0 END) AS self_fee_payer FROM smart_wallet_helius_historical_replay GROUP BY wallet,tx_type ORDER BY n DESC LIMIT 40");
 const report=reviewRecoveredEvidence({rows,coverage,wallets,asOf:new Date().toISOString()});
 report.d1Reads=calls;report.d1Writes=0;report.auditScope={
  sourceTables:['goget_historical_price_recovery','goget_pre_signal_market_outcomes',
    'goget_pre_signal_snapshots','smart_wallet_helius_historical_replay'],
  rowLimit:500,providerRequests:0};
 await writeFile('goget-historical-recovery-efficacy.json',JSON.stringify(report,null,2)+'\n');
 console.log('GOGET_HISTORICAL_RECOVERY_EFFICACY',JSON.stringify(report));
 if(report.invalidRecoveredRows)process.exitCode=1;
}
main().catch(e=>{
 const known=/^D1_HTTP_\d+$|^AUDIT_READ_ONLY_BOUND$|^D1_QUERY_UNVERIFIED$/;
 console.error('GOGET_HISTORICAL_RECOVERY_AUDIT_ERROR',
  known.test(e?.message||'')?e.message:'RECONCILIATION_UNVERIFIED');
 process.exitCode=1;
});
