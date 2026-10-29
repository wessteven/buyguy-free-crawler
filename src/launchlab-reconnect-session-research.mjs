// GOGET / WHAT'S GOOD: isolated, opt-in LaunchLab reconnect state-machine POC.
// NOT imported by production or Pocket Radar. No timers, persistent writes, trades,
// alerts, provider fallback, checkpoint advancement, or unbounded retry loops.
// All notices are UNVERIFIED CANDIDATES; only an independent transaction lookup
// can establish a launch instruction. Historical overlap never proves full coverage.
import {LAUNCHLAB_PROGRAM,launchlabLogCandidate} from './launchlab-birth-research.mjs';
import {reviewLaunchlabReconnectGap} from './launchlab-gap-review-research.mjs';

const sigRE=/^[1-9A-HJ-NP-Za-km-z]{80,90}$/;
const validSig=s=>typeof s==='string'&&sigRE.test(s);
const slotOK=s=>Number.isSafeInteger(s)&&s>0;
const utc=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(s)&&
 s.endsWith('Z')&&Number.isFinite(Date.parse(s));
const clamp=(n,low,high,defaultValue)=>Number.isFinite(n)?
 Math.max(low,Math.min(high,Math.floor(n))):defaultValue;

/**
 * Finite research session with manually driven stale/time checks (tick).
 * No implicit global WebSocket: caller MUST inject WebSocketCtor.
 * On reconnect: await confirmed logsSubscribe ACK, run bounded RPC gap review,
 * and preserve unknown coverage even if the bounded signature list overlaps.
 */
