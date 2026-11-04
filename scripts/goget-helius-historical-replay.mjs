#!/usr/bin/env node
// Bounded Helius historical reconstruction for the 3 known incomplete polling cursors.
// Preserves original chain timestamps. NEVER edits live webhook rows, cursors or price labels.
import {readFile,writeFile} from 'node:fs/promises';
const WATCHED=[
  '8LJWz8uW51u6kL2XBZ6cKYBngnXCpxQjUZRbwKLfVYp4',
  'whamNNP9tHoxLg92yHvJPdYhghEoCg1qYTsh5a2oLbx',
  '7naFFwuEJWeWwWYQUkgAWHsxYKg3KctEuUj42JdAMidP'
];
const WINDOW=Object.freeze({
 from:'2026-11-01T05:20:00.000Z',to:'2026-11-03T08:55:00.000Z',
 maxPagesPerWallet:8,maxTotalHeliusCalls:24,maxD1Queries:520,
 maxResultsPerPage:100,maxSourceChars:18000
});
const required=k=>{const v=process.env[k];if(!v)throw Error('MISSING_'+k);return v;};
const addr=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/,sig=/^[1-9A-HJ-NP-Za-km-z]{64,88}$/;
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function evidence(tx,wallet){
 const src={schema:'HELIUS_HISTORICAL_REPLAY_V1',signature:tx.signature,
   timestamp:tx.timestamp,slot:tx.slot,type:String(tx.type||'UNKNOWN').slice(0,80),
   source:String(tx.source||'UNKNOWN').slice(0,80),
   feePayer:typeof tx.feePayer==='string'?tx.feePayer:null,
   wallet,transactionError:tx.transactionError??null,
   tokenTransfers:(Array.isArray(tx.tokenTransfers)?tx.tokenTransfers:[]).slice(0,20),
   nativeTransfers:(Array.isArray(tx.nativeTransfers)?tx.nativeTransfers:[]).slice(0,10),
   accountData:(Array.isArray(tx.accountData)?tx.accountData:[]).slice(0,16),
   caveat:'HISTORICAL_ENHANCED_PARSE_NO_VERIFIED_BUY_OR_EXECUTABLE_PNL'};
 let value=JSON.stringify(src);
 if(value.length>WINDOW.maxSourceChars){
  src.accountData=src.accountData.slice(0,4);src.tokenTransfers=src.tokenTransfers.slice(0,10);
  src.nativeTransfers=src.nativeTransfers.slice(0,5);src.sourceTruncated=true;
  value=JSON.stringify(src);
 }
 if(value.length>WINDOW.maxSourceChars){
  src.accountData=[];src.tokenTransfers=src.tokenTransfers.slice(0,4);
  src.nativeTransfers=[];src.sourceTruncated=true;value=JSON.stringify(src);
 }
 if(value.length>WINDOW.maxSourceChars)throw Error('SOURCE_TOO_LARGE');
 return value;
}
async function main(){
 const helius=required('HELIUS_API_KEY'),account=required('CF_ACCOUNT_ID'),
   database=required('CF_DATABASE_ID'),token=required('CF_D1_API_TOKEN');
 const endpoint='https://api.cloudflare.com/client/v4/accounts/'+encodeURIComponent(account)+
  '/d1/database/'+encodeURIComponent(database)+'/query';
 let calls=0,dbCalls=0,lastHelius=0;
 const d1=async(sql,params=[])=>{
  if(++dbCalls>WINDOW.maxD1Queries)throw Error('D1_BUDGET');
  const r=await fetch(endpoint,{method:'POST',headers:{authorization:'Bearer '+token,
   'content-type':'application/json'},body:JSON.stringify({sql,params}),
   signal:AbortSignal.timeout(18000)});
  if(!r.ok)throw Error('D1_HTTP_'+r.status);
  const j=await r.json();
  if(j?.success!==true||j?.result?.[0]?.success!==true||
    !Array.isArray(j?.result?.[0]?.results))throw Error('D1_READ_OR_WRITE_UNVERIFIED');
  return j.result[0];
 };
 const raw=await readFile('sql/smart-wallet-helius-historical-replay.sql','utf8');
 const sql=raw.split('\n').filter(l=>!l.trim().startsWith('--')).join('\n');
 for(const stmt of sql.split(';').map(x=>x.trim()).filter(Boolean))await d1(stmt);
 const report={at:new Date().toISOString(),mode:'HELIUS_HISTORICAL_SOURCE_ONLY',
   originalWindow:WINDOW,heliusCalls:0,estimatedProviderCreditsUpperBound:2640,
   d1Writes:0,storedNew:0,sourceRowsExamined:0,
   replayWallets:[],failedWallets:[],windowCoverageComplete:false,
   noLiveWebhookWrites:true,noLiveCursorChanges:true,trades:0,
   note:'Enhanced history queries can be incomplete due to bounded pagination, provider filtering and historical parse; replay uses original block time, not event receipt time.'};
 const seen=new Set();
 const fromUnix=Date.parse(WINDOW.from)/1000,toUnix=Date.parse(WINDOW.to)/1000;
 const heliusPage=async(wallet,before)=>{
  if(calls>=WINDOW.maxTotalHeliusCalls)return {error:'HELIUS_CALL_BUDGET'};
  const u=new URL('https://api-mainnet.helius-rpc.com/v0/addresses/'+encodeURIComponent(wallet)+'/transactions');
  for(const [k,v] of Object.entries({'api-key':helius,limit:String(WINDOW.maxResultsPerPage),
   'gte-time':String(fromUnix),'lte-time':String(toUnix),
   ...(before?{'before-signature':before}:{})}))u.searchParams.set(k,v);
  for(let attempt=0;attempt<2;attempt++){
   if(calls>=WINDOW.maxTotalHeliusCalls)return {error:'HELIUS_CALL_BUDGET'};
   const delay=Math.max(0,1200-(Date.now()-lastHelius));if(delay)await wait(delay);
   lastHelius=Date.now();calls++;
   try{
    const response=await fetch(u,{headers:{accept:'application/json'},
     signal:AbortSignal.timeout(20000)});
    if(response.status===429&&attempt===0){await wait(9000);continue;}
    if(!response.ok)return {error:'HELIUS_HTTP_'+response.status};
    const value=await response.json();
    if(!Array.isArray(value)||value.length>WINDOW.maxResultsPerPage)
      return {error:'HELIUS_HISTORY_INVALID_SHAPE'};
    return {items:value};
   }catch{return {error:'HELIUS_REQUEST_FAILED'};}
  }
  return {error:'HELIUS_RATE_LIMITED'};
 };
 const insert="INSERT OR IGNORE INTO smart_wallet_helius_historical_replay(wallet,signature,slot,block_time,tx_type,tx_source,fee_payer,historical_evidence_json,retrieved_at,provider) VALUES";
 for(const wallet of WATCHED){
  const state={wallet,pages:0,rowsFetched:0,inserted:0,duplicates:0,
   newestBlockTime:null,oldestBlockTime:null,providerError:null,
   lowerBoundReached:false,complete:false};
  let before=null;
  for(let page=0;page<WINDOW.maxPagesPerWallet;page++){
   const response=await heliusPage(wallet,before);
   if(response.error){state.providerError=response.error;break;}
   const items=response.items;state.pages++;
   if(items.length===0){state.lowerBoundReached=true;state.complete=true;break;}
   state.rowsFetched+=items.length;report.sourceRowsExamined+=items.length;
   const prepared=[];
   let boundsError=false;
   for(const t of items){
    if(!sig.test(t?.signature||'')||!Number.isSafeInteger(t?.slot)||t.slot<=0||
       !Number.isSafeInteger(t?.timestamp)){
      boundsError=true;break;
    }
    if(t.timestamp<fromUnix||t.timestamp>toUnix){boundsError=true;break;}
    const when=new Date(t.timestamp*1000).toISOString();
    if(state.newestBlockTime===null||when>state.newestBlockTime)state.newestBlockTime=when;
    if(state.oldestBlockTime===null||when<state.oldestBlockTime)state.oldestBlockTime=when;
    const k=wallet+':'+t.signature;
    if(seen.has(k))continue;
    seen.add(k);
    const source=evidence(t,wallet);
    prepared.push([wallet,t.signature,t.slot,when,
      String(t.type||'UNKNOWN').slice(0,80),String(t.source||'UNKNOWN').slice(0,80),
      addr.test(t.feePayer||'')?t.feePayer:null,source,new Date().toISOString(),
      'HELIUS_ENHANCED_HISTORY_RECONSTRUCTION']);
   }
   if(boundsError){state.providerError='HELIUS_TIME_FILTER_OR_TRANSACTION_UNVERIFIED';break;}
   for(let i=0;i<prepared.length;i+=5){
    const chunk=prepared.slice(i,i+5);
    const placeholders=chunk.map(()=>'(?,?,?,?,?,?,?,?,?,?)').join(',');
    const result=await d1(insert+placeholders,chunk.flat());
    const n=Number(result.meta?.changes);
    if(!Number.isSafeInteger(n)||n<0||n>chunk.length)
      throw Error('D1_INSERT_UNVERIFIED');
    report.d1Writes++;state.inserted+=n;state.duplicates+=chunk.length-n;
    report.storedNew+=n;
   }
   const last=items.at(-1)?.signature;
   if(!sig.test(last||'')||last===before){state.providerError='PAGINATION_CURSOR_STALLED';break;}
   before=last;
   // An undersized filtered page does not by itself prove no more history;
   // only a subsequent empty page can establish completion.
  }
  if(!state.complete&&!state.providerError)state.providerError='BOUNDED_PAGE_CAP_REACHED';
  report.replayWallets.push(state);
  if(state.providerError)report.failedWallets.push({wallet,error:state.providerError});
  console.log('GOGET_HELIUS_HISTORICAL_WALLET',JSON.stringify(state));
 }
 report.heliusCalls=calls;report.windowCoverageComplete=report.replayWallets.every(x=>x.complete);
 report.replayMethod='GET_V0_ADDRESS_ENHANCED_TRANSACTIONS_TIME_FILTERED';
 // Reconcile exact identities without changing either canonical live event table.
 const comparison=await d1(
  "SELECT COUNT(*) AS history_rows,COALESCE(SUM(CASE WHEN live.signature IS NULL THEN 1 ELSE 0 END),0) AS missing_from_live,COALESCE(SUM(CASE WHEN live.signature IS NOT NULL THEN 1 ELSE 0 END),0) AS already_present_live FROM smart_wallet_helius_historical_replay h LEFT JOIN smart_wallet_webhook_events live ON live.wallet=h.wallet AND live.signature=h.signature WHERE h.block_time>=? AND h.block_time<=?",
  [WINDOW.from,WINDOW.to]);
 report.reconciliation=comparison.results[0]||null;
 await writeFile('goget-helius-historical-replay.json',JSON.stringify(report,null,2)+'\n');
 console.log('GOGET_HELIUS_HISTORICAL_REPLAY',JSON.stringify(report));
}
main().catch(e=>{
 const allowed=/^(?:MISSING_[A-Z_]+|D1_HTTP_\d+|D1_BUDGET|D1_INSERT_UNVERIFIED|D1_READ_OR_WRITE_UNVERIFIED|SOURCE_TOO_LARGE)$/;
 console.error('GOGET_HELIUS_HISTORICAL_REPLAY_FAILED',
  allowed.test(e?.message||'')?e.message:'HISTORICAL_REPLAY_UNVERIFIED');
 process.exitCode=1;
});
