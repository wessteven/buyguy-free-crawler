// Manual GitHub Actions entry point. Bounded, read-only, sanitized summary.
import {runHeliusDiscoveryExperiment} from '../src/helius-discovery-experiment.mjs';
const key=process.env.HELIUS_API_KEY;
if(!key){console.error('HELIUS_SECRET_MISSING');process.exitCode=1;}
else{
 const protocol=process.env.PROTOCOL==='RAYDIUM_CPMM'?'RAYDIUM_CPMM':'PUMPSWAP';
 const limit=Math.max(1,Math.min(5,Number(process.env.SIGNATURE_LIMIT)||3));
 const rpc='https://mainnet.helius-rpc.com/?api-key='+encodeURIComponent(key);
 const controller=new AbortController();
 const timeout=setTimeout(()=>controller.abort(),45000);
 try{
  const result=await runHeliusDiscoveryExperiment({HELIUS_RPC_URL:rpc},{
   protocol,signatureLimit:limit,
   fetcher:(url,options)=>fetch(url,{...options,signal:controller.signal})
  });
  // No RPC URLs, credentials, raw provider errors or wallet identifiers in logs.
  const statuses={};
  for(const row of result.results||[])statuses[row.status]=(statuses[row.status]||0)+1;
  console.log('HELIUS_REPLAY',JSON.stringify({
   protocol,mode:result.mode,signaturesScanned:result.signaturesScanned,
   transactionsChecked:result.transactionsChecked,poolLeads:result.poolLeads,
   poolsChecked:result.poolsChecked,statuses,discoveryStatus:result.status,
   caveat:result.caveat
  }));
 }catch(error){
  console.error('HELIUS_REPLAY_FAILED',error?.name||'Error');
  process.exitCode=1;
 }finally{clearTimeout(timeout);}
}
