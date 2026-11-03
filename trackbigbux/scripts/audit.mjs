// trackBIGBUX external read-only source-data auditor.
// Does not accept the Worker's quality summary as evidence of completed collection.
export const FROZEN = Object.freeze({
 'sol-g4':['solana','4t5cayg6FDWkyQwyuYq9DqcRRCQ7e6JXyf9J7f2wfZQW'],
 'sol-polish-batman':['solana','7zs3Cda5C8XWadmFKKfuPyXpo78F5AFY6RXQ3Ec5p9k7'],
 'sol-decu':['solana','4vw54BmAogeRV3vPKWyFet5yf8DTLcREzdSzx4rw9Ud9'],
 'sol-cented':['solana','CyaE1VxvBrahnPWkqm5VsdCvyS2QmNht2UFrKJHga54o'],
 'sol-end837':['solana','5DBkonys2H4qHr5x9CCeXPLSWEFbnnLFP1RdfxjJgzvy'],
 'rh-unipcs':['robinhood','0x0a6ebed0155edb4b21d92ad02897a626cd90119e'],
 'rh-theveeman':['robinhood','0xa0670863bd5cd0d60022bab2eed78e81e1a06bce'],
 'rh-ogle':['robinhood','0x1bcc5f67cd17e13770f199fa03bc043b0cde1143'],
 'rh-avast':['robinhood','0xcc0c581613dfd4ace7c8686668427236f8bd5cc5'],
 'rh-avgjoescrypto':['robinhood','0x06de9c48b1e639ed5c13ec8fbd4080a38e39f2d1'],
 'rh-solstice':['robinhood','0xd1c77a04b87393e98a1220532e72e8f7d0a31c5a'],
 'rh-frank':['robinhood','0x696d1265c8fc4f14797abebfae3c43ebfa9d8e28']
});
export const AUDIT_ROSTER_VERSION='2026-11-02-v1';
export const EXPECTED_AUDIT_COUNT=Object.keys(FROZEN).length;
const eq=(a,b,chain)=>chain==='robinhood'?
  String(a||'').toLowerCase()===String(b||'').toLowerCase():String(a||'')===String(b||'');
