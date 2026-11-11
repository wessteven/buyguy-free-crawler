// GOGET Early Launch Radar POC. Opt-in research only; no cron, D1, score or trades.
// Program and account order: Raydium LaunchLab IDL / Helius LaunchLab program schema.
// Anchor instruction discriminators are SHA256('global:<name>')[0..8].
// Post-2026-09 supported paths: initialize_v2 / initialize_with_token_2022.
// Reuse the already-tested repo's base58 instruction decoder.
import {decodeBase58Instruction} from './helius-binary-pool.mjs';

export const LAUNCHLAB_PROGRAM='LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj';
const address=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const signature=/^[1-9A-HJ-NP-Za-km-z]{80,90}$/;
const STARTS=[
 {kind:'INITIALIZE_V2',bytes:[67,153,175,39,218,16,38,32]},
 {kind:'INITIALIZE_WITH_TOKEN_2022',bytes:[37,190,126,222,44,154,171,17]}
];
const isAddress=x=>typeof x==='string'&&address.test(x);
const validSignature=x=>typeof x==='string'&&signature.test(x);
const asDate=seconds=>Number.isInteger(seconds)&&seconds>0?new Date(seconds*1000).toISOString():null;
const rpcRequest=(method,params)=>({jsonrpc:'2.0',id:1,method,params});

export function classifyLaunchlabBirth(transaction,context={}){
 if(!transaction)return {status:'TRANSACTION_UNAVAILABLE',evidence:'NONE'};
 if(transaction.meta?.err)return {status:'TRANSACTION_FAILED',evidence:'FAILED_TRANSACTION'};
 const msg=transaction.transaction?.message;
 const instructions=[...(msg?.instructions||[]),
   ...(transaction.meta?.innerInstructions||[]).flatMap(x=>x.instructions||[])];
 let malformed=0;
 for(const ix of instructions){
  if(ix?.programId!==LAUNCHLAB_PROGRAM)continue;
  const bytes=decodeBase58Instruction(ix.data);
  if(!bytes||bytes.length<8)continue;
  const spec=STARTS.find(s=>s.bytes.every((v,i)=>bytes[i]===v));
  if(!spec)continue; // Buy, Sell, migration and deprecated initialize are not birth.
  const ac=ix.accounts||[];
  // Both current Initialize variants: payer, creator, config, platform, authority,
  // pool_state[5], base_mint[6], quote_mint[7], ...
  const curve=ac[5],mint=ac[6],quote=ac[7],creator=ac[1];
  if(ac.length<(spec.kind==='INITIALIZE_V2'?18:15)||!isAddress(curve)||!isAddress(mint)||!isAddress(quote)||
     !isAddress(creator)||new Set([curve,mint,quote]).size!==3){
    malformed++;continue;
  }
  const slot=Number.isInteger(transaction.slot)?transaction.slot:
    Number.isInteger(context.slot)?context.slot:null;
  const blockTime=Number.isInteger(transaction.blockTime)?transaction.blockTime:
    Number.isInteger(context.blockTime)?context.blockTime:null;
  return {status:'LAUNCH_INSTRUCTION_OBSERVED',protocol:'RAYDIUM_LAUNCHLAB',
   kind:spec.kind,program:LAUNCHLAB_PROGRAM,mint,curve,quoteMint:quote,creator,
   signature:validSignature(context.signature)?context.signature:null,
   slot,blockTime,chainTime:asDate(blockTime),
   receivedAt:typeof context.receivedAt==='string'?context.receivedAt:null,
   evidence:'SUCCESSFUL_ANCHOR_INITIALIZE_DISCRIMINATOR_AND_IDL_ACCOUNTS',
   safetyVerified:false,tradabilityVerified:false,uniqueBuyers:null,
   marketCapUsd:null,liquidityUsd:null,
   caveat:'Successful initialization instruction only. Account state, curve reserves, executable exits, independent buyers, fees and project credibility remain unverified.'};
 }
 return malformed?
  {status:'MALFORMED_INITIALIZE_ACCOUNTS',evidence:'MATCHED_DISCRIMINATOR_BAD_ACCOUNTS'}:
  {status:'NO_SUPPORTED_LAUNCH_INSTRUCTION',evidence:'NONE'};
}

// logsSubscribe is a cheap FILTER, not evidence: verify every candidate with getTransaction.
export function launchlabLogCandidate(message){
 const v=message?.params?.result?.value;
 if(message?.method!=='logsNotification'||!v||v.err!=null||
    !validSignature(v.signature)||!Array.isArray(v.logs))return null;
 if(!v.logs.some(x=>typeof x==='string'&&
    /Program log: Instruction: (InitializeV2|InitializeWithToken2022)\s*$/.test(x)))return null;
 return {signature:v.signature,slot:Number.isInteger(message.params.result.context?.slot)?
   message.params.result.context.slot:null};
}

