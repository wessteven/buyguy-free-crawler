import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {reconcileLaunchlabCheckpoint} from '../src/launchlab-reconnect-research.mjs';
import {reviewLaunchlabReconnectGap} from '../src/launchlab-gap-review-research.mjs';
import {createLaunchlabReconnectSession} from '../src/launchlab-reconnect-session-research.mjs';

const fixture=JSON.parse(readFileSync(new URL('./fixtures/float-launchlab-birth-2026-10-28.json',import.meta.url),'utf8'));
const anchor='B'.repeat(88);
const checkpointSlot=fixture.slot-1;
const row=(signature,slot)=>({signature,slot,err:null,blockTime:1793224397});
const iso='2026-10-30T04:00:00.000Z';
const rpcUrl='https://rpc.example';
const base={rpcUrl,checkpointSignature:anchor,checkpointSlot,
 pageLimit:3,maxPages:2,requestedAt:()=>iso};

test('already aborted signature-history review makes zero RPC calls',async()=>{
 const controller=new AbortController();controller.abort();
 let calls=0;
 const out=await reconcileLaunchlabCheckpoint({...base,signal:controller.signal,
  fetcher:async()=>{calls++;throw Error('MUST_NOT_CALL')}});
 assert.equal(out.status,'RPC_ABORTED');
 assert.equal(out.checkpointOverlapFound,false);
 assert.equal(out.pages,0);
 assert.equal(calls,0);
});
test('abort while parsing a history page prevents further pagination or overlap',async()=>{
 const controller=new AbortController();let calls=0;
 const out=await reconcileLaunchlabCheckpoint({...base,signal:controller.signal,pageLimit:1,
  fetcher:async()=>{
   calls++;return {ok:true,json:async()=>{controller.abort();
    return {result:[row(fixture.signature,fixture.slot)]}}};
  }});
 assert.equal(out.status,'RPC_ABORTED');
 assert.equal(out.checkpointOverlapFound,false);
 assert.equal(calls,1);
});
test('gap review abort during transaction lookup cannot produce replay completion or watermark',async()=>{
 const controller=new AbortController(),methods=[];
 const fetcher=async(url,options)=>{
  const req=JSON.parse(options.body);methods.push(req.method);
  assert.equal(options.signal,controller.signal);
  if(req.method==='getSignaturesForAddress')
   return {ok:true,json:async()=>({result:[
    row(fixture.signature,fixture.slot),row(anchor,checkpointSlot)]})};
  controller.abort();
  return {ok:true,json:async()=>({result:fixture.transaction})};
 };
 const out=await reviewLaunchlabReconnectGap({rpcUrl,checkpointSignature:anchor,
  checkpointSlot,pageLimit:3,maxPages:2,signal:controller.signal,
  now:()=>iso,fetcher});
 assert.deepEqual(methods,['getSignaturesForAddress','getTransaction']);
 assert.equal(out.status,'REVIEW_ABORTED');
 assert.equal(out.advanceAuthorized,false);
 assert.equal(out.watermarkCandidate,null);
 assert.equal(out.replayCoverage,'UNKNOWN');
 assert.equal(out.buyQualified,false);
});
function makeSession(reviewer,settings={}){
 const sockets=[];let ms=0;
 class Socket{
  constructor(){this.handlers={};sockets.push(this)}
  addEventListener(type,handler){this.handlers[type]=handler}
  emit(type,event={}){this.handlers[type]?.(event)}
  send(){}
  close(){this.emit('close')}
  ack(){this.emit('message',{data:JSON.stringify({jsonrpc:'2.0',id:1,result:77})})}
 }
 const session=createLaunchlabReconnectSession({
  rpcUrl,wsUrl:'wss://ws.example',WebSocketCtor:Socket,
  fetcher:async()=>{throw Error('NO_REAL_RPC')},
  reviewer,now:()=>iso,monotonic:()=>ms,
  checkpointSignature:anchor,checkpointSlot,
  maxReviewDurationMs:1000,maxDurationMs:10000,
  ...settings
 });
 const begin=()=>{
  session.start();sockets[0].emit('open');sockets[0].ack();
  sockets[0].close();sockets[1].emit('open');sockets[1].ack();
 };
 return {sockets,session,begin,advance:n=>{ms+=n}};
}
test('manually timed out review settles even if injected reviewer ignores AbortSignal forever',async()=>{
 let observedSignal=null;
 const m=makeSession(({signal})=>{observedSignal=signal;return new Promise(()=>{})});
 m.begin();await Promise.resolve();
 assert.equal(m.session.snapshot().phase,'BACKFILL');
 m.advance(1000);m.session.tick();
 const out=await m.session.waitForReview();
 assert.equal(observedSignal.aborted,true);
 assert.equal(out.backfillReviewAborts,1);
 assert.equal(out.backfillReviewTimeouts,1);
 assert.equal(out.phase,'GAP_UNRESOLVED');
 assert.equal(out.lastBackfillStatus,'REVIEW_ABORTED');
 assert.equal(out.backfillReviews[0].completeBoundedReview,false);
 assert.equal(out.checkpointAdvanceAuthorized,false);
 assert.equal(out.coverage,'UNKNOWN');
 m.session.stop();
});
test('disconnect cancels noncooperative historical reviewer without waiting for its RPC',async()=>{
 let signal=null,resolveLate;
 const m=makeSession(({signal:s})=>{
  signal=s;return new Promise(resolve=>{resolveLate=resolve});
 },{maxReconnects:2,maxReviews:1});
 m.begin();await Promise.resolve();
 m.sockets[1].close();
 const out=await m.session.waitForReview();
 assert.equal(signal.aborted,true);
 assert.equal(out.backfillReviewAborts,1);
 assert.equal(out.staleReviewResultsIgnored,1);
 assert.equal(out.backfillReviews.length,0);
 assert.equal(out.checkpointAdvanceAuthorized,false);
 resolveLate({status:'BOUNDED_REPLAY_CLASSIFIED',reconciliationStatus:'CHECKPOINT_OVERLAP_VERIFIED',
  historyOverlapFound:true,sourceOrderViolations:0,historyPages:1,transactionLookups:0,
  unresolved:[],replayCoverage:'BOUNDED_SIGNATURE_HISTORY_OVERLAP_AND_CLASSIFICATION_ONLY',
  advanceAuthorized:false,buyQualified:false,births:[]});
 await Promise.resolve();
 assert.equal(m.session.snapshot().backfillReviews.length,0);
 m.session.stop();
});
test('manual stop aborts pending backfill and does not wait on noncooperative provider',async()=>{
 let signal=null;
 const m=makeSession(({signal:s})=>{signal=s;return new Promise(()=>{})});
 m.begin();await Promise.resolve();
 m.session.stop();
 const out=await m.session.waitForReview();
 assert.equal(signal.aborted,true);
 assert.equal(out.phase,'STOPPED');
 assert.equal(out.backfillReviewAborts,1);
 assert.equal(out.checkpointAdvanceAuthorized,false);
});
test('no automatic review or live RPC is launched merely by initial subscription',()=>{
 const m=makeSession(()=>{throw Error('MUST_NOT_REVIEW')});
 m.session.start();m.sockets[0].emit('open');m.sockets[0].ack();
 assert.equal(m.session.snapshot().reviewCalls,0);
 assert.equal(m.session.snapshot().liveLookupsStarted,0);
 m.session.stop();
});