// Do not audit half-persisted coverage rows while a five-minute scan is active.
// Use its most recent finished predecessor, never pretend the running scan passed.
export function pickAuditableRun(latest,previousFinished){
  const activeRun=latest?.status==='RUNNING'?latest:null;
  return {run:activeRun?(previousFinished||null):(latest||null),activeRun};
}
export function parserEvidence(receipts=[]){
  const rows=receipts.filter(x=>x.wallet_id==='__parser'&&x.request_kind==='parseTransactions');
  return {attempted:rows.length,ok:rows.filter(x=>x.result_status==='OK').length,
    failed:rows.filter(x=>x.result_status==='FAILED').length,
    recordsReturned:rows.filter(x=>x.result_status==='OK')
      .reduce((n,x)=>n+Number(x.response_records||0),0)};
}
export function evaluateAudit({now=new Date(),run=null,activeRun=null,coverage=[],receipts=[],persistedEvents=0,pending=0,previous=null}={}){
  const failures=[];
  if(activeRun){
    const activeAt=Date.parse(activeRun.started_at||'');
    const activeAge=now.getTime()-activeAt;
    if(!Number.isFinite(activeAge)||activeAge>10*60000||activeAge< -60000)
      failures.push('STALE_OR_INVALID_ACTIVE_RUN');
  }
  if(EXPECTED_AUDIT_COUNT!==12)throw Error('EXTERNAL_ROSTER_CORRUPT');
  if(!run)failures.push('NO_SOURCE_RUN');
  if(run?.roster_version!==AUDIT_ROSTER_VERSION)failures.push('WRONG_ROSTER_VERSION');
  if(run?.expected_wallets!==12)failures.push('COLLECTOR_DENOMINATOR_NOT_FROZEN');
  if(run?.attempted_wallets!==12)failures.push('ATTEMPTED_COUNT_NOT_12');
  if(run?.complete_wallets!==12)failures.push('COMPLETE_COUNT_NOT_12');
  if(run?.status!=='RAW_COVERAGE_COMPLETE')failures.push('RUN_NOT_FULL_RAW_COVERAGE');
  const t=Date.parse(run?.completed_at||'');
  if(!Number.isFinite(t)||now.getTime()-t>25*60000||t>now.getTime()+60000)failures.push('STALE_OR_FUTURE_SOURCE_RUN');
  const byId=new Map();
  for(const x of coverage){
    if(byId.has(x.wallet_id))failures.push('DUPLICATE_COVERAGE:'+x.wallet_id);
    byId.set(x.wallet_id,x);
  }
  if(coverage.length!==12)failures.push('COVERAGE_ROWS_NOT_12');
  const goodRequests=new Set();
  for(const receipt of receipts){
    if(FROZEN[receipt.wallet_id] && receipt.result_status==='OK'&&receipt.response_records>=0)
      goodRequests.add(receipt.wallet_id);
  }
  for(const [id,[chain,address]] of Object.entries(FROZEN)){
    const row=byId.get(id);
    if(!row){failures.push('MISSING_WALLET:'+id);continue;}
    if(row.chain!==chain||!eq(row.expected_address,address,chain))failures.push('ADDRESS_IDENTITY_MISMATCH:'+id);
    if(row.status!=='OK'||row.checkpoint_matched!==1)failures.push('SOURCE_COVERAGE_INCOMPLETE:'+id);
    if(!goodRequests.has(id))failures.push('PROVIDER_RECEIPT_MISSING:'+id);
  }
  if(!Number.isInteger(persistedEvents)||persistedEvents<0)failures.push('INVALID_PERSISTED_EVENTS_COUNT');
  if(!Number.isInteger(pending)||pending<0)failures.push('INVALID_PARSER_BACKLOG');
  let verdict=failures.length?'INCOMPLETE':'RAW_CAPTURE_VERIFIED';
  if(failures.length&&previous?.verdict==='RAW_CAPTURE_VERIFIED')verdict='REGRESSION';
  return {verdict,failures,observed:coverage.length,requestWallets:goodRequests.size,
    candidateEvents:Number(run?.events_staged||0),persistedEvents,pending};
}
const q=(s,params)=>({sql:s,params});
async function callD1(account,dbId,key,sql,params=[]){
  const url='https://api.cloudflare.com/client/v4/accounts/'+account+'/d1/database/'+dbId+'/query';
  const response=await fetch(url,{method:'POST',headers:{'content-type':'application/json',
    'authorization':'Bearer '+key},body:JSON.stringify(q(sql,params))});
  if(!response.ok)throw Error('D1_HTTP_'+response.status);
  const data=await response.json();
  if(data.success!==true||data.result?.[0]?.success!==true)throw Error('D1_QUERY_FAILED');
  return data.result[0].results||[];
}
function need(key){
  const val=process.env[key];
  if(!val)throw Error('MISSING_'+key);
  return val;
}
export async function main(){
  const account=need('CF_ACCOUNT_ID'),database=need('CF_DATABASE_ID'),token=need('CF_D1_API_TOKEN');
  const d1=(sql,params)=>callD1(account,database,token,sql,params);
  const [latest]=await d1('SELECT * FROM trackbigbux_runs ORDER BY bucket DESC LIMIT 1');
  const [lastFinished]=await d1("SELECT * FROM trackbigbux_runs WHERE status!='RUNNING' ORDER BY bucket DESC LIMIT 1");
  const {run,activeRun}=pickAuditableRun(latest,lastFinished);
  let coverage=[],receipts=[],persistedEvents=0,pending=0;
  if(run){
    coverage=await d1('SELECT * FROM trackbigbux_coverage WHERE run_id=? ORDER BY wallet_id LIMIT 50',[run.run_id]);
    receipts=await d1('SELECT * FROM trackbigbux_receipts WHERE run_id=? LIMIT 150',[run.run_id]);
    const [eventCount]=await d1('SELECT count(*) AS n FROM trackbigbux_activity WHERE observed_at>=? AND observed_at<=?',[
      run.started_at,run.completed_at||new Date().toISOString()]);
    persistedEvents=Number(eventCount?.n||0);
    const [p]=await d1("SELECT count(*) AS n FROM trackbigbux_activity WHERE chain='solana' AND category='UNPARSED_SIGNATURE'");
    pending=Number(p?.n||0);
  }
  const [previous]=await d1('SELECT verdict FROM trackbigbux_external_audits ORDER BY audited_bucket DESC LIMIT 1');
  const now=new Date();
  const result=evaluateAudit({now,run,activeRun,coverage,receipts,persistedEvents,pending,previous});
  const parser=parserEvidence(receipts);
  const bucket=Math.floor(now.getTime()/3600000);
  await d1('INSERT OR IGNORE INTO trackbigbux_external_audits (audited_bucket,audited_at,source_run_id,source_started_at,source_status,roster_version,frozen_denominator,actual_coverage,verified_request_wallets,candidate_events_seen,actual_events_in_run,parser_pending,failures_json,verdict) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',[
    bucket,now.toISOString(),run?.run_id||null,run?.started_at||null,run?.status||'NO_SOURCE',
    AUDIT_ROSTER_VERSION,12,result.observed,result.requestWallets,result.candidateEvents,
    result.persistedEvents,result.pending,JSON.stringify(result.failures),result.verdict
  ]);
  // Print bounded persisted provider failure receipts, not AI recollections.
  // A failed parse is not evidence that a wallet stopped trading. Print only
  // bounded persisted receipt details, never raw Helius URLs, headers or keys.
  const parserDiagnostics=receipts.filter(x=>x.wallet_id==='__parser').map(x=>({
    at:x.observed_at,status:x.result_status,records:x.response_records,
    details:String(x.details||'').replace(/https?:\/\/\S+/g,'[endpoint]').slice(0,180)
  })).slice(0,12);
  console.log('TRACKBIGBUX_PARSER_DIAGNOSTICS',JSON.stringify(parserDiagnostics));
  console.log('TRACKBIGBUX_SOURCE_DIAGNOSTICS',JSON.stringify(coverage
    .filter(x=>x.status==='ERROR'||x.status==='CHECKPOINT_NOT_FOUND')
    .map(x=>({wallet:x.wallet_id,status:x.status,error:String(x.error||'').slice(0,160),
      fetch_calls:x.fetch_calls,received:x.rows_received})).slice(0,12)));
  const summary={project:'trackBIGBUX',external_audit:true,source_run:run?.run_id||null,
    verdict:result.verdict,expected:12,coverage:result.observed,
    requestWallets:result.requestWallets,persistedEvents:result.persistedEvents,
    activeRun:activeRun?.run_id||null,
    activeRunStartedAt:activeRun?.started_at||null,
    parserPending:result.pending,parserProcessed:Number(run?.enhanced_parsed||0),
    parserReceipts:parser,failures:result.failures};
  console.log(JSON.stringify(summary));
  if(result.verdict!=='RAW_CAPTURE_VERIFIED')process.exitCode=1;
  return summary;
}
if(import.meta.url==='file://'+process.argv[1])main().catch(e=>{
  console.error('TRACKBIGBUX_EXTERNAL_AUDIT_FAILED',String(e.message||e).slice(0,180));
  process.exitCode=1;
});