export async function loadLaunchlabTransaction(rpcUrl,txSignature,fetcher=fetch,{signal}={}){
 if(typeof rpcUrl!=='string'||!rpcUrl.startsWith('https://')||
    !validSignature(txSignature))throw Error('VALID_RPC_URL_AND_SIGNATURE_REQUIRED');
 const reply=await fetcher(rpcUrl,{method:'POST',signal,
  headers:{'content-type':'application/json'},
  body:JSON.stringify(rpcRequest('getTransaction',[txSignature,{
    encoding:'jsonParsed',commitment:'confirmed',maxSupportedTransactionVersion:0
  }]))});
 if(!reply.ok)throw Error('RPC_HTTP_'+reply.status);
 const data=await reply.json();
 if(data?.error)throw Error('RPC_REJECTED');
 return data?.result||null;
}

export async function replayLaunchlabSignature(rpcUrl,txSignature,fetcher=fetch,receivedAt=null){
 const tx=await loadLaunchlabTransaction(rpcUrl,txSignature,fetcher);
 return classifyLaunchlabBirth(tx,{signature:txSignature,receivedAt});
}

// Short-lived manual WebSocket observation: one standard logs subscription; bounded
// transaction lookups, time and notifications. Deliberately no persistence or writes.
export async function observeLaunchlabBirths({
 rpcUrl,wsUrl,fetcher=fetch,WebSocketCtor=globalThis.WebSocket,
 durationMs=90000,maxNotifications=300,maxLookups=6,
 now=()=>new Date().toISOString()
}={}){
 if(typeof rpcUrl!=='string'||!rpcUrl.startsWith('https://')||
    typeof wsUrl!=='string'||!wsUrl.startsWith('wss://')||
    typeof WebSocketCtor!=='function')throw Error('VALID_RPC_WS_REQUIRED');
 const duration=Math.max(1000,Math.min(120000,Number(durationMs)||90000));
 const noticeCap=Math.max(1,Math.min(300,Math.floor(Number(maxNotifications)||300)));
 const lookupCap=Math.max(1,Math.min(6,Math.floor(Number(maxLookups)||6)));
 return await new Promise((resolve,reject)=>{
  const ws=new WebSocketCtor(wsUrl);
  const result={mode:'BOUNDED_MANUAL_RESEARCH',protocol:'RAYDIUM_LAUNCHLAB',
    monitoredProgram:LAUNCHLAB_PROGRAM,notifications:0,candidates:0,
    lookups:0,births:[],inconclusive:[],startedAt:now(),endedAt:null,
    status:'RUNNING',maxNotifications:noticeCap,maxLookups:lookupCap,
    caveat:'Sampled live window, not continuous universe coverage. Only transaction evidence is recorded; no trade qualification.'};
  const seen=new Set(),pending=new Set();
  let closing=false;
  const finalize=async(reason)=>{
   if(closing)return;closing=true;clearTimeout(timer);
   try{ws.close()}catch{}
   await Promise.allSettled([...pending]);
   result.status=reason;result.endedAt=now();resolve(result);
  };
  const timer=setTimeout(()=>{void finalize('TIME_BOUND')},duration);
  ws.addEventListener('open',()=>{
   ws.send(JSON.stringify(rpcRequest('logsSubscribe',[{
    mentions:[LAUNCHLAB_PROGRAM]
   },{commitment:'confirmed'}])));
  });
  ws.addEventListener('message',event=>{
   if(closing)return;
   let message;try{message=JSON.parse(String(event.data))}catch{return}
   if(message?.error){void finalize('SUBSCRIPTION_REJECTED');return}
   if(message?.method!=='logsNotification')return;
   result.notifications++;
   const candidate=launchlabLogCandidate(message);
   if(candidate&&!seen.has(candidate.signature)){
    seen.add(candidate.signature);result.candidates++;
    if(result.lookups<lookupCap){
     result.lookups++;
     const receivedAt=now();
     const task=(async()=>{
      try{
       const tx=await loadLaunchlabTransaction(rpcUrl,candidate.signature,fetcher);
       const finding=classifyLaunchlabBirth(tx,{...candidate,receivedAt});
       if(finding.status==='LAUNCH_INSTRUCTION_OBSERVED')result.births.push(finding);
       else result.inconclusive.push({signature:candidate.signature,status:finding.status});
      }catch{
       result.inconclusive.push({signature:candidate.signature,status:'RPC_UNAVAILABLE'});
      }
     })();
     pending.add(task);void task.finally(()=>pending.delete(task));
    }
   }
   if(result.notifications>=noticeCap||result.lookups>=lookupCap)
    void finalize(result.lookups>=lookupCap?'LOOKUP_BUDGET_REACHED':'NOTIFICATION_BUDGET_REACHED');
  });
  ws.addEventListener('error',()=>{void finalize('WEBSOCKET_ERROR')});
  ws.addEventListener('close',()=>{void finalize('WEBSOCKET_CLOSED')});
 });
}
