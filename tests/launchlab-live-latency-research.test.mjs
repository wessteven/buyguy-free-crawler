import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {measureLaunchlabLive} from '../src/launchlab-live-latency-research.mjs';
import {LAUNCHLAB_PROGRAM} from '../src/launchlab-birth-research.mjs';

const recorded=JSON.parse(readFileSync(new URL('./fixtures/float-launchlab-birth-2026-10-28.json',import.meta.url),'utf8'));
const sig=recorded.signature;
const event=(subscription=56,signature=sig,slot=recorded.slot,failed=false)=>({
 jsonrpc:'2.0',method:'logsNotification',params:{subscription,
  result:{context:{slot},value:{signature,err:failed?{InstructionError:[0,'Custom']}:null,
   logs:['Program log: Instruction: InitializeV2']}}}
});
function mockWebSocket({events=[event()],reject=false,ack=true}={}){
 return class FakeWebSocket{
  constructor(){this.handlers={};this.readyState=1;this.sent=[];queueMicrotask(()=>this.emit('open',{}))}
  addEventListener(kind,callback){this.handlers[kind]=callback}
  emit(kind,v){this.handlers[kind]?.(v)}
  send(payload){
   const m=JSON.parse(payload);this.sent.push(m);
   if(m.method!=='logsSubscribe')return;
   assert.deepEqual(m.params[0].mentions,[LAUNCHLAB_PROGRAM]);
   assert.equal(m.params[1].commitment,'confirmed');
   queueMicrotask(()=>{
    if(reject)this.emit('message',{data:JSON.stringify({jsonrpc:'2.0',id:1,error:{code:-32601}})});
    else if(ack){
     this.emit('message',{data:JSON.stringify({jsonrpc:'2.0',id:1,result:56})});
     for(const e of events)this.emit('message',{data:JSON.stringify(e)});
    }
   });
  }
  close(){this.readyState=3;this.emit('close',{})}
 };
}
const fetcherFor=(tx=recorded.transaction)=>async(url,options)=>{
 const req=JSON.parse(options.body);
 assert.equal(req.method,'getTransaction');
 assert.equal(req.params[1].commitment,'confirmed');
 assert.equal(req.params[1].encoding,'jsonParsed');
 return {ok:true,json:async()=>({jsonrpc:'2.0',id:1,result:tx})};
};
const base={rpcUrl:'https://rpc.example',wsUrl:'wss://ws.example',durationMs:3000,
 maxLookups:1,maxNotifications:50,nowMs:()=>Date.now(),clock:()=>performance.now()};
test('a real recorded FLOAT init produces authenticated-ack LIVE receipt and RPC verification metrics',async()=>{
 const r=await measureLaunchlabLive({...base,WebSocketCtor:mockWebSocket(),
  fetcher:fetcherFor()});
 assert.equal(r.status,'LOOKUP_BUDGET_REACHED');
 assert.equal(r.subscriptionAcknowledged,true);
 assert.equal(r.notifications,1);
 assert.equal(r.lookupsStarted,1);
 assert.equal(r.lookupsFinished,1);
 assert.equal(r.findings.length,1);
 assert.equal(r.findings[0].mint,recorded.expectedMint);
 assert.equal(r.findings[0].curve,recorded.expectedCurve);
 assert.equal(r.findings[0].slot,recorded.slot);
 assert.ok(r.findings[0].streamReceivedAt.endsWith('Z'));
 assert.ok(r.findings[0].rpcLookupStartedAt.endsWith('Z'));
 assert.ok(r.findings[0].verifiedAt.endsWith('Z'));
 assert.ok(r.findings[0].noticeToVerificationMs>=0);
 assert.equal(r.findings[0].deviceDeliveredAt,null);
 assert.equal(r.findings[0].buyQualified,false);
 assert.equal(r.metrics.noticeToRpcVerified.count,1);
 assert.ok(r.bytesReceived>50);
 assert.equal(r.catchupPerformed,false);
 assert.equal(r.subscriptionGapUnknown,true);
});
test('failed tx and mismatched signatures cannot claim a verified birth',async()=>{
 const tx=structuredClone(recorded.transaction);
 tx.slot+=1;
 const mismatch=await measureLaunchlabLive({...base,
  WebSocketCtor:mockWebSocket(),fetcher:fetcherFor(tx)});
 assert.equal(mismatch.findings.length,0);
 assert.equal(mismatch.inconclusive[0].status,'SLOT_MISMATCH');
 const failed=structuredClone(recorded.transaction);
 failed.meta.err={InstructionError:[0,'Custom']};
 const error=await measureLaunchlabLive({...base,
  WebSocketCtor:mockWebSocket(),fetcher:fetcherFor(failed)});
 assert.equal(error.findings.length,0);
 assert.equal(error.inconclusive[0].status,'TRANSACTION_FAILED');
});
test('server rejects subscription: fail closed, no token or fake latency',async()=>{
 const r=await measureLaunchlabLive({...base,WebSocketCtor:mockWebSocket({reject:true}),
  fetcher:fetcherFor()});
 assert.equal(r.status,'SUBSCRIPTION_REJECTED');
 assert.equal(r.notifications,0);
 assert.equal(r.metrics.observedBirths,0);
 assert.equal(r.subscriptionAcknowledged,false);
});
test('notification mismatching subscribed id is rejected before RPC',async()=>{
 const r=await measureLaunchlabLive({...base,WebSocketCtor:mockWebSocket({
  events:[event(999)]}),fetcher:fetcherFor()});
 assert.equal(r.status,'SUBSCRIPTION_ID_MISMATCH');
 assert.equal(r.lookupsStarted,0);
 assert.equal(r.findings.length,0);
});
test('failed log hint and unrelated log require no RPC transaction lookup',async()=>{
 const r=await measureLaunchlabLive({...base,maxNotifications:2,
  WebSocketCtor:mockWebSocket({events:[
   event(56,sig,recorded.slot,true),
   {...event(),params:{...event().params,result:{
    ...event().params.result,value:{...event().params.result.value,logs:['Program log: Instruction: Buy']}}}}
  ]}),fetcher:fetcherFor()});
 assert.equal(r.status,'NOTIFICATION_BUDGET_REACHED');
 assert.equal(r.lookupsStarted,0);
 assert.equal(r.nonCandidateNotices,2);
 assert.equal(r.failedTransactionsIgnored,1);
});
test('provider downtime creates inconclusive event and no birth',async()=>{
 const r=await measureLaunchlabLive({...base,
  WebSocketCtor:mockWebSocket(),fetcher:async()=>{throw Error('secrets must not leak in logs')}});
 assert.equal(r.findings.length,0);
 assert.equal(r.inconclusive.length,1);
 assert.equal(r.inconclusive[0].status,'RPC_LOOKUP_FAILED');
 assert.equal(r.metrics.noticeToRpcVerified.count,0);
});
test('resource caps and unsafe endpoints are rejected',async()=>{
 await assert.rejects(()=>measureLaunchlabLive({...base,rpcUrl:'http://bad'}),/VALID_RESEARCH/);
 await assert.rejects(()=>measureLaunchlabLive({...base,wsUrl:'ws://bad'}),/VALID_RESEARCH/);
});
