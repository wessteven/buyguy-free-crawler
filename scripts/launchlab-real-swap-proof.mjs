// Opt-in real swap proof, never production.
import {decodeLaunchlabSwapTransaction} from '../src/launchlab-raw-swap-research.mjs';
const key=process.env.HELIUS_API_KEY,signature=process.env.LAUNCHLAB_SWAP_SIGNATURE;
if(!key||!/^[1-9A-HJ-NP-Za-km-z]{80,90}$/.test(signature||'')){
 console.error('MISSING_KEY_OR_SIGNATURE');process.exitCode=2;
}else{
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),12000);
 try{
  const response=await fetch('https://mainnet.helius-rpc.com/?api-key='+encodeURIComponent(key),{
   method:'POST',signal:controller.signal,headers:{'content-type':'application/json'},
   body:JSON.stringify({jsonrpc:'2.0',id:1,method:'getTransaction',params:[signature,{encoding:'jsonParsed',commitment:'confirmed',maxSupportedTransactionVersion:0}]})
  });
  if(!response.ok)throw Error('RPC_HTTP_'+response.status);
  const json=await response.json();
  if(json.error)throw Error('RPC_RESPONSE_ERROR');
  const receivedAt=new Date().toISOString();
  const result=decodeLaunchlabSwapTransaction({transaction:json.result,signature,receivedAt});
  console.log(JSON.stringify({signature,receivedAt,status:result.status,count:result.count,
   swaps:(result.swaps||[]).map(x=>({kind:x.kind,mint:x.mint,curve:x.curve,quoteMint:x.quoteMint})),
   executedQuoteSol:null,buyQualified:false}));
  if(result.status!=='DECODED_SUCCESSFUL_SWAP_INSTRUCTION')process.exitCode=3;
 }catch(error){console.error('SWAP_PROOF_FAILED',error.name==='AbortError'?'TIMEOUT':'RPC_ERROR');process.exitCode=1;}
 finally{clearTimeout(timeout);}
}
