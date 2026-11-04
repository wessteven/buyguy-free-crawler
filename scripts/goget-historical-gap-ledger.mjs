#!/usr/bin/env node
// Read-only independent completeness ledger for historical GOGET evidence.
// Never edits forward outcomes or restarts Helius, and uses no provider requests.
import {writeFile} from 'node:fs/promises';
const must=k=>{const v=process.env[k];if(!v)throw Error('MISSING_'+k);return v;};
async function main(){
 const account=must('CF_ACCOUNT_ID'),db=must('CF_DATABASE_ID'),token=must('CF_D1_API_TOKEN');
 const endpoint='https://api.cloudflare.com/client/v4/accounts/'+encodeURIComponent(account)+
   '/d1/database/'+encodeURIComponent(db)+'/query';
 let n=0;
 const read=async(sql)=>{
  if(++n>7||!sql.trim().startsWith('SELECT'))throw Error('READ_ONLY_QUERY_BUDGET');
  const r=await fetch(endpoint,{method:'POST',headers:{
    authorization:'Bearer '+token,'content-type':'application/json'},
    body:JSON.stringify({sql,params:[]}),signal:AbortSignal.timeout(14000)});
  if(!r.ok)throw Error('D1_HTTP_'+r.status);
  const j=await r.json();
  if(j?.success!==true||j.result?.[0]?.success!==true||
    !Array.isArray(j.result[0].results))throw Error('D1_SOURCE_UNVERIFIED');
  return j.result[0].results;
 };
 const counts=(await read(
  "SELECT COUNT(*) AS original_missing,SUM(CASE WHEN p.mint IS NOT NULL THEN 1 ELSE 0 END) AS historical_price,SUM(CASE WHEN a.mint IS NOT NULL THEN 1 ELSE 0 END) AS historical_pool_activity,SUM(CASE WHEN a.mint IS NULL AND p.mint IS NULL THEN 1 ELSE 0 END) AS still_unaccounted,SUM(CASE WHEN a.mint IS NOT NULL AND p.mint IS NOT NULL THEN 1 ELSE 0 END) AS overlapping_evidence FROM goget_pre_signal_market_outcomes o LEFT JOIN goget_historical_price_recovery p ON p.mint=o.mint AND p.bucket=o.bucket AND p.horizon_min=o.horizon_min LEFT JOIN goget_historical_pool_activity_audit a ON a.mint=o.mint AND a.bucket=o.bucket AND a.horizon_min=o.horizon_min WHERE o.status='MISSING_FUTURE_USD_QUOTE_COVERAGE'"
 ))[0];
 const activity=await read(
  "SELECT classification,enhanced_history_complete,COUNT(*) AS n FROM goget_historical_pool_activity_audit GROUP BY classification,enhanced_history_complete ORDER BY classification LIMIT 24");
 const prices=(await read(
  "SELECT COUNT(*) AS total, SUM(CASE WHEN o.mint IS NULL OR o.status<>'MISSING_FUTURE_USD_QUOTE_COVERAGE' OR p.pool<>o.pool OR p.reference_price_usd<>o.reference_price_usd OR p.historical_candle_at<p.due_at OR (strftime('%s',p.historical_candle_at)-strftime('%s',p.due_at))>600 THEN 1 ELSE 0 END) AS invalid FROM goget_historical_price_recovery p LEFT JOIN goget_pre_signal_market_outcomes o ON o.mint=p.mint AND o.bucket=p.bucket AND o.horizon_min=p.horizon_min"
 ))[0];
 const audit=(await read(
  "SELECT COUNT(*) AS total,SUM(CASE WHEN o.mint IS NULL OR o.status<>'MISSING_FUTURE_USD_QUOTE_COVERAGE' OR a.pool<>o.pool OR a.due_at<>o.due_at OR a.reconstructed_usd_price<>0 OR a.enhanced_history_complete<>1 THEN 1 ELSE 0 END) AS invalid FROM goget_historical_pool_activity_audit a LEFT JOIN goget_pre_signal_market_outcomes o ON o.mint=a.mint AND o.bucket=a.bucket AND o.horizon_min=a.horizon_min"
 ))[0];
 const ratioRows=await read(
  "SELECT n.mint,n.bucket,n.horizon_min,n.status,n.pool,n.sol_per_token,n.usd_price_reconstructed,a.classification AS original_activity_class,a.pool AS original_pool FROM goget_historical_native_ratio_audit n LEFT JOIN goget_historical_pool_activity_audit a ON n.mint=a.mint AND n.bucket=a.bucket AND n.horizon_min=a.horizon_min ORDER BY n.due_at ASC LIMIT 12");
 const ratiosInvalid=ratioRows.filter(x=>x.original_activity_class!=='HELIUS_LABELED_SWAP_POOL_AND_MINT_HINT'||
  x.pool!==x.original_pool||Number(x.usd_price_reconstructed)!==0||
  (x.status==='HISTORIC_NATIVE_POOL_FLOW_RATIO_ONLY'&&!(Number(x.sol_per_token)>0)));
 const toNum=v=>v==null?0:Number(v);
 const expected=toNum(counts.historical_price)+toNum(counts.historical_pool_activity)+toNum(counts.still_unaccounted);
 const total=toNum(counts.original_missing);
 const structurallyValid=toNum(counts.overlapping_evidence)===0&&expected===total&&
  toNum(prices.invalid)===0&&toNum(audit.invalid)===0&&ratiosInvalid.length===0;
 const status=!structurallyValid?'FAIL_CLOSED_UNVERIFIED':
  toNum(counts.still_unaccounted)>0?'RECONCILED_NEW_FORWARD_GAPS_PENDING':
  'RECONCILED_ALL_CURRENT_HISTORICAL_GAPS';
 const report={at:new Date().toISOString(),status,
  originalMissingPriceOutcomes:total,
  historicalUsdPricesRecovered:toNum(counts.historical_price),
  historicalPoolActivityClassifiedWithoutPrice:toNum(counts.historical_pool_activity),
  currentNewUnassessedWindows:toNum(counts.still_unaccounted),
  overlappingSources:toNum(counts.overlapping_evidence),
  forwardHistoricalPriceRecords:toNum(prices.total),
  invalidHistoricalPriceRecords:toNum(prices.invalid),
  forensicActivityRecords:toNum(audit.total),
  invalidForensicActivityRecords:toNum(audit.invalid),
  activityClassificationCounts:activity,
  nativeRatioEvidence:ratioRows,
  nativeRatioInvalid:ratiosInvalid.length,
  queryReads:n,heliusCalls:0,otherProviderCalls:0,d1Writes:0,realTrades:0,
  limitations:['No classified absence proves raw Solana chain inactivity.',
    'Historical OHLCV and native ratios are retrospective and not original forward market quotes.',
    'No profitability or executable liquidity is independently verified.',
    'New missing forward outcomes can accrue after this snapshot.']};
 await writeFile('goget-historical-gap-ledger.json',JSON.stringify(report,null,2)+'\n');
 console.log('GOGET_HISTORICAL_GAP_LEDGER',JSON.stringify(report));
 if(!structurallyValid)process.exitCode=1;
}
main().catch(e=>{console.error('GOGET_HISTORICAL_GAP_LEDGER_FAILED',
 /^D1_HTTP_\d+$/.test(e?.message||'')?e.message:'READ_ONLY_RECONCILIATION_ERROR');process.exitCode=1;});
