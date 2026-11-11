// GOGET research only: bounded LIVE standard-WebSocket LaunchLab timing proof.
// Does not connect to production, D1, Pocket Radar, trading, or schedulers.
// Contract birth != verified liquidity, independent buyers or executable entry.
import {
 LAUNCHLAB_PROGRAM,launchlabLogCandidate,loadLaunchlabTransaction,
 classifyLaunchlabBirth
} from './launchlab-birth-research.mjs';

const date=ms=>Number.isFinite(ms)?new Date(ms).toISOString():null;
const summary=values=>{
 const sorted=values.filter(Number.isFinite).sort((a,b)=>a-b);
 const p=q=>sorted.length?sorted[Math.min(sorted.length-1,Math.ceil(sorted.length*q)-1)]:null;
 return {count:sorted.length,minMs:p(0),p50Ms:p(.5),p95Ms:p(.95),maxMs:p(1)};
};
const round=v=>Number.isFinite(v)?Math.round(v*100)/100:null;
const isSlot=x=>Number.isSafeInteger(x)&&x>0;
export async function measureLaunchlabLive({
 rpcUrl,wsUrl,fetcher=fetch,WebSocketCtor=globalThis.WebSocket,
 durationMs=90000,maxNotifications=240,maxLookups=6,maxConcurrent=2,
 nowMs=()=>Date.now(),clock=()=>performance.now()
}={}){
 if(typeof rpcUrl!=='string'||!rpcUrl.startsWith('https://')||
    typeof wsUrl!=='string'||!wsUrl.startsWith('wss://')||
    typeof fetcher!=='function'||typeof WebSocketCtor!=='function')
  throw Error('VALID_RESEARCH_NETWORK_INPUTS_REQUIRED');
 const duration=Math.max(2000,Math.min(90000,Math.trunc(durationMs)));
 const notificationLimit=Math.max(1,Math.min(300,Math.trunc(maxNotifications)));
 const lookupLimit=Math.max(1,Math.min(6,Math.trunc(maxLookups)));
 const concurrentLimit=Math.max(1,Math.min(2,Math.trunc(maxConcurrent)));
 return await new Promise(resolve=>{
  const startedAtMs=nowMs(),startMonotonic=clock();
  const result={
   kind:'LAUNCHLAB_LIVE_READONLY_LATENCY_PROOF',schemaVersion:1,program:LAUNCHLAB_PROGRAM,
   startedAt:date(startedAtMs),endedAt:null,elapsedMonotonicMs:null,
   status:'RUNNING',subscriptionAcknowledged:false,subscriptionAckAt:null,
   connectionOpenedAt:null,notifications:0,bytesReceived:0,lookupCandidates:0,
   lookupsStarted:0,lookupsFinished:0,duplicates:0,skippedBudget:0,
   skippedConcurrency:0,nonCandidateNotices:0,failedTransactionsIgnored:0,
   slotRegressions:0,firstObservedSlot:null,lastObservedSlot:null,
   findings:[],inconclusive:[],
   subscriptionGapUnknown:true,catchupPerformed:false,
   deviceDeliveryLatencyMs:null,streamUsageCredits:null,
   bounds:{durationMs:duration,maxNotifications:notificationLimit,
    maxLookups:lookupLimit,maxConcurrent:concurrentLimit},
   caveats:[
    'One finite confirmed-commitment WebSocket sample; not continuous birth coverage.',
    'Block timestamps have second precision; chain-to-notice delta is an approximate bound, not finalized network propagation latency.',
    'RPC transaction lookup/verification may lag WebSocket notification. No backfill or reconnect in this bounded research run.',
    'Device notification time, trade eligibility, independently verified buyers, execution liquidity, and provider billed credits not measured.'
   ]
  };
  let ws,closed=false,acknowledged=false,subscriptionId=null,active=0,lookupPending=new Set();
  const seen=new Set();
  let runtimeTimer=null,ackTimer=null;
  const stop=async(status)=>{
   if(closed)return;closed=true;
   clearTimeout(runtimeTimer);clearTimeout(ackTimer);
   if(ws&&ws.readyState===1&&subscriptionId!==null){
    try{ws.send(JSON.stringify({jsonrpc:'2.0',id:2,method:'logsUnsubscribe',params:[subscriptionId]}))}catch{}
   }
   try{ws?.close()}catch{}
   await Promise.allSettled([...lookupPending]);
   result.status=status;
   result.endedAt=date(nowMs());
   result.elapsedMonotonicMs=round(clock()-startMonotonic);
   const verified=result.findings.filter(x=>x.status==='LAUNCH_INSTRUCTION_OBSERVED');
   result.metrics={
    noticeToRpcVerified:summary(verified.map(x=>x.noticeToVerificationMs)),
    chainBlockToNotice:summary(verified.map(x=>x.chainBlockToNoticeApproxMs)),
    candidateToFinish:summary(result.findings.map(x=>x.noticeToVerificationMs)),
    subscribedNoCatchup:true,
    observedBirths:verified.length
   };
   resolve(result);
  };
  try{
   ws=new WebSocketCtor(wsUrl);
  }catch{
   void stop('WEBSOCKET_CONSTRUCTOR_FAILED');return;
  }
  runtimeTimer=setTimeout(()=>{void stop('TIME_BOUND')},duration);
  ackTimer=setTimeout(()=>{
   if(!acknowledged)void stop('SUBSCRIPTION_ACK_TIMEOUT');
  },Math.min(10000,duration));
  ws.addEventListener('open',()=>{
   if(closed)return;
   result.connectionOpenedAt=date(nowMs());
   try{ws.send(JSON.stringify({jsonrpc:'2.0',id:1,method:'logsSubscribe',
    params:[{mentions:[LAUNCHLAB_PROGRAM]},{commitment:'confirmed'}]}))}
   catch{void stop('SUBSCRIBE_SEND_FAILED')}
  });
  ws.addEventListener('message',event=>{
   if(closed)return;
   const receivedMs=nowMs(),receivedTick=clock();
   const raw=typeof event?.data==='string'?event.data:'';
   result.bytesReceived+=new TextEncoder().encode(raw).length;
   let message;try{message=JSON.parse(raw)}catch{return}
   if(message?.id===1){
    if(message.error||!Number.isSafeInteger(message.result)||message.result<0){
     void stop('SUBSCRIPTION_REJECTED');return;
    }
    acknowledged=true;subscriptionId=message.result;
    result.subscriptionAcknowledged=true;result.subscriptionAckAt=date(receivedMs);
    clearTimeout(ackTimer);return;
   }
   if(message?.method!=='logsNotification')return;
   if(!acknowledged){void stop('NOTIFICATION_BEFORE_ACK');return}
   if(message.params?.subscription!==subscriptionId){
    // Never accept a mismatched stream as evidence.
    void stop('SUBSCRIPTION_ID_MISMATCH');return;
   }
   result.notifications++;
   const slot=message.params?.result?.context?.slot;
   if(isSlot(slot)){
    if(result.lastObservedSlot!==null&&slot<result.lastObservedSlot)
     result.slotRegressions++;
    if(result.firstObservedSlot===null)result.firstObservedSlot=slot;
    result.lastObservedSlot=slot;
   }
   if(message.params?.result?.value?.err!==null)
    result.failedTransactionsIgnored++;
   const lead=launchlabLogCandidate(message);
   if(!lead){result.nonCandidateNotices++;}
   else if(seen.has(lead.signature)){result.duplicates++;}
   else{
    seen.add(lead.signature);result.lookupCandidates++;
    if(result.lookupsStarted>=lookupLimit){result.skippedBudget++;}
    else if(active>=concurrentLimit){result.skippedConcurrency++;}
    else{
     active++;result.lookupsStarted++;
     const startedTick=clock(),receivedAt=date(receivedMs),lookupStartedAt=date(nowMs());
     const task=(async()=>{
      let finding;
      try{
       const tx=await loadLaunchlabTransaction(rpcUrl,lead.signature,fetcher);
       finding=classifyLaunchlabBirth(tx,{signature:lead.signature,slot:lead.slot,receivedAt});
       if(finding.status==='LAUNCH_INSTRUCTION_OBSERVED'&&isSlot(tx?.slot)&&
          isSlot(lead.slot)&&tx.slot!==lead.slot){
        finding={status:'SLOT_MISMATCH',signature:lead.signature,
         expectedSlot:lead.slot,transactionSlot:tx.slot};
       }
      }catch{finding={status:'RPC_LOOKUP_FAILED',signature:lead.signature}}
      const finishedTick=clock(),verifiedAt=date(nowMs());
      const success=finding.status==='LAUNCH_INSTRUCTION_OBSERVED';
      const chainDelta=success&&Number.isSafeInteger(finding.blockTime)?
       receivedMs-finding.blockTime*1000:null;
      const record={
       status:finding.status,signature:lead.signature,slot:lead.slot??null,
       mint:success?finding.mint:null,curve:success?finding.curve:null,
       chainBlockTime:success?finding.chainTime:null,
       streamReceivedAt:receivedAt,rpcLookupStartedAt:lookupStartedAt,
       verifiedAt,noticeToVerificationMs:round(finishedTick-receivedTick),
       lookupDurationMs:round(finishedTick-startedTick),
       chainBlockToNoticeApproxMs:round(chainDelta),
       deviceDeliveredAt:null,providerReceiptLagKnown:false,
       knownLiquidityUsd:null,verifiedIndependentBuyers:null,buyQualified:false
      };
      if(success)result.findings.push(record);
      else result.inconclusive.push(record);
      result.lookupsFinished++;active--;
     })();
     lookupPending.add(task);void task.finally(()=>lookupPending.delete(task));
    }
   }
   if(result.notifications>=notificationLimit)void stop('NOTIFICATION_BUDGET_REACHED');
   else if(result.lookupsStarted>=lookupLimit)void stop('LOOKUP_BUDGET_REACHED');
  });
  ws.addEventListener('error',()=>{if(!closed)void stop('WEBSOCKET_ERROR')});
  ws.addEventListener('close',()=>{if(!closed)void stop('UNEXPECTED_DISCONNECT')});
 });
}
