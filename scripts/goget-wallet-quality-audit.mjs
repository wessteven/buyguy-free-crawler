#!/usr/bin/env node
// Standalone read-only GOGET cohort audit. Queries only existing D1 rows.
// ZERO Helius/Dex/LLM calls, ZERO D1 writes, ZERO wallet changes or trading.
import {readFile,writeFile} from 'node:fs/promises';
import {inspectWalletQuality,QUALITY_BOUNDS} from '../src/goget-wallet-quality.mjs';

const required=name=>{
  const value=process.env[name];
  if(!value)throw Error('MISSING_'+name);
  return value;
};
async function main(){
  const account=required('CF_ACCOUNT_ID');
  const database=required('CF_DATABASE_ID');
  const token=required('CF_D1_API_TOKEN');
  const cohort=JSON.parse(await readFile('research/smart-wallet-webhook-cohort.json','utf8'));
  const now=new Date().toISOString();
  const from=new Date(Date.parse(now)-QUALITY_BOUNDS.hours*3600000).toISOString();
  const url='https://api.cloudflare.com/client/v4/accounts/'+
    encodeURIComponent(account)+'/d1/database/'+encodeURIComponent(database)+'/query';
  let queries=0;
  async function query(sql,params=[]){
    if(++queries>8)throw Error('READ_QUERY_BUDGET_EXCEEDED');
    const response=await fetch(url,{method:'POST',
      headers:{authorization:'Bearer '+token,'content-type':'application/json'},
      body:JSON.stringify({sql,params}),signal:AbortSignal.timeout(16000)});
    if(!response.ok)throw Error('D1_HTTP_'+response.status);
    const body=await response.json();
    if(body?.success!==true||body?.result?.[0]?.success!==true||
      !Array.isArray(body.result[0].results))throw Error('D1_READ_UNVERIFIED');
    return body.result[0].results;
  }
  // All source reads have explicit 24h predicates. No unbounded JSON dump.
  const walletRows=await query(
    "SELECT wallet,COUNT(*) AS n,SUM(CASE WHEN fee_payer_observed=1 THEN 1 ELSE 0 END) AS fee_payer_matched,SUM(CASE WHEN classification='UNVERIFIED_ENHANCED_SWAP' THEN 1 ELSE 0 END) AS swap_labelled,MAX(observed_at) AS latest_at FROM smart_wallet_webhook_events WHERE observed_at>=? AND observed_at<=? GROUP BY wallet ORDER BY n DESC LIMIT 20",
    [from,now]);
  const sampleRows=await query(
    'SELECT wallet,signature,observed_at,fee_payer_observed,evidence_json FROM smart_wallet_webhook_events WHERE observed_at>=? AND observed_at<=? ORDER BY observed_at DESC LIMIT ?',
    [from,now,QUALITY_BOUNDS.maxSampleRows]);
  const pollRows=await query(
    'SELECT wallet,classification,COUNT(*) AS n FROM smart_wallet_live_events WHERE observed_at>=? AND observed_at<=? GROUP BY wallet,classification ORDER BY wallet,classification LIMIT 60',
    [from,now]);
  const signalRows=await query(
    'SELECT sample_kind,category,COUNT(*) AS n FROM goget_pre_signal_snapshots WHERE bucket>=? AND bucket<=? GROUP BY sample_kind,category ORDER BY sample_kind,category LIMIT 48',
    [from,now]);
  const marketOutcomes=await query(
    'SELECT horizon_min,status,COUNT(*) AS n FROM goget_pre_signal_market_outcomes GROUP BY horizon_min,status ORDER BY horizon_min,status LIMIT 48');
  const agentRows=await query(
    'SELECT verdict,COUNT(*) AS n FROM smart_wallet_six_agent_reviews WHERE reviewed_at>=? AND reviewed_at<=? GROUP BY verdict ORDER BY n DESC LIMIT 48',
    [from,now]);
  const report=inspectWalletQuality({
    cohort,walletRows,sampleRows,pollRows,signalRows,marketOutcomes,agentRows,asOf:now
  });
  report.queryCount=queries;
  report.dataBasis={
    webhookStartInclusive:from,webhookEndInclusive:now,
    sampledGlobalReceiptLimit:QUALITY_BOUNDS.maxSampleRows,
    sourceGroupsLimitedTo:QUALITY_BOUNDS.maxWallets,
    providerCalls:0,d1Writes:0,modelCalls:0
  };
  await writeFile('goget-wallet-quality-report.json',JSON.stringify(report,null,2)+'\n');
  console.log('GOGET_WALLET_QUALITY_AUDIT',JSON.stringify(report));
}
main().catch(error=>{
  const allowed=new Set(['READ_QUERY_BUDGET_EXCEEDED','D1_READ_UNVERIFIED',
    'COHORT_AUDIT_INPUT_LIMIT','INVALID_OR_DUPLICATE_WALLET',
    'INVALID_ASOF_TIME']);
  const code=allowed.has(error?.message)||/^MISSING_[A-Z_]+$/.test(error?.message)||
    /^D1_HTTP_\d+$/.test(error?.message)?error.message:'READ_ONLY_QUALITY_AUDIT_FAILED';
  console.error('GOGET_WALLET_QUALITY_ERROR',code);
  process.exitCode=1;
});
