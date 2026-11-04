#!/usr/bin/env node
// Isolated continuation of GOGET's Helius historical wallet replay.
// Never update webhook receipts, production polling cursors or USD price labels.
import {readFile,writeFile} from 'node:fs/promises';
import {GAP_WINDOW,GAP_WALLETS,planGapSlices,
 validateEnhancedPage,validateJournal} from '../src/goget-wallet-gap-wave.mjs';
const env=name=>{const x=process.env[name];if(!x)throw Error('MISSING_'+name);return x;};
const PUBKEY=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function archived(tx,wallet){
 const sample={schema:'HELIUS_HISTORICAL_GAP_WAVE_2',wallet,
  signature:tx.signature,slot:tx.slot,chainTimestamp:tx.timestamp,
  type:String(tx.type||'UNKNOWN').slice(0,80),
  source:String(tx.source||'UNKNOWN').slice(0,80),
  feePayer:PUBKEY.test(tx.feePayer||'')?tx.feePayer:null,
  transactionError:tx.transactionError??null,
  tokenTransfers:(Array.isArray(tx.tokenTransfers)?tx.tokenTransfers:[]).slice(0,20),
  nativeTransfers:(Array.isArray(tx.nativeTransfers)?tx.nativeTransfers:[]).slice(0,10),
  accountData:(Array.isArray(tx.accountData)?tx.accountData:[]).slice(0,16),
  warning:'RETROSPECTIVE_HELIUS_PARSE_NOT_AS_OF_DELIVERY_OR_CONFIRMED_TRADE'};
 let s=JSON.stringify(sample);
 if(s.length>GAP_WINDOW.maxStoredRawChars){
  sample.accountData=sample.accountData.slice(0,4);
  sample.tokenTransfers=sample.tokenTransfers.slice(0,10);
  sample.nativeTransfers=sample.nativeTransfers.slice(0,5);
  sample.truncated=true;
  s=JSON.stringify(sample);
 }
 if(s.length>GAP_WINDOW.maxStoredRawChars){
  sample.accountData=[];sample.nativeTransfers=[];
  sample.tokenTransfers=sample.tokenTransfers.slice(0,3);
  sample.truncated=true;s=JSON.stringify(sample);
 }
 if(s.length>GAP_WINDOW.maxStoredRawChars)throw Error('SOURCE_RECORD_OVERSIZE');
 return s;
}
async function main(){
 const helius=env('HELIUS_API_KEY'),account=env('CF_ACCOUNT_ID'),
  database=env('CF_DATABASE_ID'),token=env('CF_D1_API_TOKEN');
 const endpoint='https://api.cloudflare.com/client/v4/accounts/'+
  encodeURIComponent(account)+'/d1/database/'+encodeURIComponent(database)+'/query';
 let dbCalls=0,dbWrites=0,heliusCalls=0,lastCalled=0;
 const query=async(sql,params=[])=>{
  if(++dbCalls>GAP_WINDOW.maxD1Calls)throw Error('D1_CALL_LIMIT');
  const response=await fetch(endpoint,{method:'POST',headers:{
   authorization:'Bearer '+token,'content-type':'application/json'},
   body:JSON.stringify({sql,params}),signal:AbortSignal.timeout(17000)});
  if(!response.ok)throw Error('D1_HTTP_'+response.status);
  const payload=await response.json();
  if(payload?.success!==true||payload?.result?.[0]?.success!==true||
     !Array.isArray(payload.result[0].results))throw Error('D1_RESPONSE_UNVERIFIED');
  return payload.result[0];
 };
 const schema=(await readFile('sql/goget-helius-gap-wave.sql','utf8'))
  .split('\n').filter(x=>!x.trim().startsWith('--')).join('\n')
  .split(';').map(x=>x.trim()).filter(Boolean);
 for(const statement of schema){await query(statement);dbWrites++;}
 const chunks=planGapSlices();
 if(Date.parse(GAP_WINDOW.to)>Date.now()-15*60*1000)
   throw Error('HISTORICAL_WINDOW_NOT_YET_CLOSED');
 const windows=chunks.flatMap(w=>GAP_WALLETS.map(wallet=>({wallet,...w})));
 const report={asOf:new Date().toISOString(),
  mode:'READ_ONLY_ON_CHAIN_HISTORICAL_REPLAY_WAVE_2',
  window:{from:GAP_WINDOW.from,to:GAP_WINDOW.to},
  originalReplayEnd:'2026-11-03T08:55:00.000Z',
  wallets:GAP_WALLETS,plannedWindowWalletPairs:windows.length,
  completedWindowWalletPairs:0,incompleteWindowWalletPairs:0,
  deferredWindowWalletPairs:0,alreadyCompleteWindowPairs:0,
  heliusCalls:0,maxHeliusCalls:GAP_WINDOW.maxHeliusCalls,
  estimatedCreditsPlanningUpperBound:GAP_WINDOW.maxHeliusCalls*
   GAP_WINDOW.perRequestCreditPlanning,
  creditEstimateNotActualHeliusBilling:true,
  rowsFetched:0,newRowsStored:0,duplicates:0,d1Calls:0,d1Writes:0,
  status:'RUNNING',windowResults:[],
  providerErrors:{},noCursorMutations:true,noWebhookChanges:true,
  noForwardOutcomeChanges:true,trades:0,
  caveats:['Only Helius Enhanced source coverage can be marked complete by an empty page; this is not independently complete raw-chain coverage.',
   'Every gap partition is logged even when budget prevents scanning.',
   'A successful GitHub job does not mean every window is complete.',
   'Original transaction block times are preserved; no as-of wallet-profit inference.']};
 const journalSql='INSERT INTO smart_wallet_helius_gap_wave_coverage(wallet,window_start,window_end_exclusive,status,pages_read,examined,stored_new,last_signature,last_time,provider_error,checked_at) VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(wallet,window_start,window_end_exclusive) DO UPDATE SET status=excluded.status,pages_read=excluded.pages_read,examined=excluded.examined,stored_new=excluded.stored_new,last_signature=excluded.last_signature,last_time=excluded.last_time,provider_error=excluded.provider_error,checked_at=excluded.checked_at';
 const archiveInsert='INSERT OR IGNORE INTO smart_wallet_helius_historical_replay(wallet,signature,slot,block_time,tx_type,tx_source,fee_payer,historical_evidence_json,retrieved_at,provider) VALUES';
 const updateJournal=async(w,state,status,problem=null)=>{
  const r=await query(journalSql,[
   w.wallet,w.start,w.endExclusive,status,state.pages,
   state.processed,state.stored,state.cursor,state.lastTime,
   problem,new Date().toISOString()
  ]);
  const n=Number(r.meta?.changes);
  if(!Number.isSafeInteger(n)||n!==1)throw Error('COVERAGE_JOURNAL_WRITE_UNVERIFIED');
  dbWrites++;
 };
 const request=async(w,before)=>{
  if(heliusCalls>=GAP_WINDOW.maxHeliusCalls)return {error:'CALL_BUDGET_EXHAUSTED'};
  const elapsed=Date.now()-lastCalled;
  if(lastCalled&&elapsed<1300)await sleep(1300-elapsed);
  lastCalled=Date.now();heliusCalls++;
  const u=new URL('https://api-mainnet.helius-rpc.com/v0/addresses/'+
   encodeURIComponent(w.wallet)+'/transactions');
  const args={'api-key':helius,limit:String(GAP_WINDOW.pageSize),
   'gte-time':String(w.fromUnix),
   'lte-time':String(w.toUnixInclusive),
   ...(before?{'before-signature':before}:{})};
  for(const [k,v] of Object.entries(args))u.searchParams.set(k,v);
  try{
   const r=await fetch(u,{headers:{accept:'application/json'},
     signal:AbortSignal.timeout(19000)});
   if(!r.ok)return {error:'HELIUS_HTTP_'+r.status};
   const size=Number(r.headers.get('content-length'));
   if(size>GAP_WINDOW.maxSourceResponseBytes)return {error:'HELIUS_PAGE_TOO_LARGE'};
   const raw=await r.text();
   if(raw.length>GAP_WINDOW.maxSourceResponseBytes)return {error:'HELIUS_PAGE_TOO_LARGE'};
   return {items:JSON.parse(raw)};
  }catch{return {error:'HELIUS_FETCH_OR_JSON_FAILED'};}
 };
 for(const w of windows){
  const prior=(await query(
   'SELECT * FROM smart_wallet_helius_gap_wave_coverage WHERE wallet=? AND window_start=? AND window_end_exclusive=? LIMIT 1',
   [w.wallet,w.start,w.endExclusive])).results;
  if(prior.length>1)throw Error('COVERAGE_JOURNAL_UNVERIFIED');
  const state=validateJournal(prior[0]??null,w,w.wallet);
  if(state.complete){
   report.completedWindowWalletPairs++;report.alreadyCompleteWindowPairs++;
   report.windowResults.push({wallet:w.wallet,start:w.start,end:w.endExclusive,
    status:'COMPLETE_ENHANCED',alreadyComplete:true,pages:state.pages,
    examined:state.processed,inserted:state.stored});
   continue;
  }
  if(heliusCalls>=GAP_WINDOW.maxHeliusCalls){
   await updateJournal(w,state,'INCOMPLETE_BUDGET','GLOBAL_HELIUS_BUDGET');
   report.deferredWindowWalletPairs++;
   report.incompleteWindowWalletPairs++;
   report.windowResults.push({wallet:w.wallet,start:w.start,end:w.endExclusive,
    status:'INCOMPLETE_BUDGET',pages:state.pages,inserted:state.stored});
   continue;
  }
  let kind='INCOMPLETE_PAGE_CAP',failure=null;
  for(let page=0;page<GAP_WINDOW.maxPagesPerWalletWindow;page++){
   if(heliusCalls>=GAP_WINDOW.maxHeliusCalls){
    kind='INCOMPLETE_BUDGET';failure='GLOBAL_HELIUS_BUDGET';break;
   }
   const response=await request(w,state.cursor);
   if(response.error){kind='INCOMPLETE_PROVIDER';failure=response.error;break;}
   let validated;
   try{
    validated=validateEnhancedPage(response.items,{
     wallet:w.wallet,window:w,lastCursor:state.cursor,priorLastTime:state.lastTime});
   }catch{
    kind='INCOMPLETE_PROVIDER';failure='HELIUS_PAGE_IDENTITY_UNVERIFIED';break;
   }
   if(validated.isEmpty){
    kind='COMPLETE_ENHANCED';failure=null;break;
   }
   const items=response.items;
   for(let i=0;i<items.length;i+=5){
    const part=items.slice(i,i+5);
    const params=part.flatMap(t=>[
     w.wallet,t.signature,t.slot,new Date(t.timestamp*1000).toISOString(),
     String(t.type||'UNKNOWN').slice(0,80),
     String(t.source||'UNKNOWN').slice(0,80),
     PUBKEY.test(t.feePayer||'')?t.feePayer:null,
     archived(t,w.wallet),new Date().toISOString(),
     'HELIUS_ENHANCED_GAP_WAVE_2_HISTORICAL'
    ]);
    const sql=archiveInsert+part.map(()=>'(?,?,?,?,?,?,?,?,?,?)').join(',');
    const result=await query(sql,params);
    const count=Number(result.meta?.changes);
    if(!Number.isSafeInteger(count)||count<0||count>part.length)
     throw Error('HISTORICAL_D1_INSERT_UNVERIFIED');
    dbWrites++;state.stored+=count;state.processed+=part.length;
    report.newRowsStored+=count;report.duplicates+=part.length-count;
    report.rowsFetched+=part.length;
   }
   state.pages++;state.cursor=validated.nextCursor;
   state.lastTime=validated.nextLastTime;
   // Only advance the historical cursor after ALL five-at-a-time inserts
   // for that page succeeded. A retry will safely dedupe by signature.
   await updateJournal(w,state,'INCOMPLETE_PAGE_CAP','PAGING_IN_PROGRESS');
  }
  if(kind==='INCOMPLETE_PAGE_CAP')failure='PER_WINDOW_PAGE_LIMIT';
  await updateJournal(w,state,kind,failure);
  if(kind==='COMPLETE_ENHANCED')report.completedWindowWalletPairs++;
  else report.incompleteWindowWalletPairs++;
  if(failure)report.providerErrors[failure]=(report.providerErrors[failure]||0)+1;
  const item={wallet:w.wallet,start:w.start,end:w.endExclusive,status:kind,
   pages:state.pages,examined:state.processed,inserted:state.stored,
   oldestObservedBlockTime:state.lastTime===null?null:new Date(state.lastTime*1000).toISOString(),
   failure};
  report.windowResults.push(item);
  console.log('GOGET_HELIUS_GAP_WAVE_WINDOW',JSON.stringify(item));
 }
 const overview=(await query(
  'SELECT wallet,COUNT(*) AS n,MIN(block_time) AS first_at,MAX(block_time) AS last_at FROM smart_wallet_helius_historical_replay WHERE block_time>=? AND block_time<? GROUP BY wallet ORDER BY wallet',
  [GAP_WINDOW.from,GAP_WINDOW.to])).results;
 report.walletReconciliation=overview;
 report.heliusCalls=heliusCalls;report.d1Calls=dbCalls;report.d1Writes=dbWrites;
 report.windowCoverageComplete=report.completedWindowWalletPairs===windows.length;
 report.status=report.windowCoverageComplete?'ALL_SCANNED_WINDOWS_ENHANCED_COMPLETE':
  report.newRowsStored>0?'PARTIAL_SOURCE_RESTORED_EXPLICIT_GAPS':'INCOMPLETE_NO_NEW_SOURCE';
 await writeFile('goget-helius-gap-wave-2.json',JSON.stringify(report,null,2)+'\n');
 console.log('GOGET_HELIUS_GAP_WAVE_2',JSON.stringify(report));
 if(report.status==='INCOMPLETE_NO_NEW_SOURCE')process.exitCode=1;
}
main().catch(error=>{
 const safe=/^(?:MISSING_[A-Z_]+|D1_HTTP_\d+|D1_CALL_LIMIT|COVERAGE_JOURNAL_WRITE_UNVERIFIED|HISTORICAL_D1_INSERT_UNVERIFIED|JOURNAL_UNVERIFIED|GAP_SCOPE_INVALID)$/;
 console.error('GOGET_HELIUS_GAP_WAVE_FAILED',
  safe.test(error?.message||'')?error.message:'SOURCE_OR_PERSISTENCE_UNVERIFIED');
 process.exitCode=1;
});
