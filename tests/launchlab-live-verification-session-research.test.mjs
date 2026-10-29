import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createLaunchlabReconnectSession} from '../src/launchlab-reconnect-session-research.mjs';
const f=JSON.parse(readFileSync(new URL('./fixtures/float-launchlab-birth-2026-10-28.json',import.meta.url),'utf8'));
const other='C'.repeat(88),third='D'.repeat(88),fourth='E'.repeat(88);
const signed=()=>({...f.transaction,
 transaction:{...f.transaction.transaction,signatures:[f.signature]}});
function setup(options={}){
 const sockets=[],calls=[];let ms=100;
 class Socket{
  constructor(){this.handlers={};sockets.push(this)}
  addEventListener(type,fn){this.handlers[type]=fn}
  send(x){this.sent=JSON.parse(x)}
  emit(type,data={}){this.handlers[type]?.(data)}
  open(){this.emit('open')}
  ack(){this.emit('message',{data:JSON.stringify({id:1,result:77})})}
  log(signature=f.signature,slot=f.slot){
   this.emit('message',{data:JSON.stringify({method:'logsNotification',
    params:{subscription:77,result:{context:{slot},
     value:{signature,err:null,logs:['Program log: Instruction: InitializeV2']}}}})});
  }
  close(){this.emit('close')}
 }
 const fetcher=async(url,request)=>{
  const x=JSON.parse(request.body);calls.push(x);
  return {ok:true,json:async()=>({result:x.params[0]===f.signature?signed():null})};
 };
 const session=createLaunchlabReconnectSession({
  rpcUrl:'https://rpc.example',wsUrl:'wss://ws.example',
  WebSocketCtor:Socket,fetcher,
  now:()=> '2026-10-30T02:00:00.080Z',
  monotonic:()=>ms,checkpointSignature:other,checkpointSlot:f.slot-1,
  ...options
 });
 const activate=()=>{session.start();sockets[0].open();sockets[0].ack()};
 return {session,sockets,calls,activate,advance:n=>{ms+=n}};
}
test('manual opt-in live verification uses exactly one RPC call and preserves unknown trading evidence',async()=>{
 const m=setup();m.activate();m.sockets[0].log();
 assert.equal(m.calls.length,0); // notices NEVER trigger automatic provider calls
 m.advance(80);
 const r=await m.session.verifyPendingLive();
 assert.equal(m.calls.length,1);
 assert.equal(m.calls[0].method,'getTransaction');
 assert.equal(m.calls[0].params[0],f.signature);
 assert.equal(r.liveLookupsStarted,1);assert.equal(r.liveLookupsFinished,1);
 assert.equal(r.liveVerifiedBirths,1);
 assert.equal(r.pendingLive[0].classification,'LAUNCH_INSTRUCTION_VERIFIED');
 assert.equal(r.pendingLive[0].mint,f.expectedMint);
 assert.equal(r.pendingLive[0].noticeToVerificationMs,80);
 assert.equal(r.pendingLive[0].actualLiveAlertLatencyMs,null);
 assert.equal(r.pendingLive[0].buyQualified,false);
 assert.equal(r.coverage,'UNKNOWN');assert.equal(r.checkpointAdvanceAuthorized,false);
 await m.session.verifyPendingLive();
 assert.equal(m.calls.length,1); // no repeat
 m.session.stop();
});
test('verification budget and concurrency are capped and never retried automatically',async()=>{
 let active=0,maxActive=0,release=[];
 const m=setup({maxLiveLookups:2,maxLiveConcurrent:2,maxBuffered:10,
  liveVerifier:async({signature,slot})=>{
   active++;maxActive=Math.max(maxActive,active);
   await new Promise(resolve=>release.push(resolve));active--;
   return {signature,slot,classification:'TRANSACTION_UNAVAILABLE',
    buyQualified:false,actualLiveAlertLatencyMs:null,deviceDeliveredAt:null,rpcCalls:1,
    verifiedAt:'2026-10-30T02:00:00.080Z',noticeToVerificationMs:1};
  }});
 m.activate();m.sockets[0].log(f.signature);m.sockets[0].log(other,f.slot+1);
 m.sockets[0].log(third,f.slot+2);
 const p=m.session.verifyPendingLive();
 assert.equal(maxActive,2);
 assert.equal(m.session.snapshot().liveLookupsStarted,2);
 release.forEach(x=>x());await p;
 const r=m.session.snapshot();
 assert.equal(r.liveLookupsStarted,2);assert.equal(r.liveLookupsFinished,2);
 assert.equal(r.liveVerifiedBirths,0);assert.equal(r.liveInconclusive,2);
 assert.equal(r.pendingLive[2].verificationAttempted,false);
 await m.session.verifyPendingLive();
 assert.equal(m.session.snapshot().liveLookupsStarted,2);
 assert.equal(m.calls.length,0);m.session.stop();
});
test('disconnect while lookup pending discards stale verified result and never revives a closed session',async()=>{
 let finish;
 const m=setup({maxReconnects:0,liveVerifier:()=>new Promise(resolve=>{finish=resolve})});
 m.activate();m.sockets[0].log();
 const p=m.session.verifyPendingLive();
 m.sockets[0].close();
 assert.equal(m.session.snapshot().phase,'STOPPED');
 finish({signature:f.signature,slot:f.slot,classification:'LAUNCH_INSTRUCTION_VERIFIED',
  evidence:'SUCCESSFUL_ANCHOR_INITIALIZE_DISCRIMINATOR_AND_IDL_ACCOUNTS',
  mint:f.expectedMint,curve:f.expectedCurve,quoteMint:'So11111111111111111111111111111111111111112',
  verifiedAt:'2026-10-30T02:00:00.080Z',noticeToVerificationMs:10,
  buyQualified:false,actualLiveAlertLatencyMs:null,deviceDeliveredAt:null,rpcCalls:1});
 await p;
 const r=m.session.snapshot();
 assert.equal(r.liveVerifiedBirths,0);
 assert.equal(r.staleLiveVerificationResultsIgnored,1);
 assert.equal(r.pendingLive[0].classification,'UNVERIFIED_LOG_HINT');
 assert.equal(r.pendingLive[0].verificationStatus,'STALE_RESULT_IGNORED');
});
test('gap unresolved or in-flight historical backfill prevents live candidate verification',async()=>{
 let finish;
 const m=setup({reviewer:()=>new Promise(resolve=>{finish=resolve})});
 m.activate();m.sockets[0].log();
 m.sockets[0].close();m.sockets[1].open();m.sockets[1].ack();
 assert.equal(m.session.snapshot().phase,'BACKFILL');
 const r=await m.session.verifyPendingLive();
 assert.equal(r.liveLookupsStarted,0);
 assert.equal(r.liveVerificationStatus,'BLOCKED_CLOSED_OR_UNRESOLVED_GAP');
 finish({status:'HISTORY_GAP_UNRESOLVED'});
 await m.session.waitForReview();
 assert.equal(m.session.snapshot().phase,'GAP_UNRESOLVED');
 await m.session.verifyPendingLive();
 assert.equal(m.session.snapshot().liveLookupsStarted,0);
 m.session.stop();
});
test('forged verifier output with buyQualified=true cannot become verified evidence',async()=>{
 const m=setup({liveVerifier:async({signature,slot})=>({
  signature,slot,classification:'LAUNCH_INSTRUCTION_VERIFIED',
  mint:f.expectedMint,curve:f.expectedCurve,quoteMint:'So11111111111111111111111111111111111111112',
  evidence:'SUCCESSFUL_ANCHOR_INITIALIZE_DISCRIMINATOR_AND_IDL_ACCOUNTS',
  verifiedAt:'2026-10-30T02:00:00.080Z',noticeToVerificationMs:10,
  buyQualified:true,actualLiveAlertLatencyMs:null,deviceDeliveredAt:null,rpcCalls:1
 })});
 m.activate();m.sockets[0].log();
 const r=await m.session.verifyPendingLive();
 assert.equal(r.pendingLive[0].verificationStatus,'INVALID_VERIFIER_RESULT');
 assert.equal(r.pendingLive[0].mint,null);
 assert.equal(r.liveVerifiedBirths,0);m.session.stop();
});
test('simultaneous manual verify requests do not double-spend RPC budget',async()=>{
 let finish;const m=setup({liveVerifier:()=>new Promise(resolve=>{finish=resolve})});
 m.activate();m.sockets[0].log();
 const p=m.session.verifyPendingLive();
 const q=m.session.verifyPendingLive();
 assert.equal(m.session.snapshot().liveLookupsStarted,1);
 finish({signature:f.signature,slot:f.slot,classification:'TRANSACTION_UNAVAILABLE',
  buyQualified:false,actualLiveAlertLatencyMs:null,deviceDeliveredAt:null,rpcCalls:1});
 await Promise.all([p,q]);
 assert.equal(m.session.snapshot().liveLookupsStarted,1);m.session.stop();
});
