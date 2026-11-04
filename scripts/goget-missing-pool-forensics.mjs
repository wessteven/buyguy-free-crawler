#!/usr/bin/env node
// ONE BOUNDED PASS. Inspect previously missing exact-pool USD windows against Helius
// enhanced history and persist ONLY independent transaction classifications.
// No synthetic prices, no edits to GOGET forward labels, no wallet signing or trading.
import {readFile,writeFile} from 'node:fs/promises';
import {FORENSIC_LIMITS,classifyHistoricalPoolWindows,validateEvidenceTx}
  from '../src/goget-historical-pool-activity.mjs';
const must=k=>{const v=process.env[k];if(!v)throw Error('MISSING_'+k);return v;};
const sleep=t=>new Promise(resolve=>setTimeout(resolve,t));
const SIG=/^[1-9A-HJ-NP-Za-km-z]{64,88}$/;
const errorCode=e=>{
 const approved=['D1_READ_FAILED','D1_WRITE_UNVERIFIED','D1_READ_BUDGET',
   'PROVIDER_JSON_SHAPE','PAGINATION_REPEAT_OR_ORDER','OUT_OF_REQUESTED_TIME_WINDOW',
   'D1_HTTP_401','D1_HTTP_403','D1_HTTP_429','D1_HTTP_500','D1_HTTP_503'];
 return approved.includes(e?.message)?e.message:'FORENSIC_SOURCE_UNVERIFIED';
};
async function main(){
 const account=must('CF_ACCOUNT_ID'),db=must('CF_DATABASE_ID'),
  token=must('CF_D1_API_TOKEN'),helius=must('HELIUS_API_KEY');
 const endpoint='https://api.cloudflare.com/client/v4/accounts/'+encodeURIComponent(account)+
  '/d1/database/'+encodeURIComponent(db)+'/query';
 let d1Calls=0,d1Writes=0,heliusCalls=0,lastProviderAt=0;
 const dbQuery=async(sql,params=[])=>{
  if(++d1Calls>FORENSIC_LIMITS.maxD1Calls)throw Error('D1_READ_BUDGET');
  const r=await fetch(endpoint,{method:'POST',headers:{
   authorization:'Bearer '+token,'content-type':'application/json'},
   body:JSON.stringify({sql,params}),signal:AbortSignal.timeout(16000)});
  if(!r.ok)throw Error('D1_HTTP_'+r.status);
  const j=await r.json();
  if(j?.success!==true||j.result?.[0]?.success!==true||
     !Array.isArray(j.result[0].results))throw Error('D1_READ_FAILED');
  return j.result[0];
 };
 const statements=(await readFile('sql/goget-historical-pool-activity.sql','utf8'))
  .split('\n').filter(x=>!x.trim().startsWith('--')).join('\n')
  .split(';').map(x=>x.trim()).filter(Boolean);
 for(const stmt of statements){await dbQuery(stmt);d1Writes++;}
 const sourceRows=(await dbQuery(
   "SELECT o.mint,o.bucket,o.horizon_min,o.due_at,o.pool,s.sample_kind,a.enhanced_history_complete AS priorComplete FROM goget_pre_signal_market_outcomes o JOIN goget_pre_signal_snapshots s ON s.mint=o.mint AND s.bucket=o.bucket LEFT JOIN goget_historical_price_recovery p ON p.mint=o.mint AND p.bucket=o.bucket AND p.horizon_min=o.horizon_min LEFT JOIN goget_historical_pool_activity_audit a ON a.mint=o.mint AND a.bucket=o.bucket AND a.horizon_min=o.horizon_min WHERE o.status='MISSING_FUTURE_USD_QUOTE_COVERAGE' AND p.mint IS NULL AND (a.mint IS NULL OR a.enhanced_history_complete=0) ORDER BY o.due_at ASC LIMIT ?",
   [FORENSIC_LIMITS.maxOutcomeRows])).results;
 const coverage=(await dbQuery(
   "SELECT (SELECT COUNT(*) FROM goget_pre_signal_market_outcomes WHERE status='MISSING_FUTURE_USD_QUOTE_COVERAGE') AS total_missing,(SELECT COUNT(*) FROM goget_historical_price_recovery) AS reconstructed_historical,(SELECT COUNT(*) FROM goget_historical_pool_activity_audit) AS previously_classified")).results[0];
 const groups=new Map();
 for(const o of sourceRows){
  const k=o.pool+'|'+o.mint;
  if(!groups.has(k))groups.set(k,{pool:o.pool,mint:o.mint,rows:[],signalRows:0});
  const group=groups.get(k);group.rows.push(o);
  if(o.sample_kind==='POTENTIAL_SIGNAL')group.signalRows++;
 }
 // Examine highest-impact pairs first, but preserve an explicit count of
 // *every* pair/row excluded by this batch budget; never claim full coverage.
 const sorted=[...groups.values()].sort((a,b)=>b.rows.length-a.rows.length||
   b.signalRows-a.signalRows||a.pool.localeCompare(b.pool));
 const selected=sorted.slice(0,FORENSIC_LIMITS.maxPoolsPerBatch);
 const report={at:new Date().toISOString(),mode:'BOUNDED_HELIUS_ENHANCED_POOL_HISTORY_EVIDENCE',
   originalMissingTotal:Number(coverage.total_missing),
   historicalPricesAlreadyRecovered:Number(coverage.reconstructed_historical),
   previouslyClassifiedRows:Number(coverage.previously_classified),
   unclassifiedRowsInSourceSample:sourceRows.length,
   unclassifiedPairCount:sorted.length,selectedPairCount:selected.length,
   selectedSourceRows:selected.reduce((n,g)=>n+g.rows.length,0),
   deferredPairs:Math.max(0,sorted.length-selected.length),
   deferredRows:sourceRows.length-selected.reduce((n,g)=>n+g.rows.length,0),
   maxInputRows:FORENSIC_LIMITS.maxOutcomeRows,
   heliusCalls:0,heliusMaxCalls:FORENSIC_LIMITS.maxApiCallsPerBatch,
   creditPlanningEstimateAt165PerCall:FORENSIC_LIMITS.maxApiCallsPerBatch*165,
   creditPlanningOnlyNotHeliusBilling:true,
   heliusUsageEstimateNotBilling:true,d1Writes:0,inserted:0,duplicates:0,
   completelyPagedGroups:0,partiallyPagedGroups:0,
   classificationCounts:{},groupReports:[],trades:0,
   caveats:[
    'Original missing price and signal outcomes are untouched.',
    'Helius Enhanced parsed SWAP labels do not establish exact-pool route or executable transaction price.',
    'An empty enhanced-history page does not independently prove the pool did not trade on the raw chain.',
    'Pool-specific Solana USD quotes cannot be computed without exact swap legs and historical SOL/USD.',
    'This pass is capped and explicitly reports unexamined pairs; earlier Helius history may be incomplete.'
   ]};
 const fetchPage=async(g,fromMs,toMs,before,pageLimit)=>{
  if(heliusCalls>=FORENSIC_LIMITS.maxApiCallsPerBatch)return {error:'HELIUS_CALL_BUDGET'};
  const wait=Math.max(0,1500-(Date.now()-lastProviderAt));if(wait)await sleep(wait);
  heliusCalls++;lastProviderAt=Date.now();
  const u=new URL('https://api-mainnet.helius-rpc.com/v0/addresses/'+encodeURIComponent(g.pool)+'/transactions');
  for(const [k,v] of Object.entries({'api-key':helius,
    limit:String(pageLimit),
    'gte-time':String(Math.floor(fromMs/1000)),
    'lte-time':String(Math.ceil(toMs/1000)),
    ...(before?{'before-signature':before}:{})}))u.searchParams.set(k,v);
  try{
   const r=await fetch(u,{headers:{accept:'application/json'},
    signal:AbortSignal.timeout(FORENSIC_LIMITS.heliusTimeoutMs)});
   if(!r.ok)return {error:'HELIUS_HTTP_'+r.status};
   const byteSize=Number(r.headers.get('content-length'));
   if(Number.isFinite(byteSize)&&byteSize>FORENSIC_LIMITS.maxSourceBytes)return {error:'HELIUS_OVERSIZE'};
   const text=await r.text();
   if(text.length>FORENSIC_LIMITS.maxSourceBytes)return {error:'HELIUS_OVERSIZE'};
   const a=JSON.parse(text);
   if(!Array.isArray(a)||a.length>pageLimit)
     return {error:'HELIUS_RESPONSE_SHAPE'};
   // Validate pagination time boundaries and exact unique signatures before
   // accepting it as complete or as evidence of absence.
   for(const tx of a)validateEvidenceTx(tx,{
     pool:g.pool,fromMs:fromMs-1000,toMs:toMs+1000});
   for(let i=1;i<a.length;i++)
     if(a[i].timestamp>a[i-1].timestamp)return {error:'HELIUS_ORDER_UNVERIFIED'};
   return {items:a};
  }catch(e){
   return {error:errorCode(e)==='OUT_OF_REQUESTED_TIME_WINDOW'?
     'HELIUS_TIME_FILTER_UNVERIFIED':'HELIUS_REQUEST_OR_PARSE_UNVERIFIED'};
  }
 };
 const insertSQL='INSERT INTO goget_historical_pool_activity_audit(mint,bucket,horizon_min,due_at,pool,classification,enhanced_history_complete,pages_read,requested_helius_calls,nearby_tx_count,exact_pool_tx_count,labeled_swap_tx_count,exact_mint_swap_hint_count,unknown_pool_tx_count,signatures_json,provider_failure,checked_at,source,reconstructed_usd_price) VALUES';
 const improveOnly=' ON CONFLICT(mint,bucket,horizon_min) DO UPDATE SET classification=excluded.classification,enhanced_history_complete=excluded.enhanced_history_complete,pages_read=excluded.pages_read,requested_helius_calls=excluded.requested_helius_calls,nearby_tx_count=excluded.nearby_tx_count,exact_pool_tx_count=excluded.exact_pool_tx_count,labeled_swap_tx_count=excluded.labeled_swap_tx_count,exact_mint_swap_hint_count=excluded.exact_mint_swap_hint_count,unknown_pool_tx_count=excluded.unknown_pool_tx_count,signatures_json=excluded.signatures_json,provider_failure=excluded.provider_failure,checked_at=excluded.checked_at WHERE goget_historical_pool_activity_audit.enhanced_history_complete=0 AND excluded.enhanced_history_complete=1';
 for(const g of selected){
  if(heliusCalls>=FORENSIC_LIMITS.maxApiCallsPerBatch){
   report.groupReports.push({pool:g.pool,mint:g.mint,sourceRows:g.rows.length,
    status:'SKIPPED_GLOBAL_HELIUS_BUDGET'});report.deferredPairs++;
   report.deferredRows+=g.rows.length;continue;
  }
  const fromMs=Math.min(...g.rows.map(r=>Date.parse(r.due_at)));
  const toMs=Math.max(...g.rows.map(r=>Date.parse(r.due_at)))+
    FORENSIC_LIMITS.afterDueMs;
  const transactions=[];
  const signatureSeen=new Set();
  // Failed oversized reads are retried with 20-record pages, without
  // expanding the existing 30-call provider budget.
  const retryIncomplete=g.rows.some(x=>Number(x.priorComplete)===0);
  const pageLimit=retryIncomplete?20:FORENSIC_LIMITS.pageSize;
  let before=null,complete=false,providerFailure=null,pages=0;
  const startingCall=heliusCalls;
  for(let i=0;i<FORENSIC_LIMITS.maxPagesPerPool;i++){
   const got=await fetchPage(g,fromMs,toMs,before,pageLimit);
   if(got.error){providerFailure=got.error;break;}
   pages++;
   if(got.items.length===0){complete=true;break;}
   const pageLast=got.items.at(-1).signature;
   if(!SIG.test(pageLast)||pageLast===before){
    providerFailure='PAGINATION_CURSOR_STALLED';break;
   }
   const overlap=got.items.some(x=>signatureSeen.has(x.signature));
   if(overlap){providerFailure='PAGINATION_DUPLICATE_OR_LOOP';break;}
   for(const tx of got.items){signatureSeen.add(tx.signature);transactions.push(tx);}
   before=pageLast;
   if(heliusCalls>=FORENSIC_LIMITS.maxApiCallsPerBatch){
    providerFailure='GLOBAL_HELIUS_CALL_BUDGET';break;
   }
  }
  if(!complete&&!providerFailure)providerFailure='MAX_PAGES_REACHED';
  // Helius time filters use whole UTC seconds: the original due timestamp
  // includes milliseconds. Exclude boundary transactions, never round them
  // into an absent forward-quote window or reject the entire otherwise-valid page.
  const exactWindowTransactions=transactions.filter(x=>
    x.timestamp*1000>=fromMs&&x.timestamp*1000<=toMs);
  const evidence=classifyHistoricalPoolWindows(g.rows,exactWindowTransactions,{
   pool:g.pool,mint:g.mint,historyComplete:complete,
   providerFailure,asOf:new Date().toISOString()});
  // Treat each missing outcome independently and never overwrite existing
  // recovery, forward outcome, or a previous forensic audit.
  let inserted=0,duplicates=0;
  for(let i=0;i<evidence.length;i+=4){
   const chunk=evidence.slice(i,i+4);
   const params=chunk.flatMap(v=>[
    v.mint,v.bucket,v.horizonMin,v.dueAt,v.pool,v.classification,
    complete?1:0,pages,heliusCalls-startingCall,
    v.nearbyTxCount,v.validPoolTxCount,v.labeledPoolSwapTxCount,
    v.exactMintHintedSwaps,v.unclassifiedPoolTxCount,JSON.stringify(v.signatures),
    providerFailure,v.asOf,v.source,0
   ]);
   const sql=insertSQL+chunk.map(()=>'(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').join(',')+improveOnly;
   const result=await dbQuery(sql,params);d1Writes++;
   const n=Number(result.meta?.changes);
   if(!Number.isSafeInteger(n)||n<0||n>chunk.length)throw Error('D1_WRITE_UNVERIFIED');
   inserted+=n;duplicates+=chunk.length-n;
  }
  for(const v of evidence)
   report.classificationCounts[v.classification]=(report.classificationCounts[v.classification]||0)+1;
  report.inserted+=inserted;report.duplicates+=duplicates;
  if(complete)report.completelyPagedGroups++;else report.partiallyPagedGroups++;
  const summary={pool:g.pool,mint:g.mint,sourceRows:g.rows.length,
   pages,pageLimit,retryIncomplete,heliusCalls:heliusCalls-startingCall,enhancedTxRead:transactions.length,
   enhancedTxInsideExactWindow:exactWindowTransactions.length,
   enhancedHistoryExhausted:complete,providerFailure,inserted,
   classifiedSwapWithMintHints:evidence.filter(x=>x.exactMintHintedSwaps>0).length,
   sampledMintHintedSwapSignatures:[...new Set(evidence.flatMap(x=>x.signatures.map(v=>v.signature)))].length,
   outcomeClassifications:evidence.reduce((a,x)=>{
    a[x.classification]=(a[x.classification]||0)+1;return a;
   },{})};
  report.groupReports.push(summary);
  console.log('GOGET_MISSING_POOL_FORENSIC_PAIR',JSON.stringify(summary));
 }
 report.d1Writes=d1Writes;report.d1Calls=d1Calls;report.heliusCalls=heliusCalls;
 report.completeCoverageClaim=false;
 report.fullyScannedOutcomeRows=report.groupReports.filter(x=>x.enhancedHistoryExhausted)
  .reduce((n,x)=>n+x.sourceRows,0);
 await writeFile('goget-missing-pool-forensics.json',JSON.stringify(report,null,2)+'\n');
 console.log('GOGET_MISSING_POOL_FORENSICS',JSON.stringify(report));
}
main().catch(e=>{
 console.error('GOGET_MISSING_POOL_FORENSICS_ERROR',errorCode(e));
 process.exitCode=1;
});
