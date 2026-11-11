// Manual GitHub Actions evidence probe, never part of production scheduler.
// No D1, Cloudflare deploy, wallet, paper trading, or private RPC URLs in logs.
import {observeLaunchlabBirths,replayLaunchlabSignature} from '../src/launchlab-birth-research.mjs';

const key=process.env.HELIUS_API_KEY;
const mode=process.env.PROBE_MODE==='FLOAT_REPLAY'?'FLOAT_REPLAY':'LIVE';
const knownSignature=process.env.HISTORICAL_SIGNATURE||'';
if(!key){console.error('LAUNCHLAB_PROOF: HELIUS_API_KEY_MISSING');process.exitCode=1;}
else if(mode==='FLOAT_REPLAY'&&!knownSignature){
 console.error('LAUNCHLAB_PROOF: EXACT_HISTORICAL_SIGNATURE_REQUIRED');
 process.exitCode=1;
}else{
 const rpc='https://mainnet.helius-rpc.com/?api-key='+encodeURIComponent(key);
 const ws='wss://mainnet.helius-rpc.com/?api-key='+encodeURIComponent(key);
 const ac=new AbortController(),timer=setTimeout(()=>ac.abort(),150000);
 const fetcher=(url,options)=>fetch(url,{...options,signal:ac.signal});
 try{
  if(mode==='FLOAT_REPLAY'){
   const item=await replayLaunchlabSignature(rpc,knownSignature,fetcher,
    new Date().toISOString());
   // A supplied signature is not implicitly FLOAT-related or an initializer.
   console.log('LAUNCHLAB_HISTORICAL_RESULT',JSON.stringify({
    mode,result:item,groundTruth:'USER_SUPPLIED_SIGNATURE_NOT_INDEPENDENTLY_ATTRIBUTED'
   }));
  }else{
   const proof=await observeLaunchlabBirths({
    rpcUrl:rpc,wsUrl:ws,fetcher,durationMs:90000,
    maxNotifications:300,maxLookups:6
   });
   console.log('LAUNCHLAB_LIVE_PROOF',JSON.stringify(proof));
  }
 }catch(error){
  // Do not stringify thrown fetch errors: URLs may contain credentials.
  console.error('LAUNCHLAB_PROOF_FAILED',error?.name||'Error');
  process.exitCode=1;
 }finally{clearTimeout(timer)}
}