export function createLaunchlabReconnectSession({
 rpcUrl,wsUrl,WebSocketCtor,fetcher=fetch,
 reviewer=reviewLaunchlabReconnectGap,
 now=()=>new Date().toISOString(),monotonic=()=>performance.now(),
 checkpointSignature=null,checkpointSlot=null,
 maxReconnects=2,maxReviews=2,maxNotices=120,maxBuffered=24,
 maxDurationMs=90000,staleAfterMs=15000,
 pageLimit=60,maxPages=2,maxTransactions=6
}={}){
 if(typeof rpcUrl!=='string'||!rpcUrl.startsWith('https://')||
    typeof wsUrl!=='string'||!wsUrl.startsWith('wss://')||
    typeof WebSocketCtor!=='function'||typeof fetcher!=='function'||
    typeof reviewer!=='function'||typeof now!=='function'||
    typeof monotonic!=='function'||
    (checkpointSignature!==null&&(!validSig(checkpointSignature)||!slotOK(checkpointSlot)))||
    (checkpointSignature===null&&checkpointSlot!==null))
  throw Error('VALID_ISOLATED_RECONNECT_INPUTS_REQUIRED');

 const limits={
  maxReconnects:clamp(maxReconnects,0,3,2),
  maxReviews:clamp(maxReviews,0,3,2),
  maxNotices:clamp(maxNotices,1,300,120),
  maxBuffered:clamp(maxBuffered,1,50,24),
  maxDurationMs:clamp(maxDurationMs,1000,120000,90000),
  staleAfterMs:clamp(staleAfterMs,1000,60000,15000),
  pageLimit:clamp(pageLimit,1,100,60),
  maxPages:clamp(maxPages,1,3,2),
  maxTransactions:clamp(maxTransactions,1,6,6)
 };
 const result={
  kind:'LAUNCHLAB_MOCKABLE_RECONNECT_RESEARCH',schemaVersion:1,
  program:LAUNCHLAB_PROGRAM,phase:'IDLE',status:'NOT_STARTED',
  startedAt:null,endedAt:null,connectionAttempts:0,reconnects:0,
  subscriptionAcks:0,disconnects:0,reviewCalls:0,
  lastSubscriptionAckAt:null,lastGapOpenedAt:null,
  notices:0,candidates:0,duplicateCandidates:0,bufferedDuringReview:0,
  overflowed:0,staleDetected:0,staleReviewResultsIgnored:0,
  lastBackfillStatus:null,backfillReviews:[],
  pendingLive:[],seenSignatures:[],
  checkpointSignature,checkpointSlot,
  coverage:'UNKNOWN',subscriptionGapUnknown:true,
  checkpointAdvanceAuthorized:false,deviceDeliveryLatencyMs:null,
  actualLiveAlertLatencyMs:null,buyQualified:false,
  bounds:limits,
  caveats:[
   'Mockable research-only reconnection, not a deployed collector or phone notification.',
   'Historical RPC signature overlap does not prove every WebSocket log was delivered.',
   'Pending live signatures are hints, not verified launches or independently verified buyers.',
   'No transaction-to-alert latency, executable exit, valuation, liquidity or trade safety measured.',
   'No persistent watermark advancement; unresolved gaps must remain explicit.'
  ]
 };
 let ws=null,generation=0,subscriptionId=null,startedMono=null,
  lastActivityMono=null,closing=false,gapOpen=false,activeReview=null;
 const seen=new Set();
 const snapshot=()=>structuredClone(result);
 const stamp=()=>{
  const t=now();if(!utc(t))throw Error('UTC_RESEARCH_CLOCK_REQUIRED');
  return t;
 };
 const stop=(reason='MANUALLY_STOPPED')=>{
  if(closing)return snapshot();
  closing=true;generation++;result.phase='STOPPED';result.status=reason;
  result.endedAt=stamp();
  try{ws?.close()}catch{} // synchronous close events are ignored via generation
  return snapshot();
 };
 const disconnect=(g,reason)=>{
  if(closing||g!==generation)return;
  result.disconnects++;gapOpen=true;subscriptionId=null;
  result.lastGapOpenedAt=stamp();
  result.status=reason;result.phase='DISCONNECTED';
  generation++; // invalidate callbacks AND in-flight review results
  try{ws?.close()}catch{}
  if(result.reconnects>=limits.maxReconnects){
   stop('RECONNECT_BUDGET_EXHAUSTED');return;
  }
  result.reconnects++;
  connect();
 };
 const collect=(message)=>{
  result.notices++;
  if(result.notices>limits.maxNotices){stop('NOTICE_BUDGET_EXHAUSTED');return}
  const candidate=launchlabLogCandidate(message);
  if(!candidate)return;
  if(!slotOK(candidate.slot))return; // no ungrounded slot
  if(seen.has(candidate.signature)){result.duplicateCandidates++;return}
  if(result.pendingLive.length>=limits.maxBuffered){
   result.overflowed++;
   stop('LIVE_BUFFER_OVERFLOW');return;
  }
  seen.add(candidate.signature);result.seenSignatures.push(candidate.signature);
  result.candidates++;
  if(result.phase==='BACKFILL')result.bufferedDuringReview++;
  result.pendingLive.push({
   signature:candidate.signature,slot:candidate.slot,
   streamReceivedAt:stamp(),streamReceivedMonotonicMs:monotonic(),
   subscriptionId,connectionGeneration:generation,
   verifiedAt:null,noticeToVerificationMs:null,deviceDeliveredAt:null,
   origin:result.phase==='BACKFILL'?
    'LIVE_DURING_HISTORICAL_REVIEW':'LIVE_LOG_NOTIFICATION',
   classification:'UNVERIFIED_LOG_HINT',buyQualified:false,
   actualLiveAlertLatencyMs:null
  });
 };
 const runReview=async(g)=>{
  if(result.reviewCalls>=limits.maxReviews){
   result.phase='GAP_UNRESOLVED';result.status='BACKFILL_REVIEW_BUDGET_EXHAUSTED';return;
  }
  if(!validSig(checkpointSignature)||!slotOK(checkpointSlot)){
   result.phase='GAP_UNRESOLVED';result.status='NO_VERIFIED_CHECKPOINT';return;
  }
  result.reviewCalls++;result.phase='BACKFILL';result.status='BACKFILL_RUNNING';
  const reviewStartedMono=monotonic(),reviewStartedAt=stamp();
  const index=result.reviewCalls;
  let review;
  try{
   review=await reviewer({
    rpcUrl,checkpointSignature,checkpointSlot,fetcher,
    pageLimit:limits.pageLimit,maxPages:limits.maxPages,
    maxTransactions:limits.maxTransactions,
    // Reclassify history independently; do not silently trust prior live hints.
    liveSeenSignatures:[],now
   });
  }catch{review={status:'BACKFILL_REVIEW_FAILED',reconciliationStatus:'UNKNOWN',
    historyPages:null,transactionLookups:null,advanceAuthorized:false,births:[]}}
  if(closing||g!==generation){
   result.staleReviewResultsIgnored++;return;
  }
  const valid=review?.status==='BOUNDED_REPLAY_CLASSIFIED'&&
   review?.reconciliationStatus==='CHECKPOINT_OVERLAP_VERIFIED'&&
   review?.historyOverlapFound===true&&
   review?.sourceOrderViolations===0&&
   review?.replayCoverage==='BOUNDED_SIGNATURE_HISTORY_OVERLAP_AND_CLASSIFICATION_ONLY'&&
   Number.isSafeInteger(review?.historyPages)&&review.historyPages<=limits.maxPages&&
   Number.isSafeInteger(review?.transactionLookups)&&review.transactionLookups<=limits.maxTransactions&&
   Array.isArray(review?.unresolved)&&review.unresolved.length===0&&
   review?.advanceAuthorized===false&&review?.buyQualified===false;
  result.lastBackfillStatus=review?.status||'INVALID_REVIEW_RESULT';
  result.backfillReviews.push({
   index,status:result.lastBackfillStatus,
   reconciliationStatus:review?.reconciliationStatus||null,
   historyPages:Number.isSafeInteger(review?.historyPages)?review.historyPages:null,
   transactionLookups:Number.isSafeInteger(review?.transactionLookups)?review.transactionLookups:null,
   replayBirthCount:Array.isArray(review?.births)?review.births.length:null,
   completeBoundedReview:valid,
   startedAt:reviewStartedAt,finishedAt:stamp(),
   reviewElapsedMonotonicMs:Math.max(0,monotonic()-reviewStartedMono),
   coverage:'UNKNOWN',
   checkpointAdvanceAuthorized:false
  });
  result.phase=valid?'ACTIVE_AFTER_BOUNDED_REVIEW':'GAP_UNRESOLVED';
  result.status=valid?'BOUNDED_HISTORY_REVIEW_COMPLETE':'HISTORY_GAP_UNRESOLVED';
 };
 const connect=()=>{
  if(closing)return;
  const g=++generation;
  result.connectionAttempts++;
  result.phase='CONNECTING';result.status='AWAITING_OPEN';
  subscriptionId=null;lastActivityMono=monotonic();
  try{ws=new WebSocketCtor(wsUrl)}
  catch{disconnect(g,'WEBSOCKET_CONSTRUCTOR_FAILED');return}
  ws.addEventListener('open',()=>{
   if(closing||g!==generation)return;
   result.phase='AWAITING_ACK';lastActivityMono=monotonic();
   try{ws.send(JSON.stringify({jsonrpc:'2.0',id:1,method:'logsSubscribe',
    params:[{mentions:[LAUNCHLAB_PROGRAM]},{commitment:'confirmed'}]}))}
   catch{disconnect(g,'SUBSCRIBE_SEND_FAILED')}
  });
  ws.addEventListener('message',event=>{
   if(closing||g!==generation)return;
   lastActivityMono=monotonic();
   let message;try{message=JSON.parse(String(event.data))}
   catch{disconnect(g,'MALFORMED_STREAM_MESSAGE');return}
   if(message?.id===1&&(message?.error||message?.result!==undefined)){
    if(result.phase!=='AWAITING_ACK')return;
    if(!slotOK(message.result)||message.error){
     disconnect(g,'SUBSCRIPTION_REJECTED');return;
    }
    subscriptionId=message.result;result.subscriptionAcks++;
    result.lastSubscriptionAckAt=stamp();
    if(gapOpen){
     activeReview=runReview(g);
    }else{
     result.phase='ACTIVE_UNVERIFIED';result.status='SUBSCRIBED_NO_GAP_REVIEW';
    }
    return;
   }
   if(message?.method!=='logsNotification')return;
   if(result.phase==='AWAITING_ACK'){
    disconnect(g,'NOTIFICATION_BEFORE_ACK');return;
   }
   if(message?.params?.subscription!==subscriptionId){
    disconnect(g,'SUBSCRIPTION_ID_MISMATCH');return;
   }
   collect(message);
  });
  ws.addEventListener('error',()=>disconnect(g,'WEBSOCKET_ERROR'));
  ws.addEventListener('close',()=>disconnect(g,'WEBSOCKET_CLOSED'));
 };
 const start=()=>{
  if(result.phase!=='IDLE')throw Error('SESSION_ALREADY_STARTED');
  result.startedAt=stamp();startedMono=monotonic();connect();
  return snapshot();
 };
 const tick=()=>{
  if(closing||result.phase==='IDLE')return snapshot();
  const elapsed=monotonic()-startedMono;
  if(!Number.isFinite(elapsed)||elapsed<0)return stop('MONOTONIC_CLOCK_INVALID');
  if(elapsed>=limits.maxDurationMs)return stop('SESSION_TIME_BUDGET_EXHAUSTED');
  if(result.phase==='BACKFILL')return snapshot(); // bounded reviewer controls RPC
  const idle=monotonic()-lastActivityMono;
  if(Number.isFinite(idle)&&idle>=limits.staleAfterMs){
   result.staleDetected++;disconnect(generation,'STALE_STREAM_TIMEOUT');
  }
  return snapshot();
 };
 return {start,stop,tick,snapshot,waitForReview:async()=>{
  if(activeReview)await activeReview;
  return snapshot();
 }};
}
