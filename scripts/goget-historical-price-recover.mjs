#!/usr/bin/env node
// One-shot bounded historical price forensic backfill. Original forward labels never edited.
// GeckoTerminal is a retrospective public aggregate OHLCV source, not executable quotes.
import {readFile,writeFile} from 'node:fs/promises';
import {parseHistoricalOhlcv,matchHistoricOutcome,HISTORY_BOUNDS} from '../src/goget-historical-ohlcv.mjs';
const required=k=>{const v=process.env[k];if(!v)throw Error('MISSING_'+k);return v;};
const b58=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const codeOf=x=>{
 const allowed=new Set(['MINT_IDENTITY_UNVERIFIED','POOL_IDENTITY_MISMATCH',
  'INVALID_CANDLE_RECORD','HISTORICAL_CANDLE_RESPONSE_INVALID','INVALID_CANDLE_VALUE',
  'CANDLE_PRICE_RANGE_INVALID','OVERSIZE','INVALID_EXACT_PAIR']);
 return allowed.has(x?.message)?x.message:'PROVIDER_UNAVAILABLE_OR_INVALID';
};
async function main(){
 const account=required('CF_ACCOUNT_ID'),db=required('CF_DATABASE_ID'),
 token=required('CF_D1_API_TOKEN');
 const url='https://api.cloudflare.com/client/v4/accounts/'+encodeURIComponent(account)+
 '/d1/database/'+encodeURIComponent(db)+'/query';
 let queries=0,writes=0;
 const sql=async(query,params=[])=>{
  if(++queries>160)throw Error('D1_QUERY_BUDGET_EXCEEDED');
  const r=await fetch(url,{method:'POST',headers:{authorization:'Bearer '+token,
   'content-type':'application/json'},body:JSON.stringify({sql:query,params}),
   signal:AbortSignal.timeout(15000)});
  if(!r.ok)throw Error('D1_HTTP_'+r.status);
  const body=await r.json();
  if(body?.success!==true||body?.result?.[0]?.success!==true||
    !Array.isArray(body?.result?.[0]?.results))throw Error('D1_RESPONSE_UNVERIFIED');
  return body.result[0];
 };
 const from='2026-10-30T00:00:00.000Z',now=new Date().toISOString();
 const counts=await sql(
  "SELECT COUNT(*) AS n FROM goget_pre_signal_market_outcomes WHERE status='MISSING_FUTURE_USD_QUOTE_COVERAGE' AND due_at>=?",
  [from]);
 const totalMissing=Number(counts.results?.[0]?.n);
 if(!Number.isSafeInteger(totalMissing)||totalMissing<0)throw Error('SOURCE_COUNTS_UNVERIFIED');
 const a=await sql(
  "SELECT o.mint,o.bucket,o.horizon_min,o.due_at,o.pool,o.reference_price_usd,s.sample_kind,s.category FROM goget_pre_signal_market_outcomes o JOIN goget_pre_signal_snapshots s ON s.mint=o.mint AND s.bucket=o.bucket WHERE o.status='MISSING_FUTURE_USD_QUOTE_COVERAGE' AND o.due_at>=? ORDER BY o.due_at ASC LIMIT ?",
  [from,HISTORY_BOUNDS.maxMissingRows]);
 const rows=a.results;
 if(rows.length>HISTORY_BOUNDS.maxMissingRows)throw Error('SOURCE_RESULT_TOO_LARGE');
 // Refuse to certify any row without original as-of reference, exact pair and timestamp.
 const valid=rows.filter(x=>b58.test(x.pool||'')&&b58.test(x.mint||'')&&
   Number.isFinite(Date.parse(x.due_at||''))&&Number(x.reference_price_usd)>0&&
   ['CONTROL','POTENTIAL_SIGNAL'].includes(x.sample_kind));
 const groups=new Map();
 for(const x of valid){
  const k=x.pool+':'+x.mint;
  if(!groups.has(k))groups.set(k,{pool:x.pool,mint:x.mint,rows:[]});
  groups.get(k).rows.push(x);
 }
 const ordered=[...groups.values()].sort((a,b)=>a.rows[0].due_at.localeCompare(b.rows[0].due_at)||a.pool.localeCompare(b.pool));
 const selected=ordered.slice(0,HISTORY_BOUNDS.maxPoolReads);
 const report={at:now,mode:'ONE_SHOT_RETROSPECTIVE_RECOVERY_NO_FORWARD_LABEL_CHANGES',
   totalMissingAtStart:totalMissing,selectedMissing:rows.length,
   invalidAnchors:rows.length-valid.length,distinctPairs:ordered.length,
   processedPairs:0,externalCalls:0,providerFailures:{},noPostDueCandle:0,
   matched:0,inserted:0,duplicates:0,matchedSignals:0,matchedControls:0,
   unprocessedPairs:Math.max(0,ordered.length-selected.length),
   truncatedByRowCap:totalMissing>rows.length,
   source:'GECKOTERMINAL_PUBLIC_HISTORICAL_MINUTE_USD_OHLCV',
   resultsByPair:[],d1QueryCount:0,d1WriteCalls:0,
   historicalOnly:true,heliusCalls:0,trades:0,
   notes:[
    'Original goget_pre_signal_market_outcomes rows and statuses are IMMUTABLE in this repair.',
    'Historical candles are retrospective observations, NOT the live-forward quote originally missing.',
    'Signals and controls are not independent samples; any returns are only descriptive, never certified profits.',
    'No historical OHLCV can prove executable liquidity, fees, slippage, or independently verified wallet buys.'
   ]};
 // Creating only additive isolated table from version-controlled SQL; never update original metrics.
 const schema=(await readFile('sql/goget-historical-price-recovery.sql','utf8')).split('\n')
   .filter(l=>!l.trim().startsWith('--')).join('\n').split(';').map(s=>s.trim()).filter(Boolean);
 for(const statement of schema){await sql(statement);writes++;}
 const minute=60000;
 // Public GeckoTerminal rate varies; keep below ten calls a minute, including retries.
 let lastCall=0;
 const provider=async(g,end)=>{
  for(let attempt=0;attempt<2;attempt++){
   if(report.externalCalls>=HISTORY_BOUNDS.maxApiCalls)return {kind:'PROVIDER_CALL_BUDGET'};
   const wait=Math.max(0,12500-(Date.now()-lastCall));
   if(wait)await sleep(wait);
   lastCall=Date.now();report.externalCalls++;
   const before=Math.floor((Date.parse(end)+11*minute)/1000);
   const u=new URL('https://api.geckoterminal.com/api/v2/networks/solana/pools/'+encodeURIComponent(g.pool)+'/ohlcv/minute');
   for(const [k,v] of Object.entries({aggregate:'1',before_timestamp:String(before),
    limit:'900',currency:'usd',token:g.mint}))u.searchParams.set(k,v);
   try{
    const resp=await fetch(u,{headers:{accept:'application/json;version=20230203'},
     signal:AbortSignal.timeout(HISTORY_BOUNDS.fetchTimeoutMs)});
    if(resp.status===429){if(attempt===0){await sleep(45000);continue;}return {kind:'RATE_LIMITED'};}
    if(!resp.ok)return {kind:'HTTP_'+resp.status};
    if(Number(resp.headers.get('content-length')||0)>HISTORY_BOUNDS.maxBytes)
      return {kind:'OVERSIZE'};
    const text=await resp.text();
    if(text.length>HISTORY_BOUNDS.maxBytes)return {kind:'OVERSIZE'};
    const parsed=parseHistoricalOhlcv(JSON.parse(text),{mint:g.mint,pool:g.pool});
    return {kind:'OK',candles:parsed.candles};
   }catch(e){return {kind:codeOf(e)};}
  }
  return {kind:'RATE_LIMITED'};
 };
 const insert="INSERT OR IGNORE INTO goget_historical_price_recovery(mint,bucket,horizon_min,due_at,pool,reference_price_usd,historical_candle_at,historical_candle_close_usd,historical_change_pct,sample_kind,source,recovered_at) VALUES";
 const pending=[];
 const flush=async()=>{
  while(pending.length){
   const batch=pending.splice(0,5);
   const placeholders=batch.map(()=>'(?,?,?,?,?,?,?,?,?,?,?,?)').join(',');
   const params=batch.flat();
   const result=await sql(insert+placeholders,params);
   writes++;
   const n=Number(result.meta?.changes);
   if(!Number.isSafeInteger(n)||n<0||n>batch.length)throw Error('D1_RECOVERY_WRITE_UNVERIFIED');
   report.inserted+=n;
   report.duplicates+=batch.length-n;
  }
 };
 for(const g of selected){
  const sorted=[...g.rows].sort((a,b)=>a.due_at.localeCompare(b.due_at));
  // Segment at most ten hours of due timestamps, fitting a 900-bar 1m provider page.
  const windows=[];
  for(const x of sorted){
   const last=windows.at(-1);
   if(!last||Date.parse(x.due_at)-Date.parse(last[0].due_at)>10*60*minute)
     windows.push([x]);
   else last.push(x);
  }
  const stats={pool:g.pool,mint:g.mint,missingSourceRows:g.rows.length,
    windows:windows.length,matched:0,noCandle:0,providerFailures:[]};
  for(const windowRows of windows){
   const last=windowRows.at(-1);
   const response=await provider(g,last.due_at);
   if(response.kind!=='OK'){
    report.providerFailures[response.kind]=(report.providerFailures[response.kind]||0)+1;
    stats.providerFailures.push(response.kind);
    continue;
   }
   for(const o of windowRows){
    const evidence=matchHistoricOutcome(o,response.candles);
    if(evidence.status!=='HISTORICAL_INDICATIVE_OHLCV_MATCH'){
      report.noPostDueCandle++;stats.noCandle++;continue;
    }
    report.matched++;stats.matched++;
    if(o.sample_kind==='POTENTIAL_SIGNAL')report.matchedSignals++;
    if(o.sample_kind==='CONTROL')report.matchedControls++;
    pending.push([o.mint,o.bucket,o.horizon_min,o.due_at,o.pool,
      Number(o.reference_price_usd),evidence.candleAt,evidence.candleCloseUsd,
      evidence.changePct,o.sample_kind,'GECKOTERMINAL_HISTORICAL_1M_USD',new Date().toISOString()]);
    if(pending.length>=5)await flush();
   }
  }
  await flush();
  report.resultsByPair.push(stats);
  report.processedPairs++;
  console.log('GOGET_HISTORICAL_RECOVERY_PAIR',JSON.stringify(stats));
  if(report.externalCalls>=HISTORY_BOUNDS.maxApiCalls){report.stoppedByApiCap=true;break;}
 }
 await flush();
 report.d1QueryCount=queries;report.d1WriteCalls=writes;
 report.unattemptedPairs=Math.max(0,ordered.length-report.processedPairs);
 report.missingNotReconstructed=totalMissing-report.matched;
 report.completeCoverageClaim=false;
 await writeFile('goget-historical-price-recovery.json',JSON.stringify(report,null,2)+'\n');
 console.log('GOGET_HISTORICAL_PRICE_RECOVERY',JSON.stringify(report));
}
main().catch(e=>{
 const known=/^(?:D1_HTTP_\d+|D1_QUERY_BUDGET_EXCEEDED|SOURCE_COUNTS_UNVERIFIED|SOURCE_RESULT_TOO_LARGE|D1_RECOVERY_WRITE_UNVERIFIED)$/;
 console.error('GOGET_HISTORICAL_PRICE_RECOVERY_FAILED',known.test(e?.message||'')?e.message:'REPLAY_UNVERIFIED');
 process.exitCode=1;
});
