#!/usr/bin/env node
// Bounded read-only historical Helius source, writes only independent
// indicative native SOL/token forensic evidence. No USD price reconstruction.
import {readFile,writeFile} from 'node:fs/promises';
import {inferExactCounterpartyNativeRatio} from '../src/goget-historical-native-ratio.mjs';
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
  "SELECT a.mint,a.bucket,a.horizon_min,a.due_at,a.pool,a.signatures_json FROM goget_historical_pool_activity_audit a LEFT JOIN goget_historical_native_ratio_audit n ON n.mint=a.mint AND n.bucket=a.bucket AND n.horizon_min=a.horizon_min WHERE a.classification='HELIUS_LABELED_SWAP_POOL_AND_MINT_HINT' AND n.mint IS NULL ORDER BY a.due_at ASC LIMIT 8")).results;
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
 const insert="INSERT OR IGNORE INTO goget_historical_native_ratio_audit(mint,bucket,horizon_min,due_at,pool,status,tx_signature,tx_block_time,direction,sol_per_token,wsol_flow,token_flow,source,as_of,usd_price_reconstructed) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)";
 for(const a of rows){
  if(!address.test(a.pool)||!address.test(a.mint)||!Number.isFinite(Date.parse(a.due_at)))
   throw Error('INVALID_EXACT_ANCHOR');
  const sigs=JSON.parse(a.signatures_json||'[]').map(x=>x.signature);
  if(!sigs.length||sigs.length>3||!sigs.every(s=>signature.test(s)))
   throw Error('UNVERIFIED_SOURCE_SIGNATURE');
  let results=[],before=null,error=null;
  const due=Date.parse(a.due_at),until=due+10*60000;
  // At most two source pages, never substitute a transaction from a different
  // pool, mint or timestamp. No event is re-labelled as a historic USD price.
  for(let page=0;page<2;page++){
   if(calls>=8){error='HELIUS_CALL_LIMIT';break;}
   if(calls)await sleep(1700);
   const u=new URL('https://api-mainnet.helius-rpc.com/v0/addresses/'+encodeURIComponent(a.pool)+'/transactions');
   for(const [k,v] of Object.entries({'api-key':helius,limit:'100',
      'gte-time':String(Math.floor(due/1000)),
      'lte-time':String(Math.ceil(until/1000)),
      ...(before?{'before-signature':before}:{})}))u.searchParams.set(k,v);
   calls++;
   try{
    const response=await fetch(u,{headers:{accept:'application/json'},
      signal:AbortSignal.timeout(16000)});
    if(!response.ok){error='HELIUS_HTTP_'+response.status;break;}
    const payload=await response.text();
    if(payload.length>900000){error='SOURCE_TOO_LARGE';break;}
    const items=JSON.parse(payload);
    if(!Array.isArray(items)||items.length>100){error='SOURCE_INVALID';break;}
    results.push(...items);
    if(sigs.every(s=>results.some(x=>x.signature===s))||!items.length)break;
    const cursor=items.at(-1)?.signature;
    if(!signature.test(cursor||'')||cursor===before){error='PAGINATION_UNVERIFIED';break;}
    before=cursor;
   }catch{error='SOURCE_UNAVAILABLE';break;}
  }
  const matching=results.filter(t=>sigs.includes(t.signature)&&t.timestamp*1000>=due&&t.timestamp*1000<=until);
  const candidates=matching.map(tx=>inferExactCounterpartyNativeRatio(tx,{pool:a.pool,mint:a.mint}));
  // Do not use the best of several possible rates as if it were unique.
  const clean=candidates.filter(x=>x.status==='HISTORIC_NATIVE_POOL_FLOW_RATIO_ONLY');
  const chosen=clean.length===1?clean[0]:null;
  const status=error?'SOURCE_INCOMPLETE':
   chosen?'HISTORIC_NATIVE_POOL_FLOW_RATIO_ONLY':
   candidates.length?'AMBIGUOUS_ENHANCED_SWAP_POOL_LEGS':'SIGNATURE_NOT_RECOVERED';
  const v=chosen;
  const res=await d1(insert,[a.mint,a.bucket,Number(a.horizon_min),
    a.due_at,a.pool,status,v?.signature??null,v?.blockTime??null,v?.side??null,
    v?.solPerToken??null,v?.wsolAmount??null,v?.tokenAmount??null,
    'HELIUS_ENHANCED_EXACT_POOL_COUNTERPARTY_LEGS',new Date().toISOString(),0]);
  const n=Number(res.meta?.changes);
  if(!Number.isSafeInteger(n)||n<0||n>1)throw Error('D1_WRITE_UNVERIFIED');
  writes++;report.d1WriteCalls=writes;
  if(chosen)report.nativeQuotesRecovered++;else report.ambiguousOrMissing++;
  report.items.push({mint:a.mint,pool:a.pool,dueAt:a.due_at,status,
    originalSignatures:sigs,nativeRatio:v?.solPerToken??null,
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
