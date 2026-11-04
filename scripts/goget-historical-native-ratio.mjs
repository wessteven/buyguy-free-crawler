#!/usr/bin/env node
// Bounded read-only historical Helius source, writes only independent
// indicative native SOL/token forensic evidence. No USD price reconstruction.
import {readFile,writeFile} from 'node:fs/promises';
import {inferExactCounterpartyNativeRatio} from '../src/goget-historical-native-ratio.mjs';
import {normalizeParsedEventForNativeRatio} from '../src/goget-parsed-events-adapter.mjs';
const required=k=>{const v=process.env[k];if(!v)throw Error('MISSING_'+k);return v;};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function main(){
 const account=required('CF_ACCOUNT_ID'),db=required('CF_DATABASE_ID'),
  token=required('CF_D1_API_TOKEN'),helius=required('HELIUS_API_KEY');
 const d1url='https://api.cloudflare.com/client/v4/accounts/'+encodeURIComponent(account)+
  '/d1/database/'+encodeURIComponent(db)+'/query';
 let reads=0,writes=0,calls=0;
 async function d1(sql,params=[]){
  if(++reads>14)throw Error('D1_BUDGET_EXCEEDED');
  const r=await fetch(d1url,{method:'POST',headers:{
   authorization:'Bearer '+token,'content-type':'application/json'},
   body:JSON.stringify({sql,params}),signal:AbortSignal.timeout(15000)});
  if(!r.ok)throw Error('D1_HTTP_'+r.status);
  const v=await r.json();
  if(v?.success!==true||v?.result?.[0]?.success!==true||!Array.isArray(v.result[0].results))
   throw Error('D1_RESPONSE_UNVERIFIED');
  return v.result[0];
 }
 const schema=(await readFile('sql/goget-historical-native-ratio.sql','utf8'))
  .split('\n').filter(x=>!x.trim().startsWith('--')).join('\n')
  .split(';').map(x=>x.trim()).filter(Boolean);
 for(const stmt of schema){await d1(stmt);writes++;}
 const rows=(await d1(
  "SELECT a.mint,a.bucket,a.horizon_min,a.due_at,a.pool,a.signatures_json FROM goget_historical_pool_activity_audit a LEFT JOIN goget_historical_native_ratio_audit n ON n.mint=a.mint AND n.bucket=a.bucket AND n.horizon_min=a.horizon_min WHERE a.classification='HELIUS_LABELED_SWAP_POOL_AND_MINT_HINT' AND (n.mint IS NULL OR n.status='SOURCE_INCOMPLETE') ORDER BY a.due_at ASC LIMIT 8")).results;
 const report={at:new Date().toISOString(),mode:'HELIUS_EXACT_POOL_NATIVE_SWAP_RATIO_ONLY',
   originalCandidateWindows:rows.length,heliusCalls:0,maxHeliusCalls:8,d1WriteCalls:0,
   nativeQuotesRecovered:0,ambiguousOrMissing:0,errors:{},items:[],
   forwardUsdOutcomesChanged:false,usdPricesReconstructed:0,trades:0,
   cautions:['Only same-counterparty WSOL/target mint pool legs count.',
    'Historical parsed transfer amounts may omit route fees; ratio is NOT pool mid or executable quote.',
    'SOL/USD at original block timestamp was NOT verified, so NO USD conversion is made.',
    'This is retrospective evidence, not a forward-observed signal.']};
 const address=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
 const signature=/^[1-9A-HJ-NP-Za-km-z]{64,88}$/;
 const insert="INSERT INTO goget_historical_native_ratio_audit(mint,bucket,horizon_min,due_at,pool,status,tx_signature,tx_block_time,direction,sol_per_token,wsol_flow,token_flow,source,as_of,usd_price_reconstructed) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(mint,bucket,horizon_min) DO UPDATE SET status=excluded.status,tx_signature=excluded.tx_signature,tx_block_time=excluded.tx_block_time,direction=excluded.direction,sol_per_token=excluded.sol_per_token,wsol_flow=excluded.wsol_flow,token_flow=excluded.token_flow,source=excluded.source,as_of=excluded.as_of WHERE goget_historical_native_ratio_audit.status='SOURCE_INCOMPLETE' AND excluded.status<>'SOURCE_INCOMPLETE'";
 for(const a of rows){
  if(!address.test(a.pool)||!address.test(a.mint)||!Number.isFinite(Date.parse(a.due_at)))
   throw Error('INVALID_EXACT_ANCHOR');
  const sigs=JSON.parse(a.signatures_json||'[]').map(x=>x.signature);
  if(!sigs.length||sigs.length>3||!sigs.every(s=>signature.test(s)))
   throw Error('UNVERIFIED_SOURCE_SIGNATURE');
  let results=[],error=null;
  const due=Date.parse(a.due_at),until=due+10*60000;
  // The source signatures are already exact and historically archived.
  // Fetch only those signatures, never re-scan hundreds of unrelated
  // busy-pool transactions or accept a different pool's data.
  if(calls>=8)error='HELIUS_CALL_LIMIT';
  else{
   if(calls)await sleep(1700);
   calls++;
   try{
    const url='https://mainnet.helius-rpc.com/v1/parsed-events/transactions?api-key='+encodeURIComponent(helius);
    const response=await fetch(url,{method:'POST',
      headers:{accept:'application/json','content-type':'application/json'},
      body:JSON.stringify({transactions:sigs}),signal:AbortSignal.timeout(16000)});
    if(!response.ok)error='HELIUS_HTTP_'+response.status;
    else{
      const payload=await response.text();
      if(payload.length>600000)error='SOURCE_TOO_LARGE';
      else{
        const items=JSON.parse(payload);
        if(!Array.isArray(items)||items.length>sigs.length||items.some(t=>
          !signature.test(t?.signature||'')||!sigs.includes(t.signature)||
          !Number.isSafeInteger(t?.parsed?.blockTime)||
          t.parsed.blockTime*1000<due||t.parsed.blockTime*1000>until))
          error='SOURCE_IDENTITY_UNVERIFIED';
        else results=items;
      }
    }
   }catch{error='SOURCE_UNAVAILABLE';}
  }
  const matching=results.filter(t=>sigs.includes(t.signature)&&
    t.parsed?.blockTime*1000>=due&&t.parsed?.blockTime*1000<=until);
  if(!error&&(matching.length!==sigs.length||new Set(matching.map(t=>t.signature)).size!==sigs.length))
    error='EXACT_SIGNATURE_COVERAGE_INCOMPLETE';
  if(!error&&matching.some(t=>t.parserStatus!=='OK'))
    error='PARSED_EVENT_STATUS_INCOMPLETE';
  const parsedResults=matching.map(tx=>normalizeParsedEventForNativeRatio(tx,{
    pool:a.pool,mint:a.mint,expectedSignature:tx.signature}));
  const candidates=parsedResults.map(x=>x.ok?
    inferExactCounterpartyNativeRatio(x.normalized,{pool:a.pool,mint:a.mint}):
    {status:x.reason,solPerToken:null});
  // Multiple swaps are possible within ten minutes. Use only the earliest
  // unambiguous direct pool-flow ratio, and never claim it was the first trade.
  // A missing exact source signature invalidates the entire batch.
  const clean=candidates.filter(x=>x.status==='HISTORIC_NATIVE_POOL_FLOW_RATIO_ONLY')
    .sort((x,y)=>x.blockTime.localeCompare(y.blockTime)||x.signature.localeCompare(y.signature));
  const chosen=!error&&clean.length?clean[0]:null;
  const status=error?'SOURCE_INCOMPLETE':
   chosen?'HISTORIC_NATIVE_POOL_FLOW_RATIO_ONLY':
   candidates.length?'NO_UNAMBIGUOUS_PARSED_EVENT_POOL_RATIO':'SIGNATURE_NOT_RECOVERED';
  const v=chosen;
  const res=await d1(insert,[a.mint,a.bucket,Number(a.horizon_min),
    a.due_at,a.pool,status,v?.signature??null,v?.blockTime??null,v?.side??null,
    v?.solPerToken??null,v?.wsolAmount??null,v?.tokenAmount??null,
    'HELIUS_PARSED_EVENTS_V1_EXACT_POOL_COUNTERPARTY_LEGS',new Date().toISOString(),0]);
  const n=Number(res.meta?.changes);
  if(!Number.isSafeInteger(n)||n<0||n>1)throw Error('D1_WRITE_UNVERIFIED');
  writes++;report.d1WriteCalls=writes;
  if(chosen)report.nativeQuotesRecovered++;else report.ambiguousOrMissing++;
  report.items.push({mint:a.mint,pool:a.pool,dueAt:a.due_at,status,
    originalSignatures:sigs,directRatioCandidates:clean.length,
    parseProblems:parsedResults.filter(x=>!x.ok).reduce((acc,x)=>{
      acc[x.reason]=(acc[x.reason]||0)+1;return acc;},{}),
    nativeRatio:v?.solPerToken??null,
    sourceSignature:v?.signature??null,side:v?.side??null,
    error,stored:n===1});
 }
 report.heliusCalls=calls;
 await writeFile('goget-historical-native-ratio.json',JSON.stringify(report,null,2)+'\n');
 console.log('GOGET_HISTORIC_NATIVE_RATIO',JSON.stringify(report));
}
main().catch(e=>{
 console.error('GOGET_HISTORIC_NATIVE_RATIO_ERROR',
   /^D1_HTTP_\d+$/.test(e?.message||'')?e.message:'SOURCE_OR_WRITE_UNVERIFIED');
 process.exitCode=1;
});
