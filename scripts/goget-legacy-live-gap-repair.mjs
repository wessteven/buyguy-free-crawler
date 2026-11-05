#!/usr/bin/env node
// GOGET retrospective source-only reconstruction of three exact stalled RPC cursors.
// Append only to goget_legacy_rpc_replay_* tables. No live cursor repair, no orders.
// Shared RPC credit reservations remain atomic with Cloudflare's five-minute collector.
import {readFile,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {GAP_WALLETS} from '../src/goget-wallet-gap-wave.mjs';
import {LEGACY_REPLAY_LIMITS as L,validateExactReplayRoster,
 validateReplaySourcePage,planReplayPage,verifiedJournal}
 from '../src/goget-legacy-live-gap-replay.mjs';

const E=k=>{const v=process.env[k];if(!v)throw Error('MISSING_'+k);return v;};
const account=E('CF_ACCOUNT_ID'),database=E('CF_DATABASE_ID'),
 d1Token=E('CF_D1_API_TOKEN'),heliusKey=E('HELIUS_API_KEY');
const d1Url='https://api.cloudflare.com/client/v4/accounts/'+
 encodeURIComponent(account)+'/d1/database/'+encodeURIComponent(database)+'/query';
const rpcUrl='https://mainnet.helius-rpc.com/?api-key='+encodeURIComponent(heliusKey);
const at=()=>new Date().toISOString(),since=at(),day=since.slice(0,10);
const runId=randomUUID();let d1Calls=0,rpcCalls=0,reserved=0,lastRpcAt=0;
const reports=[],failures=[];
const mainReport={runId,startedAt:since,mode:'RETROSPECTIVE_HELIUS_SIGNATURE_BRIDGE_ONLY',
 expectedWallets:GAP_WALLETS,plannedWallets:GAP_WALLETS.length,
 completedWallets:0,sourceCallsAttempted:0,estimatedCreditsReserved:0,
 d1Calls:0,storedNewSignatures:0,checkedSourceSignatures:0,
 status:'STARTED',wallets:reports,failures,
 originalLiveCursorsUnchanged:true,newCloudflareSourceUnchanged:true,
 oldHistoricalReplayUnchanged:true,webhookSubscriptionUnchanged:true,
 realTrades:0,
 caveats:['A Helius confirmed signature listing is not verified signing, a purchase, a price, or a forward observed fill.',
 'A recovered bridge proves contiguous Helius signature pagination from the immutable new-source seed back to the exact prior live cursor only.',
 'No raw-chain completeness or historical as-of trading outcome is certified.',
 'The old live cursor stays unchanged; it is not legitimate to retroactively label a historical replay as a live polling run.',
 'Source evidence is deduplicated exactly by wallet and signature across four distinct datasets.',
 'Credit estimates are conservative local reservations, not actual Helius account billing.']};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function query(sql,params=[],{write=false}={}){
 if(++d1Calls>L.maxD1Queries)throw Error('LEGACY_D1_CALL_CAP');
 const r=await fetch(d1Url,{method:'POST',headers:{
  authorization:'Bearer '+d1Token,'content-type':'application/json'},
  body:JSON.stringify({sql,params}),signal:AbortSignal.timeout(18000)});
 if(!r.ok)throw Error('LEGACY_D1_HTTP_'+r.status);
 const doc=await r.json();
 const item=doc?.result?.[0];
 if(doc?.success!==true||item?.success!==true)
  throw Error('LEGACY_D1_RESULT_UNVERIFIED');
 if(write){
  const n=Number(item.meta?.changes);
  if(!Number.isSafeInteger(n)||n<0)throw Error('LEGACY_D1_WRITE_UNVERIFIED');
  return n;
 }
 if(!Array.isArray(item.results)||item.results.length>50)
  throw Error('LEGACY_D1_READ_UNVERIFIED');
 return item.results;
}
async function reserveOne(){
 // D1 atomic daily global gate shared with production Cloudflare Cron collector.
 // A separate 300-credit historical allocation prevents archival replay starving
 // the 288/day x 30-credit live source scans (~8,640/day).
 await query('INSERT OR IGNORE INTO goget_legacy_rpc_replay_budget(day,reserved_credits) VALUES(?,0)',
  [day],{write:true});
 await query('INSERT OR IGNORE INTO goget_rpc_source_budget(day,reserved_credits) VALUES(?,0)',
  [day],{write:true});
 const n=await query(
  'UPDATE goget_rpc_source_budget SET reserved_credits=reserved_credits+?'+
  ' WHERE day=? AND reserved_credits+?<=?'+
  ' AND reserved_credits+?+COALESCE((SELECT observed_deliveries'+
  ' FROM smart_wallet_webhook_credit_estimates WHERE day=?),0)<=?'+
  ' AND COALESCE((SELECT reserved_credits FROM goget_legacy_rpc_replay_budget WHERE day=?),0)+?<=?'+
  " AND EXISTS(SELECT 1 FROM smart_wallet_webhook_control WHERE id='owned' AND state='ARMED')",
  [L.creditsPerCall,day,L.creditsPerCall,L.sharedDailyRpcCredits,
   L.creditsPerCall,day,L.combinedLocalCredits,day,
   L.creditsPerCall,L.dayHistoricalCredits],{write:true});
 if(n!==1)return false;
 const booked=await query('UPDATE goget_legacy_rpc_replay_budget'+
   ' SET reserved_credits=reserved_credits+? WHERE day=?'+
   ' AND reserved_credits+?<=?',
   [L.creditsPerCall,day,L.creditsPerCall,L.dayHistoricalCredits],{write:true});
 if(booked!==1)throw Error('LEGACY_REPLAY_DAILY_LATCH_UNVERIFIED');
 reserved+=L.creditsPerCall;
 return true;
}
async function fetchPage(wallet,before){
 if(rpcCalls>=L.maxCallsPerRun)throw Error('LEGACY_CALL_BUDGET_EXHAUSTED');
 const delay=Date.now()-lastRpcAt;
 if(lastRpcAt&&delay<1000)await sleep(1000-delay);
 lastRpcAt=Date.now();rpcCalls++;
 const r=await fetch(rpcUrl,{method:'POST',headers:{'content-type':'application/json'},
   body:JSON.stringify({jsonrpc:'2.0',id:rpcCalls,
    method:'getSignaturesForAddress',
    params:[wallet,{limit:L.pageSize,commitment:'confirmed',before}]}),
   signal:AbortSignal.timeout(20000)});
 if(!r.ok)throw Error('LEGACY_RPC_HTTP_'+r.status);
 const size=Number(r.headers.get('content-length'));
 if(Number.isFinite(size)&&size>L.sourceMaxBytes)throw Error('LEGACY_RPC_PAGE_OVERSIZE');
 const raw=await r.text();
 if(raw.length>L.sourceMaxBytes)throw Error('LEGACY_RPC_PAGE_OVERSIZE');
 let body;try{body=JSON.parse(raw);}catch{throw Error('LEGACY_RPC_INVALID_JSON');}
 if(body?.error||!Array.isArray(body?.result))throw Error('LEGACY_RPC_PROVIDER_REJECTED');
 return body.result;
}
async function persistRows(wallet,rows){
 let total=0;
 for(let i=0;i<rows.length;i+=L.insertChunk){
  const group=rows.slice(i,i+L.insertChunk);
  const sql='INSERT OR IGNORE INTO goget_legacy_rpc_replay_signatures'+
   '(wallet,signature,slot,block_time,failed,retrieved_at,provider) VALUES '+
   group.map(()=>'(?,?,?,?,?,?,?)').join(',');
  const args=group.flatMap(x=>[wallet,x.signature,x.slot,x.blockTime,x.failed,at(),L.archiveProvider]);
  const changes=await query(sql,args,{write:true});
  if(changes>group.length)throw Error('LEGACY_REPLAY_INSERT_COUNT_INVALID');
  total+=changes;
 }
 return total;
}
async function journalUpdate(wallet,previousBefore,delta,kind,completed=false){
 const n=await query(
  'UPDATE goget_legacy_rpc_replay_journal SET before_signature=?,last_slot=?,'+
  ' pages=pages+?,examined=examined+?,inserted=inserted+?,status=?,'+
  ' last_checked_at=?,completed_at=? WHERE wallet=?'+
  ' AND COALESCE(before_signature,\'\')=COALESCE(?,\'\')',
  [delta.nextBefore??previousBefore,delta.lastSlot??null,delta.pages??0,
   delta.examined??0,delta.inserted??0,kind,at(),completed?at():null,
   wallet,previousBefore],{write:true});
 if(n!==1)throw Error('LEGACY_JOURNAL_CURSOR_ADVANCE_UNVERIFIED');
}
async function crossSource(wallet){
 const sql=[
  'SELECT',
  '(SELECT COUNT(*) FROM goget_legacy_rpc_replay_signatures WHERE wallet=?) AS recovered,',
  '(SELECT COUNT(*) FROM goget_legacy_rpc_replay_signatures x',
  ' JOIN smart_wallet_live_events l ON l.wallet=x.wallet AND l.signature=x.signature',
  ' WHERE x.wallet=?) AS exactLegacyLiveOverlap,',
  '(SELECT COUNT(*) FROM goget_legacy_rpc_replay_signatures x',
  ' JOIN smart_wallet_helius_historical_replay h ON h.wallet=x.wallet AND h.signature=x.signature',
  ' WHERE x.wallet=?) AS exactHistoricalReplayOverlap,',
  '(SELECT COUNT(*) FROM goget_legacy_rpc_replay_signatures x',
  ' JOIN goget_rpc_source_signatures n ON n.wallet=x.wallet AND n.signature=x.signature',
  ' WHERE x.wallet=?) AS exactNewCloudflareOverlap,',
  '(SELECT COUNT(*) FROM goget_legacy_rpc_replay_signatures x',
  ' JOIN goget_legacy_rpc_replay_journal j ON j.wallet=x.wallet AND j.legacy_cursor=x.signature',
  ' WHERE x.wallet=?) AS legacyAnchorArchived,',
  '(SELECT COUNT(*) FROM goget_rpc_source_signatures s',
  ' JOIN goget_legacy_rpc_replay_journal j ON j.wallet=s.wallet AND j.seed_head=s.signature',
  ' WHERE s.wallet=?) AS seedAnchorStillArchived'
 ].join(' ');
 const rows=await query(sql,Array(6).fill(wallet));
 if(rows.length!==1)throw Error('LEGACY_RECONCILE_QUERY_INVALID');
 const counts=rows[0],out={};
 for(const name of ['recovered','exactLegacyLiveOverlap','exactHistoricalReplayOverlap',
  'exactNewCloudflareOverlap','legacyAnchorArchived','seedAnchorStillArchived']){
  const n=Number(counts[name]);
  if(!Number.isSafeInteger(n)||n<0)throw Error('LEGACY_RECONCILE_COUNT_UNVERIFIED');
  out[name]=n;
 }
 return out;
}
async function oneWallet(scope){
 const wallet=scope.wallet,report={wallet,legacyCursorPreserved:true,
  sourceSeedPresent:true,pagesReadThisRun:0,sourceRowsExaminedThisRun:0,
  sourceNewRowsThisRun:0,creditsReservedThisRun:0,complete:false,status:'UNKNOWN',
  evidence:null};
 reports.push(report);
 const insert=await query('INSERT OR IGNORE INTO goget_legacy_rpc_replay_journal'+
  '(wallet,legacy_cursor,seed_head,status,last_checked_at) VALUES(?,?,?,?,?)',
  [wallet,scope.legacy_cursor,scope.seed_head,'NOT_STARTED',since],{write:true});
 if(insert>1)throw Error('LEGACY_REPLAY_JOURNAL_INSERT_INVALID');
 const current=await query('SELECT * FROM goget_legacy_rpc_replay_journal WHERE wallet=? LIMIT 1',[wallet]);
 if(current.length!==1)throw Error('LEGACY_REPLAY_JOURNAL_ABSENT');
 let state=verifiedJournal(current[0],{wallet,legacyCursor:scope.legacy_cursor,
  sourceHead:scope.seed_head});
 report.legacyCursor=state.legacyCursor;
 report.seedHead=state.seedHead;
 report.pagesPrior=state.pages;
 report.statusPrior=state.status;
 let localPages=0;
 if(state.blocked){report.status='SOURCE_EXHAUSTED_ANCHOR_MISSING';}
 else if(state.status==='COMPLETE_HELIUS_SIGNATURE_BRIDGE'){
  report.status='COMPLETE_HELIUS_SIGNATURE_BRIDGE';
 }else if(state.found){
  report.status='ANCHOR_FOUND_SOURCE_RECONCILE_PENDING';
 }else{
  while(localPages<L.maxPagesPerWalletPerRun&&rpcCalls<L.maxCallsPerRun){
   if(!await reserveOne()){
    report.status='INCOMPLETE_BUDGET';
    await journalUpdate(wallet,state.before,{pages:0,examined:0,inserted:0,
      nextBefore:state.before,lastSlot:state.lastSlot},report.status);
    break;
   }
   report.creditsReservedThisRun+=L.creditsPerCall;
   const before=state.before??state.seedHead;
   let entries;
   try{entries=await fetchPage(wallet,before);}
   catch(e){
    report.status='INCOMPLETE_PROVIDER';
    report.providerError=/^(LEGACY_RPC_[A-Z0-9_]+|LEGACY_RPC_HTTP_\d+)$/.test(e?.message||'')?
      e.message:'HELIUS_SOURCE_UNKNOWN_FAILURE';
    await journalUpdate(wallet,state.before,{pages:0,examined:0,inserted:0,
      nextBefore:state.before,lastSlot:state.lastSlot},report.status);
    break;
   }
   let page;
   try{page=validateReplaySourcePage(entries,{before,at:at(),priorLastSlot:state.lastSlot});}
   catch(e){
    report.status='INCOMPLETE_PROVIDER';report.providerError='HELIUS_PAGE_IDENTITY_REJECTED';
    await journalUpdate(wallet,state.before,{pages:0,examined:0,inserted:0,
      nextBefore:state.before,lastSlot:state.lastSlot},report.status);
    break;
   }
   const plan=planReplayPage(page,state.legacyCursor);
   if(plan.reachedSourceEnd){
    report.status='SOURCE_EXHAUSTED_ANCHOR_MISSING';
    await journalUpdate(wallet,state.before,{pages:1,examined:0,inserted:0,
      nextBefore:state.before,lastSlot:state.lastSlot},report.status);
    localPages++;report.pagesReadThisRun++;
    break;
   }
   const saved=await persistRows(wallet,plan.archived);
   localPages++;report.pagesReadThisRun++;
   report.sourceRowsExaminedThisRun+=plan.archived.length;
   report.sourceNewRowsThisRun+=saved;
   const next=plan.foundOldAnchor?'ANCHOR_FOUND_SOURCE_RECONCILE_PENDING':
     plan.shortPage?'INCOMPLETE_SHORT_PAGE':'INCOMPLETE_PAGE_CAP';
   // Journal cursor advances ONLY after every individual D1 insert succeeded.
   await journalUpdate(wallet,state.before,{pages:1,examined:plan.archived.length,
     inserted:saved,nextBefore:plan.nextBefore,lastSlot:plan.nextLastSlot},next);
   state={...state,before:plan.nextBefore,lastSlot:plan.nextLastSlot,
     pages:state.pages+1,examined:state.examined+plan.archived.length,
     inserted:state.inserted+saved,status:next};
   report.status=next;
   if(plan.foundOldAnchor)break;
  }
 }
 report.evidence=await crossSource(wallet);
 const anchored=report.evidence.legacyAnchorArchived===1&&
  report.evidence.seedAnchorStillArchived===1;
 if(report.status==='ANCHOR_FOUND_SOURCE_RECONCILE_PENDING'&&anchored){
  await journalUpdate(wallet,state.before,{pages:0,examined:0,inserted:0,
   nextBefore:state.before,lastSlot:state.lastSlot},'COMPLETE_HELIUS_SIGNATURE_BRIDGE',true);
  report.status='COMPLETE_HELIUS_SIGNATURE_BRIDGE';
 }
 if(report.status==='COMPLETE_HELIUS_SIGNATURE_BRIDGE'&&!anchored)
  throw Error('LEGACY_RECONCILE_ANCHORS_UNVERIFIED');
 report.complete=report.status==='COMPLETE_HELIUS_SIGNATURE_BRIDGE';
 report.unresolved=report.complete?null:report.status;
 report.pagesTotalAtLastRead=state.pages;
 report.oldCursorNotMutated=true;
 console.log('GOGET_LEGACY_REPLAY_WALLET',JSON.stringify(report));
 return report;
}
async function run(){
 try{
  const stop=Date.parse(L.stopUtc);
  if(Date.now()>=stop)throw Error('LEGACY_REPLAY_PILOT_EXPIRED');
  const cohort=JSON.parse(await readFile('research/smart-wallet-live-cohort.json','utf8'));
  validateExactReplayRoster(cohort,GAP_WALLETS);
  const originals=await query(
   'SELECT l.wallet,l.last_signature AS legacy_cursor,l.status AS legacy_status,'+
   ' s.head_signature AS seed_head FROM smart_wallet_live_cursors l'+
   ' JOIN goget_rpc_source_wallets s ON s.wallet=l.wallet'+
   ' WHERE l.wallet IN (?,?,?) ORDER BY l.wallet',
   GAP_WALLETS);
  if(originals.length!==3||new Set(originals.map(x=>x.wallet)).size!==3||
   originals.some(x=>!GAP_WALLETS.includes(x.wallet)||
    x.legacy_status!=='SOURCE_GAP_UNRESOLVED'))
    throw Error('LEGACY_ORIGINAL_THREE_CURSORS_NOT_VERIFIED');
  const map=new Map(originals.map(x=>[x.wallet,x]));
  for(const wallet of GAP_WALLETS){
   if(!map.get(wallet)?.legacy_cursor||!map.get(wallet)?.seed_head)
    throw Error('LEGACY_CHECKPOINT_ANCHOR_ABSENT');
  }
  await query('INSERT INTO goget_legacy_rpc_replay_runs'+
   '(run_id,started_at,status,all_wallets_planned) VALUES(?,?,?,?)',
   [runId,since,'RUNNING',GAP_WALLETS.length],{write:true});
  for(const wallet of GAP_WALLETS){
   try{await oneWallet(map.get(wallet));}
   catch(e){
    const exists=reports.find(x=>x.wallet===wallet);
    if(exists){exists.status='FAILED';exists.unresolved='SOURCE_OR_STORAGE_UNVERIFIED';}
    else reports.push({wallet,status:'FAILED',complete:false,
      unresolved:'SOURCE_OR_STORAGE_UNVERIFIED'});
    failures.push({wallet,code:/^(LEGACY_[A-Z0-9_]+)$/.test(e?.message||'')?
     e.message:'SOURCE_OR_STORAGE_UNVERIFIED'});
   }
  }
  mainReport.completedWallets=reports.filter(x=>x.complete).length;
  mainReport.status=mainReport.completedWallets===3&&failures.length===0?
    'COMPLETE_ALL_THREE_HELIUS_SIGNATURE_BRIDGES':
    'PARTIAL_WITH_EXPLICIT_UNRESOLVED_WALLETS';
 }catch(e){
  failures.push({code:/^(LEGACY_[A-Z0-9_]+|MISSING_[A-Z_]+)$/.test(e?.message||'')?
    e.message:'INITIAL_SOURCE_GATE_UNVERIFIED'});
  mainReport.status='FAILED_PRECONDITION_NO_COMPLETE_COVERAGE_CLAIM';
 }
 mainReport.finishedAt=at();mainReport.sourceCallsAttempted=rpcCalls;
 mainReport.estimatedCreditsReserved=reserved;mainReport.d1Calls=d1Calls;
 mainReport.storedNewSignatures=reports.reduce((n,x)=>n+(x.sourceNewRowsThisRun??0),0);
 mainReport.checkedSourceSignatures=reports.reduce((n,x)=>n+(x.sourceRowsExaminedThisRun??0),0);
 mainReport.coverageComplete=mainReport.status==='COMPLETE_ALL_THREE_HELIUS_SIGNATURE_BRIDGES';
 // Results of a bounded incomplete run are useful and persisted; a green job
 // is never a claim of full coverage. A failed precondition is a failed job.
 try{
  await query('UPDATE goget_legacy_rpc_replay_runs SET finished_at=?,status=?,'+
   'all_wallets_complete=?,rpc_calls=?,credits_reserved=?,checked_rows=?,'+
   'new_rows=?,summary_json=? WHERE run_id=?',
   [mainReport.finishedAt,mainReport.status,mainReport.completedWallets,rpcCalls,
    reserved,mainReport.checkedSourceSignatures,mainReport.storedNewSignatures,
    JSON.stringify({...mainReport,wallets:reports}).slice(0,16000),runId],{write:true});
 }catch{failures.push({code:'RUN_JOURNAL_FINISH_UNVERIFIED'});process.exitCode=1;}
 await writeFile('goget-legacy-gap-repair-report.json',JSON.stringify(mainReport,null,2)+'\n');
 console.log('GOGET_LEGACY_GAP_REPAIR',JSON.stringify(mainReport));
 if(mainReport.status==='FAILED_PRECONDITION_NO_COMPLETE_COVERAGE_CLAIM'||failures.length)
  process.exitCode=1;
}
run().catch(e=>{console.error('GOGET_LEGACY_REPLAY_FATAL',
  /^(LEGACY_[A-Z0-9_]+|MISSING_[A-Z_]+)$/.test(e?.message||'')?
    e.message:'SOURCE_OR_STORAGE_UNVERIFIED');process.exitCode=1;});
