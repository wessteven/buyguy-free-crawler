#!/usr/bin/env node
// One-shot read-only schema discovery for Helius Parsed Events, no price writes.
const required=k=>{const v=process.env[k];if(!v)throw Error('MISSING_'+k);return v;};
async function main(){
 const account=required('CF_ACCOUNT_ID'),db=required('CF_DATABASE_ID'),token=required('CF_D1_API_TOKEN'),
  helius=required('HELIUS_API_KEY');
 const url='https://api.cloudflare.com/client/v4/accounts/'+encodeURIComponent(account)+
  '/d1/database/'+encodeURIComponent(db)+'/query';
 const r=await fetch(url,{method:'POST',headers:{
  authorization:'Bearer '+token,'content-type':'application/json'},
  body:JSON.stringify({sql:"SELECT a.mint,a.pool,a.signatures_json FROM goget_historical_pool_activity_audit a JOIN goget_historical_native_ratio_audit n ON n.mint=a.mint AND n.bucket=a.bucket AND n.horizon_min=a.horizon_min WHERE n.status='SOURCE_INCOMPLETE' AND a.classification='HELIUS_LABELED_SWAP_POOL_AND_MINT_HINT' ORDER BY a.due_at LIMIT 1",params:[]}),
  signal:AbortSignal.timeout(16000)});
 if(!r.ok)throw Error('D1_SOURCE_HTTP_'+r.status);
 const body=await r.json();
 if(body?.success!==true||body?.result?.[0]?.success!==true||
    !Array.isArray(body.result[0].results))throw Error('D1_UNVERIFIED');
 const row=body.result[0].results[0];
 if(!row)throw Error('NO_INCOMPLETE_RATIO_ROW');
 const signatures=JSON.parse(row.signatures_json).map(x=>x.signature);
 const sig=/^[1-9A-HJ-NP-Za-km-z]{64,88}$/;
 if(signatures.length<1||signatures.length>3||!signatures.every(x=>sig.test(x)))
  throw Error('SOURCE_SIGNATURES_INVALID');
 const endpoint='https://mainnet.helius-rpc.com/v1/parsed-events/transactions?api-key='+
   encodeURIComponent(helius);
 const response=await fetch(endpoint,{method:'POST',headers:{
  'content-type':'application/json',accept:'application/json'},
  body:JSON.stringify({transactions:signatures}),signal:AbortSignal.timeout(16000)});
 if(!response.ok){
  console.log('GOGET_PARSED_SOURCE_PROBE',JSON.stringify({status:'HTTP_'+response.status,
   calls:1,d1Writes:0,signatures:signatures.length,heliusSourceVerified:false}));
  process.exitCode=1;return;
 }
 const payload=await response.text();
 if(payload.length>400000)throw Error('RESPONSE_TOO_LARGE');
 const parsed=JSON.parse(payload);
 const outer=Array.isArray(parsed)?parsed:
   Array.isArray(parsed?.data)?parsed.data:[];
 const first=outer[0]||{};
 const firstParsed=first?.parsed||{};
 // Deliberately do not log raw balance transfers or provider payloads.
 console.log('GOGET_PARSED_SOURCE_PROBE',JSON.stringify({
  status:'RESPONSE_SHAPE_OBSERVED',calls:1,d1Writes:0,
  signatures:signatures.length,resultRows:outer.length,
  outerShape:Array.isArray(parsed)?'ARRAY':'OBJECT',
  envelopeKeys:!Array.isArray(parsed)?Object.keys(parsed).slice(0,12):[],
  firstResultKeys:Object.keys(first).slice(0,18),
  parserStatus:first.parserStatus||first.parser_status||null,
  parsedKeys:Object.keys(firstParsed).slice(0,25),
  transferKeys:Object.keys(firstParsed.transfers||{}).slice(0,20),
  summaryKeys:Object.keys(firstParsed.summary||{}).slice(0,12),
  arrayFields:Object.entries(firstParsed).filter(([k,v])=>Array.isArray(v))
   .slice(0,12).map(([k,v])=>({field:k,items:v.length,
     firstKeys:Object.keys(v[0]||{}).slice(0,14)})),
  noForwardPriceWrites:true}));
}
main().catch(e=>{
 console.error('GOGET_PARSED_SOURCE_PROBE_FAILED',
  /^D1_SOURCE_HTTP_\d+$/.test(e?.message||'')?e.message:'UNVERIFIED');
 process.exitCode=1;
});
