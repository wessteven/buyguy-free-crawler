import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createLaunchlabReconnectSession} from '../src/launchlab-reconnect-session-research.mjs';
import {LAUNCHLAB_PROGRAM} from '../src/launchlab-birth-research.mjs';

const recorded=JSON.parse(readFileSync(new URL('./fixtures/float-launchlab-birth-2026-10-28.json',import.meta.url),'utf8'));
const anchor='B'.repeat(88),other='C'.repeat(88);
const iso='2026-10-30T00:00:00.000Z';
function socketFactory(){
 const sockets=[];
 class FakeSocket{
  constructor(url){this.url=url;this.listeners={};this.sent=[];sockets.push(this)}
  addEventListener(name,fn){this.listeners[name]=fn}
  emit(name,v={}){this.listeners[name]?.(v)}
  send(json){this.sent.push(JSON.parse(json))}
  open(){this.emit('open')}
  ack(id=77){this.emit('message',{data:JSON.stringify({jsonrpc:'2.0',id:1,result:id})})}
  reject(){this.emit('message',{data:JSON.stringify({jsonrpc:'2.0',id:1,error:{code:-32601}})})}
  log(signature=recorded.signature,slot=recorded.slot,subscription=77){
   this.emit('message',{data:JSON.stringify({jsonrpc:'2.0',method:'logsNotification',
    params:{subscription,result:{context:{slot},value:{signature,err:null,
     logs:['Program log: Instruction: InitializeV2']}}}})});
  }
  close(){this.emit('close')}
 }
 return {sockets,WebSocketCtor:FakeSocket};
}
const safeReview=(extra={})=>({
 status:'BOUNDED_REPLAY_CLASSIFIED',reconciliationStatus:'CHECKPOINT_OVERLAP_VERIFIED',
 historyPages:1,transactionLookups:1,advanceAuthorized:false,buyQualified:false,
 historyOverlapFound:true,sourceOrderViolations:0,unresolved:[],
 replayCoverage:'BOUNDED_SIGNATURE_HISTORY_OVERLAP_AND_CLASSIFICATION_ONLY',
 births:[{mint:recorded.expectedMint,observedVia:'HISTORICAL_RPC_REPLAY'}],...extra
});
function base(overrides={}){
 const socket=socketFactory();let ms=0;
 const session=createLaunchlabReconnectSession({
  rpcUrl:'https://rpc.example',wsUrl:'wss://ws.example',
  WebSocketCtor:socket.WebSocketCtor,fetcher:async()=>{throw Error('NO_NETWORK')},
  now:()=>iso,monotonic:()=>ms,
  checkpointSignature:anchor,checkpointSlot:recorded.slot-1,
  reviewer:async()=>safeReview(),
  maxReconnects:2,maxReviews:2,staleAfterMs:15000,
  ...overrides
 });
 return {...socket,session,advance:n=>{ms+=n}};
}
test('research session requires explicit secure endpoints and injected WebSocket',()=>{
 assert.throws(()=>createLaunchlabReconnectSession({rpcUrl:'http://bad',wsUrl:'wss://ok',
  WebSocketCtor:class{}}),/VALID_ISOLATED/);
 assert.throws(()=>createLaunchlabReconnectSession({rpcUrl:'https://ok',wsUrl:'wss://ok'}),
  /VALID_ISOLATED/);
});
test('initial ACK is required; logs are unverified hints and no alert latency is invented',()=>{
 const m=base();m.session.start();
 assert.equal(m.sockets.length,1);
 const w=m.sockets[0];w.open();
 assert.deepEqual(w.sent[0].params[0].mentions,[LAUNCHLAB_PROGRAM]);
 assert.equal(w.sent[0].params[1].commitment,'confirmed');
 w.ack();w.log();w.log();
 const r=m.session.snapshot();
 assert.equal(r.phase,'ACTIVE_UNVERIFIED');
 assert.equal(r.candidates,1);assert.equal(r.duplicateCandidates,1);
 assert.equal(r.pendingLive[0].classification,'UNVERIFIED_LOG_HINT');
 assert.equal(r.pendingLive[0].actualLiveAlertLatencyMs,null);
 assert.equal(r.pendingLive[0].streamReceivedAt,iso);
 assert.equal(r.pendingLive[0].streamReceivedMonotonicMs,0);
 assert.equal(r.pendingLive[0].subscriptionId,77);
 assert.equal(r.pendingLive[0].noticeToVerificationMs,null);
 assert.equal(r.lastSubscriptionAckAt,iso);
 assert.equal(r.actualLiveAlertLatencyMs,null);
 assert.equal(r.checkpointAdvanceAuthorized,false);
 assert.equal(r.coverage,'UNKNOWN');assert.equal(r.buyQualified,false);
 m.session.stop();
});
test('close triggers new socket, confirmed ACK, one bounded backfill and no auto watermark',async()=>{
 const m=base();m.session.start();
 m.sockets[0].open();m.sockets[0].ack();m.sockets[0].close();
 assert.equal(m.sockets.length,2);
 m.sockets[1].open();
 assert.equal(m.session.snapshot().phase,'AWAITING_ACK');
 m.sockets[1].ack();
 const r=await m.session.waitForReview();
 assert.equal(r.reconnects,1);assert.equal(r.subscriptionAcks,2);
 assert.equal(r.reviewCalls,1);
 assert.equal(r.phase,'ACTIVE_AFTER_BOUNDED_REVIEW');
 assert.equal(r.lastBackfillStatus,'BOUNDED_REPLAY_CLASSIFIED');
 assert.equal(r.backfillReviews[0].replayBirthCount,1);
 assert.equal(r.backfillReviews[0].reviewElapsedMonotonicMs,0);
 assert.equal(r.backfillReviews[0].startedAt,iso);
 assert.equal(r.checkpointAdvanceAuthorized,false);
 assert.equal(r.coverage,'UNKNOWN');
 assert.equal(r.subscriptionGapUnknown,true);
 m.session.stop();
});
test('unresolved 429 backfill remains a visible gap with no fabricated continuity',async()=>{
 const m=base({reviewer:async()=>safeReview({status:'HISTORY_GAP_UNRESOLVED',
  reconciliationStatus:'RATE_LIMITED',births:[]})});
 m.session.start();m.sockets[0].open();m.sockets[0].ack();
 m.sockets[0].close();m.sockets[1].open();m.sockets[1].ack();
 const r=await m.session.waitForReview();
 assert.equal(r.phase,'GAP_UNRESOLVED');
 assert.equal(r.status,'HISTORY_GAP_UNRESOLVED');
 assert.equal(r.backfillReviews[0].reconciliationStatus,'RATE_LIMITED');
 assert.equal(r.checkpointAdvanceAuthorized,false);
 m.session.stop();
});
test('a live notification arriving during slow historical review is buffered but not called verified',async()=>{
 let finish;const deferred=new Promise(resolve=>finish=resolve);
 const m=base({reviewer:()=>deferred});
 m.session.start();m.sockets[0].open();m.sockets[0].ack();
 m.sockets[0].close();m.sockets[1].open();m.sockets[1].ack();
 m.sockets[1].log(other,recorded.slot+1);
 assert.equal(m.session.snapshot().phase,'BACKFILL');
 assert.equal(m.session.snapshot().bufferedDuringReview,1);
 finish(safeReview());const r=await m.session.waitForReview();
 assert.equal(r.pendingLive[0].origin,'LIVE_DURING_HISTORICAL_REVIEW');
 assert.equal(r.pendingLive[0].classification,'UNVERIFIED_LOG_HINT');
 assert.equal(r.pendingLive[0].actualLiveAlertLatencyMs,null);
 m.session.stop();
});
test('stale in-flight backfill results are ignored after another disconnect',async()=>{
 let finish;const deferred=new Promise(resolve=>finish=resolve);
 const m=base({reviewer:()=>deferred,maxReviews:1,maxReconnects:2});
 m.session.start();m.sockets[0].open();m.sockets[0].ack();
 m.sockets[0].close();m.sockets[1].open();m.sockets[1].ack();
 m.sockets[1].close(); // invalidates the in-flight review
 assert.equal(m.sockets.length,3);
 finish(safeReview());await m.session.waitForReview();
 const r=m.session.snapshot();
 assert.equal(r.staleReviewResultsIgnored,1);
 assert.equal(r.backfillReviews.length,0);
 m.sockets[2].open();m.sockets[2].ack();
 assert.equal(m.session.snapshot().status,'BACKFILL_REVIEW_BUDGET_EXHAUSTED');
 m.session.stop();
});
test('a forged or internally inconsistent completed backfill never clears gap',async()=>{
 for(const bad of [
  {historyOverlapFound:false},{sourceOrderViolations:1},
  {replayCoverage:'UNVERIFIED'},{historyPages:3},
  {transactionLookups:7},{unresolved:[{status:'MISSING'}]},
  {advanceAuthorized:true},{buyQualified:true}
 ]){
  const m=base({reviewer:async()=>safeReview(bad)});
  m.session.start();m.sockets[0].open();m.sockets[0].ack();
  m.sockets[0].close();m.sockets[1].open();m.sockets[1].ack();
  const r=await m.session.waitForReview();
  assert.equal(r.phase,'GAP_UNRESOLVED',JSON.stringify(bad));
  assert.equal(r.backfillReviews[0].completeBoundedReview,false);
  assert.equal(r.checkpointAdvanceAuthorized,false);
  m.session.stop();
 }
});
test('stale stream causes capped reconnect; third disconnect exhausts budget',()=>{
 const m=base();m.session.start();m.sockets[0].open();m.sockets[0].ack();
 m.advance(15001);m.session.tick();
 assert.equal(m.session.snapshot().staleDetected,1);
 assert.equal(m.sockets.length,2);
 m.sockets[1].close();assert.equal(m.sockets.length,3);
 m.sockets[2].close();
 assert.equal(m.session.snapshot().status,'RECONNECT_BUDGET_EXHAUSTED');
 assert.equal(m.sockets.length,3);
});
test('mismatched subscription and pre-ack notification never enter candidate list',()=>{
 const m=base({maxReconnects:0});m.session.start();m.sockets[0].open();
 m.sockets[0].log();
 assert.equal(m.session.snapshot().status,'RECONNECT_BUDGET_EXHAUSTED');
 assert.equal(m.session.snapshot().candidates,0);
 const n=base({maxReconnects:0});n.session.start();n.sockets[0].open();
 n.sockets[0].ack();n.sockets[0].log(other,recorded.slot,999);
 assert.equal(n.session.snapshot().status,'RECONNECT_BUDGET_EXHAUSTED');
 assert.equal(n.session.snapshot().candidates,0);
});
test('finite candidate buffer and time budget stop safely, without alerts',()=>{
 const m=base({maxBuffered:1});m.session.start();m.sockets[0].open();m.sockets[0].ack();
 m.sockets[0].log(recorded.signature);m.sockets[0].log(other,recorded.slot+1);
 assert.equal(m.session.snapshot().status,'LIVE_BUFFER_OVERFLOW');
 assert.equal(m.session.snapshot().overflowed,1);
 const n=base({maxDurationMs:1000});n.session.start();n.advance(1000);n.session.tick();
 assert.equal(n.session.snapshot().status,'SESSION_TIME_BUDGET_EXHAUSTED');
});
test('real FLOAT historical fixture integrates via mocked RPC into reconnect, never live birth',async()=>{
 const socket=socketFactory(),calls=[];
 const fetcher=async(url,options)=>{
  const req=JSON.parse(options.body);calls.push(req);
  if(req.method==='getSignaturesForAddress')
   return {ok:true,json:async()=>({result:[
    {signature:recorded.signature,slot:recorded.slot,err:null,blockTime:1793224397},
    {signature:anchor,slot:recorded.slot-1,err:null,blockTime:1793224396}
   ]})};
  if(req.method==='getTransaction'){
   assert.equal(req.params[0],recorded.signature);
   return {ok:true,json:async()=>({result:recorded.transaction})};
  }
  throw Error('UNEXPECTED_METHOD');
 };
 const session=createLaunchlabReconnectSession({
  rpcUrl:'https://rpc.example',wsUrl:'wss://ws.example',
  WebSocketCtor:socket.WebSocketCtor,fetcher,
  now:()=>iso,monotonic:()=>0,
  checkpointSignature:anchor,checkpointSlot:recorded.slot-1,
  pageLimit:3,maxPages:2,maxTransactions:2
 });
 session.start();socket.sockets[0].open();socket.sockets[0].ack();
 socket.sockets[0].close();socket.sockets[1].open();socket.sockets[1].ack();
 const r=await session.waitForReview();
 assert.equal(r.status,'BOUNDED_HISTORY_REVIEW_COMPLETE');
 assert.equal(r.backfillReviews[0].replayBirthCount,1);
 assert.equal(r.backfillReviews[0].transactionLookups,1);
 assert.equal(calls.length,2);
 assert.equal(r.pendingLive.length,0);
 assert.equal(r.actualLiveAlertLatencyMs,null);
 assert.equal(r.checkpointAdvanceAuthorized,false);
 session.stop();
});
