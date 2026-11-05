#!/usr/bin/env node
// Budgeted GeckoTerminal public exact-pool 1-minute historical OHLCV recovery.
// No Helius calls, wallet accesses, edits to original outcomes, or actual orders.
import {writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {MINUTE_REPLAY_LIMITS as L,assessExactMinuteCandles,requireOriginalOutcome,
 nextMinuteReplayStatus} from '../src/goget-exact-minute-replay.mjs';
const need=k=>{const x=process.env[k];if(!x)throw Error('MINUTE_MISSING_'+k);return x};
const d1url='https://api.cloudflare.com/client/v4/accounts/'+encodeURIComponent(need('CF_ACCOUNT_ID'))+
 '/d1/database/'+encodeURIComponent(need('CF_DATABASE_ID'))+'/query';
const secret=need('CF_D1_API_TOKEN');const started=new Date().toISOString(),now=Date.parse(started);
const day=started.slice(0,10),runId=randomUUID();let dbCalls=0,apiCalls=0,matched=0;
let lastApi=0;const rows=[],errors=[];
const report={runId,at:started,mode:'RETROSPECTIVE_EXACT_POOL_ONE_MINUTE_OHLCV',
 sourceMissingTotal:null,sourceAlreadyRecovered:null,sourceRetrospectiveChecked:null,
 originalSourceDenominatorUnknown:false,selected:0,processed:0,providerCalls:0,
 apiBudgetReserved:0,matches:0,d1Calls:0,rows,errors,
 historicalOnly:true,updatedOriginalOutcomes:0,heliusCalls:0,trades:0,
 caveats:['This is exact pool, mint and UTC-minute retrospective market evidence, NOT an as-of forward quote.',
 'GeckoTerminal reports aggregated candle prices, not executable route depth, liquidity, or verified buys.',
 'Sparse minute cells remain explicitly missing. A matching close does NOT prove full minute series coverage.',
 'Source is all original MISSING_FUTURE_USD_QUOTE_COVERAGE rows; four candidates processed per run with persistent checkpoint, all still-pending rows counted.']};
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function db(sql,params=[],write=false){
 if(++dbCalls>L.maxD1Calls)throw Error('MINUTE_D1_QUERY_CAP');
 const r=await fetch(d1url,{method:'POST',headers:{
  authorization:'Bearer '+secret,'content-type':'application/json'},
  body:JSON.stringify({sql,params}),signal:AbortSignal.timeout(19000)});
 if(!r.ok)throw Error('MINUTE_D1_HTTP_'+r.status);
 const x=await r.json(),v=x?.result?.[0];
 if(x?.success!==true||v?.success!==true)throw Error('MINUTE_D1_RESULT_UNVERIFIED');
 if(write){
  if(!Number.isSafeInteger(v?.meta?.changes)||v.meta.changes<0)
   throw Error('MINUTE_D1_WRITE_UNVERIFIED');
  return v.meta.changes;
 }
 if(!Array.isArray(v?.results)||v.results.length>8)
  throw Error('MINUTE_D1_READ_UNVERIFIED');
 return v.results;
}
async function reserve(){
 await db('INSERT OR IGNORE INTO goget_exact_minute_replay_budget(day,api_requests_reserved) VALUES(?,0)',[day],true);
 const ok=await db('UPDATE goget_exact_minute_replay_budget SET api_requests_reserved=api_requests_reserved+1'+
  ' WHERE day=? AND api_requests_reserved+1<=?',[day,L.dailyApiCalls],true);
 if(ok!==1)return false;
 report.apiBudgetReserved++;return true;
}
async function fetchCandles(x){
 const wait=Math.max(0,L.minimumGapMs-(Date.now()-lastApi));
 if(lastApi&&wait)await delay(wait);
 lastApi=Date.now();apiCalls++;
 const before=Math.floor((Date.parse(x.due_at)+11*60000)/1000);
 const u=new URL('https://api.geckoterminal.com/api/v2/networks/solana/pools/'+encodeURIComponent(x.pool)+'/ohlcv/minute');
 for(const [k,v] of Object.entries({aggregate:'1',before_timestamp:String(before),
  limit:String(L.maxCandles),currency:'usd',token:x.mint}))u.searchParams.set(k,v);
 const r=await fetch(u,{headers:{accept:'application/json;version=20230203'},
  signal:AbortSignal.timeout(18000)});
 if(r.status===429)throw Error('MINUTE_GECKO_429');
 if(!r.ok)throw Error('MINUTE_GECKO_HTTP_'+r.status);
 const len=Number(r.headers.get('content-length'));
 if(Number.isFinite(len)&&len>L.maxBytes)throw Error('MINUTE_BODY_TOO_LARGE');
 const raw=await r.text();if(raw.length>L.maxBytes)throw Error('MINUTE_BODY_TOO_LARGE');
 let data;try{data=JSON.parse(raw)}catch{throw Error('MINUTE_BAD_JSON')}
 return assessExactMinuteCandles(data,x,{asOf:Date.now()});
}
async function store(x,result,attempts){
 const checked=new Date().toISOString(),retry=result.status.endsWith('RETRY_PENDING')?
  new Date(Date.now()+L.retryDelayMinutes*60000).toISOString():null;
 const body=JSON.stringify(result);
 if(body.length>5000)throw Error('MINUTE_AUDIT_BODY_TOO_LONG');
 const n=await db(
  'INSERT INTO goget_exact_minute_replay_outcomes'+
  '(mint,bucket,horizon_min,due_at,pool,checked_at,audit_status,provider,attempted_calls,next_retry_at,'+
  'one_minute_count,expected_minute_count,missing_minute_count,matched_candle_at,historical_close_usd,'+
  'historical_change_pct,quality_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'+
  ' ON CONFLICT(mint,bucket,horizon_min) DO UPDATE SET'+
  ' checked_at=excluded.checked_at,audit_status=excluded.audit_status,'+
  ' attempted_calls=excluded.attempted_calls,next_retry_at=excluded.next_retry_at,'+
  ' one_minute_count=excluded.one_minute_count,expected_minute_count=excluded.expected_minute_count,'+
  ' missing_minute_count=excluded.missing_minute_count,'+
  ' matched_candle_at=excluded.matched_candle_at,historical_close_usd=excluded.historical_close_usd,'+
  ' historical_change_pct=excluded.historical_change_pct,quality_json=excluded.quality_json',
  [x.mint,x.bucket,x.horizon_min,x.due_at,x.pool,checked,result.status,
   'GECKOTERMINAL_PUBLIC_HISTORICAL_MINUTE_OHLCV',attempts,retry,
   result.observedOneMinuteCells??null,result.expectedOneMinuteCells??null,
   result.missingOneMinuteCells??null,result.matchAt??null,result.closeUsd??null,
   result.matchedChangePct??null,body],true);
 if(n!==1)throw Error('MINUTE_D1_EXACT_OUTCOME_WRITE_UNVERIFIED');
}
async function run(){
 try{
  if(now>=Date.parse(L.stopUtc))throw Error('MINUTE_PILOT_EXPIRED');
  const [n,recovered,checked]=await Promise.all([
   db("SELECT COUNT(*) AS n FROM goget_pre_signal_market_outcomes WHERE status='MISSING_FUTURE_USD_QUOTE_COVERAGE'"),
   db("SELECT COUNT(*) AS n FROM goget_pre_signal_market_outcomes o JOIN goget_historical_price_recovery p ON p.mint=o.mint AND p.bucket=o.bucket AND p.horizon_min=o.horizon_min WHERE o.status='MISSING_FUTURE_USD_QUOTE_COVERAGE'"),
   db('SELECT COUNT(*) AS n FROM goget_exact_minute_replay_outcomes')
  ]);
  report.sourceMissingTotal=Number(n[0]?.n);
  report.sourceAlreadyRecovered=Number(recovered[0]?.n);
  report.sourceRetrospectiveChecked=Number(checked[0]?.n);
  if(![report.sourceMissingTotal,report.sourceAlreadyRecovered,
    report.sourceRetrospectiveChecked].every(x=>Number.isSafeInteger(x)&&x>=0))
   throw Error('MINUTE_SOURCE_TOTALS_UNVERIFIED');
  // Entire original missing-outcome denominator is counted. Each run starts
  // with the oldest unprocessed or eligible retry, never a truncated final scope.
  const dueBefore=new Date(now-11*60000).toISOString();
  const candidates=await db(
   'SELECT o.mint,o.bucket,o.horizon_min,o.due_at,o.pool,o.reference_price_usd,o.status,'+
   ' COALESCE(m.attempted_calls,0) AS previous_attempts'+
   ' FROM goget_pre_signal_market_outcomes o'+
   ' LEFT JOIN goget_exact_minute_replay_outcomes m ON m.mint=o.mint AND m.bucket=o.bucket AND m.horizon_min=o.horizon_min'+
   " WHERE o.status='MISSING_FUTURE_USD_QUOTE_COVERAGE' AND o.due_at<=?"+
   ' AND (m.mint IS NULL OR (m.audit_status IN (?,?) AND m.attempted_calls<? AND m.next_retry_at<=?))'+
   ' ORDER BY o.due_at ASC,o.mint ASC LIMIT 4',
   [dueBefore,'PROVIDER_RETRY_PENDING','RATE_LIMITED_RETRY_PENDING',L.maxRetries,started]);
  report.selected=candidates.length;
  let rateLimited=false;
  for(const c of candidates){
   const record={mint:c.mint,bucket:c.bucket,horizonMin:c.horizon_min,dueAt:c.due_at,pool:c.pool,
    status:'NOT_CHECKED'};
   rows.push(record);
   let anchor;
   try{anchor=requireOriginalOutcome(c,{asOf:now});}
   catch{record.status='INVALID_ORIGINAL_IDENTITY';
    errors.push({mint:c.mint,code:'MINUTE_ORIGINAL_OUTCOME_UNVERIFIED'});continue;}
   if(rateLimited){record.status='DEFERRED_RATE_LIMIT_NO_CALL';continue;}
   if(!await reserve()){record.status='DEFERRED_DAILY_PUBLIC_PROVIDER_BUDGET';continue;}
   let result;
   try{result=await fetchCandles(anchor);}
   catch(e){
    const code=e?.message||'';
    if(code==='MINUTE_GECKO_429')rateLimited=true;
    const attempts=Number(c.previous_attempts)+1;
    const status=nextMinuteReplayStatus(code==='MINUTE_GECKO_429'?'RATE_LIMITED':'PROVIDER',attempts);
    result={status,reason:/^MINUTE_[A-Z0-9_]+$/.test(code)?code:'PROVIDER_UNVERIFIED',
     historicalOnly:true,completeOneMinuteSeries:false,certifiedExecutablePrice:false};
   }
   const attempts=Number(c.previous_attempts)+1;
   await store(c,result,attempts);
   record.status=result.status;record.matchedAt=result.matchAt??null;
   record.expectedOneMinuteCells=result.expectedOneMinuteCells??null;
   record.missingOneMinuteCells=result.missingOneMinuteCells??null;
   record.completeMinuteSeries=result.completeOneMinuteSeries??false;
   if(result.status==='RETROSPECTIVE_ONE_MINUTE_USD_CLOSE_MATCH')matched++;
   report.processed++;
  }
  report.status=report.selected===0?'NO_ELIGIBLE_OUTCOMES_ALL_SOURCE_COUNTS_RETAINED':
   report.processed===report.selected?'PARTIAL_SOURCE_DENOMINATOR_RETAINED':
   'PARTIAL_WITH_EXPLICIT_DEFERRED_OUTCOMES';
 }catch(e){errors.push({code:/^MINUTE_[A-Z0-9_]+$/.test(e?.message||'')?e.message:'SOURCE_OR_D1_UNVERIFIED'});
  report.status='PRECONDITION_OR_STORAGE_UNVERIFIED';}
 report.providerCalls=apiCalls;report.matches=matched;report.d1Calls=dbCalls;
 if(report.sourceMissingTotal!==null)
  report.stillNotIndividuallyAuditedAtStart=Math.max(0,report.sourceMissingTotal-report.sourceRetrospectiveChecked);
 try{
  const result=await db('INSERT OR IGNORE INTO goget_exact_minute_replay_runs'+
   '(run_id,at,status,source_missing_total,source_already_recovered,total_retrospective_checked,'+
   ' public_requests,accepted_minute_matches,api_budget_used,summary_json) VALUES(?,?,?,?,?,?,?,?,?,?)',
   [runId,started,report.status,report.sourceMissingTotal??0,report.sourceAlreadyRecovered??0,
   report.sourceRetrospectiveChecked??0,apiCalls,matched,report.apiBudgetReserved,
   JSON.stringify(report).slice(0,10000)],true);
  if(result!==1)throw Error('MINUTE_RUN_LOG_UNVERIFIED');
 }catch{errors.push({code:'MINUTE_RUN_LOG_UNVERIFIED'});report.status='PRECONDITION_OR_STORAGE_UNVERIFIED';}
 await writeFile('goget-exact-minute-replay-report.json',JSON.stringify(report,null,2)+'\n');
 console.log('GOGET_EXACT_MINUTE_REPLAY',JSON.stringify(report));
 if(errors.length)process.exitCode=1;
}
run().catch(e=>{console.error('GOGET_EXACT_MINUTE_FATAL',/^MINUTE_[A-Z0-9_]+$/.test(e?.message||'')?
 e.message:'SOURCE_UNVERIFIED');process.exitCode=1});
