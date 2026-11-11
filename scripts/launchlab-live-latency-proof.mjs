// One-shot research proof. Strictly no D1, trading, key logging, worker writes or Android push.
import {mkdir,writeFile} from 'node:fs/promises';
import {measureLaunchlabLive} from '../src/launchlab-live-latency-research.mjs';
const outfile='launchlab-live-latency-proof/report.json';
await mkdir('launchlab-live-latency-proof',{recursive:true});
const key=process.env.HELIUS_API_KEY;
const manifest={
 purpose:'SINGLE_BOUNDED_MAINNET_LAUNCHLAB_RESEARCH_SAMPLE',
 schemaVersion:1,
 startedAt:new Date().toISOString(),
 source:'Helius standard Solana confirmed logsSubscribe + bounded getTransaction',
 productionStateChanged:false,
 marketOrdersPlaced:0,D1Reads:0,D1Writes:0,pocketNotifications:0,
 deviceDeliveryLatencyMs:null,
 report:null
};
if(!key){
 manifest.status='HELIUS_SECRET_NOT_CONFIGURED';
 manifest.caveat='No network sample was executed.';
 process.exitCode=1;
}else{
 const base='mainnet.helius-rpc.com/?api-key='+encodeURIComponent(key);
 try{
  const fetched=async(url,opts)=>{
   // Each confirmed transaction lookup is independently bounded to 8 seconds.
   const timer=AbortSignal.timeout(8000);
   return fetch(url,{...opts,signal:timer});
  };
  manifest.report=await measureLaunchlabLive({
   rpcUrl:'https://'+base,wsUrl:'wss://'+base,
   fetcher:fetched,durationMs:60000,maxNotifications:150,
   maxLookups:6,maxConcurrent:2
  });
  manifest.status=manifest.report.status;
  if(['WEBSOCKET_ERROR','SUBSCRIPTION_REJECTED','SUBSCRIPTION_ACK_TIMEOUT',
      'SUBSCRIBE_SEND_FAILED','NOTIFICATION_BEFORE_ACK',
      'SUBSCRIPTION_ID_MISMATCH','WEBSOCKET_CONSTRUCTOR_FAILED'].includes(manifest.status))
    process.exitCode=1;
 }catch(err){
  // Do not stringify the error message, which may contain the signed RPC URL.
  manifest.status='RUNNER_EXCEPTION';
  manifest.errorClass=typeof err?.name==='string'?err.name:'Error';
  process.exitCode=1;
 }
}
manifest.finishedAt=new Date().toISOString();
await writeFile(outfile,JSON.stringify(manifest,null,2)+'\n');
console.log('GOGET_LIVE_LATENCY_PROOF',JSON.stringify({
 status:manifest.status,ack:manifest.report?.subscriptionAcknowledged??false,
 notifications:manifest.report?.notifications??0,
 verifiedBirths:manifest.report?.metrics?.observedBirths??0,
 RPClookups:manifest.report?.lookupsStarted??0,
 noProductionWrites:true,
 artifact:'launchlab-live-latency-proof/report.json'
}));
