import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {reviewLaunchlabReconnectGap} from '../src/launchlab-gap-review-research.mjs';
import {LAUNCHLAB_PROGRAM} from '../src/launchlab-birth-research.mjs';

const recorded=JSON.parse(readFileSync(new URL('./fixtures/float-launchlab-birth-2026-10-28.json',import.meta.url),'utf8'));
const anchor='B'.repeat(88),other='C'.repeat(88),third='D'.repeat(88);
const row=(signature,slot,err=null)=>({signature,slot,blockTime:1793224397,err});
const checkpoint=row(anchor,recorded.slot-2);
const fixedTime='2026-10-29T12:00:00.000Z';
const base={rpcUrl:'https://rpc.example',checkpointSignature:anchor,
 checkpointSlot:checkpoint.slot,now:()=>fixedTime,pageLimit:3,maxPages:2,maxTransactions:6};
function mock({pages=[[row(recorded.signature,recorded.slot),checkpoint]],
 transactions={[recorded.signature]:recorded.transaction},httpStatus=null}={}){
 const calls=[];
 const fetcher=async(url,opts)=>{
  const body=JSON.parse(opts.body);calls.push(body);
  if(httpStatus)return {ok:false,status:httpStatus};
  if(body.method==='getSignaturesForAddress'){
   assert.equal(body.params[0],LAUNCHLAB_PROGRAM);
   return {ok:true,json:async()=>({result:pages[calls.filter(c=>c.method==='getSignaturesForAddress').length-1]||[]})};
  }
  assert.equal(body.method,'getTransaction');
  return {ok:true,json:async()=>({result:transactions[body.params[0]]??null})};
 };
 return {calls,fetcher};
}
test('recorded real FLOAT initialization replays with exact mint and zero invented live latency',async()=>{
 const m=mock();
 const out=await reviewLaunchlabReconnectGap({...base,fetcher:m.fetcher});
 assert.equal(out.status,'BOUNDED_REPLAY_CLASSIFIED');
 assert.equal(out.replayCoverage,'BOUNDED_SIGNATURE_HISTORY_OVERLAP_AND_CLASSIFICATION_ONLY');
 assert.equal(out.transactionLookups,1);
 assert.equal(out.births.length,1);
 assert.equal(out.births[0].mint,recorded.expectedMint);
 assert.equal(out.births[0].curve,recorded.expectedCurve);
 assert.equal(out.births[0].chainTime,'2026-10-28T21:53:17.000Z');
 assert.equal(out.births[0].observedVia,'HISTORICAL_RPC_REPLAY');
 assert.equal(out.births[0].liveObservedAt,null);
 assert.equal(out.births[0].actualLiveAlertLatencyMs,null);
 assert.equal(out.actualLiveAlertLatencyMs,null);
 assert.equal(out.births[0].marketCapUsd,null);
 assert.equal(out.births[0].independentBuyers,null);
 assert.equal(out.buyQualified,false);
 assert.equal(out.advanceAuthorized,false);
 assert.equal(out.watermarkCandidate.signature,recorded.signature);
 assert.equal(m.calls.filter(c=>c.method==='getTransaction').length,1);
});
test('unverified live seen duplicate suppresses lookup but cannot authorize checkpoint advance',async()=>{
 const m=mock();
 const out=await reviewLaunchlabReconnectGap({...base,fetcher:m.fetcher,
  liveSeenSignatures:[recorded.signature,recorded.signature]});
 assert.equal(out.liveDuplicateSuppressed,1);
 assert.equal(out.transactionLookups,0);
 assert.equal(out.status,'REPLAY_INCOMPLETE');
 assert.equal(out.watermarkCandidate,null);
 assert.equal(out.unresolved[0].status,'LIVE_SEEN_BUT_NOT_REVERIFIED');
});
test('max transaction lookup cap never silently drops extra history candidates',async()=>{
 const m=mock({pages:[[row(third,recorded.slot+1),row(recorded.signature,recorded.slot),checkpoint]],
  transactions:{[recorded.signature]:recorded.transaction,[third]:recorded.transaction}});
 const out=await reviewLaunchlabReconnectGap({...base,fetcher:m.fetcher,maxTransactions:1});
 assert.equal(out.status,'REPLAY_INCOMPLETE');
 assert.equal(out.transactionLookups,1);
 assert.equal(out.unresolved.length,1);
 assert.equal(out.unresolved[0].status,'TRANSACTION_LOOKUP_BUDGET_EXHAUSTED');
 assert.equal(out.watermarkCandidate,null);
});
test('provider 429 returns explicit unresolved history and zero transaction requests',async()=>{
 const m=mock({httpStatus:429});
 const out=await reviewLaunchlabReconnectGap({...base,fetcher:m.fetcher});
 assert.equal(out.status,'HISTORY_GAP_UNRESOLVED');
 assert.equal(out.reconciliationStatus,'RATE_LIMITED');
 assert.equal(out.transactionLookups,0);
 assert.equal(out.historyOverlapFound,false);
});
test('no overlap after exhausted history never becomes classified',async()=>{
 const m=mock({pages:[[row(recorded.signature,recorded.slot)]]});
 const out=await reviewLaunchlabReconnectGap({...base,fetcher:m.fetcher});
 assert.equal(out.status,'HISTORY_GAP_UNRESOLVED');
 assert.equal(out.reconciliationStatus,'HISTORY_EXHAUSTED_BEFORE_CHECKPOINT');
});
test('nonmonotonic slots prevent any classification even if checkpoint found',async()=>{
 const m=mock({pages:[[row(recorded.signature,recorded.slot),row(other,recorded.slot+1),checkpoint]]});
 const out=await reviewLaunchlabReconnectGap({...base,fetcher:m.fetcher});
 assert.equal(out.status,'HISTORY_GAP_UNRESOLVED');
 assert.equal(out.reconciliationStatus,'CHECKPOINT_OVERLAP_WITH_ORDER_VIOLATION');
 assert.equal(out.transactionLookups,0);
});
test('history-marked failed transaction needs no additional RPC and is not a birth',async()=>{
 const m=mock({pages:[[row(other,recorded.slot,{InstructionError:[0,'Custom']}),checkpoint]]});
 const out=await reviewLaunchlabReconnectGap({...base,fetcher:m.fetcher});
 assert.equal(out.status,'BOUNDED_REPLAY_CLASSIFIED');
 assert.equal(out.failedHistoryTransactions,1);
 assert.equal(out.transactionLookups,0);
 assert.equal(out.births.length,0);
 assert.equal(out.nonBirths[0].status,'FAILED_TRANSACTION');
});
test('missing transaction cannot become an observed launch or advance a checkpoint',async()=>{
 const m=mock({transactions:{}});
 const out=await reviewLaunchlabReconnectGap({...base,fetcher:m.fetcher});
 assert.equal(out.status,'REPLAY_INCOMPLETE');
 assert.equal(out.births.length,0);
 assert.equal(out.unresolved[0].status,'TRANSACTION_UNAVAILABLE');
 assert.equal(out.watermarkCandidate,null);
});
test('transaction slot mismatch fails closed',async()=>{
 const m=mock({transactions:{[recorded.signature]:{...recorded.transaction,slot:recorded.slot+1}}});
 const out=await reviewLaunchlabReconnectGap({...base,fetcher:m.fetcher});
 assert.equal(out.status,'REPLAY_INCOMPLETE');
 assert.equal(out.unresolved[0].status,'TRANSACTION_SLOT_MISMATCH');
});
test('failed on-chain transaction never becomes a verified birth',async()=>{
 const m=mock({transactions:{[recorded.signature]:{...recorded.transaction,meta:{err:{InstructionError:[0,'Custom']}}}}});
 const out=await reviewLaunchlabReconnectGap({...base,fetcher:m.fetcher});
 assert.equal(out.status,'BOUNDED_REPLAY_CLASSIFIED');
 assert.equal(out.births.length,0);
 assert.equal(out.nonBirths[0].status,'TRANSACTION_FAILED');
});
test('unknown transaction success status cannot be classified as birth',async()=>{
 const m=mock({transactions:{[recorded.signature]:{...recorded.transaction,meta:{}}}});
 const out=await reviewLaunchlabReconnectGap({...base,fetcher:m.fetcher});
 assert.equal(out.status,'REPLAY_INCOMPLETE');
 assert.equal(out.unresolved[0].status,'TRANSACTION_RESULT_UNKNOWN');
});
test('explicit undefined or string RPC error status is not evidence of a successful birth',async()=>{
 for(const err of [undefined,'success']){
  const m=mock({transactions:{[recorded.signature]:{...recorded.transaction,meta:{err}}}});
  const out=await reviewLaunchlabReconnectGap({...base,fetcher:m.fetcher});
  assert.equal(out.status,'REPLAY_INCOMPLETE');
  assert.equal(out.births.length,0);
  assert.equal(out.unresolved[0].status,'TRANSACTION_RESULT_UNKNOWN');
 }
});
test('malformed inputs and non-UTC clocks are rejected before RPC use',async()=>{
 const m=mock();
 await assert.rejects(()=>reviewLaunchlabReconnectGap({...base,fetcher:m.fetcher,
  checkpointSlot:0}),/VALID_BOUNDED/);
 await assert.rejects(()=>reviewLaunchlabReconnectGap({...base,fetcher:m.fetcher,
  liveSeenSignatures:['INVALID']}),/VALID_BOUNDED/);
 await assert.rejects(()=>reviewLaunchlabReconnectGap({...base,fetcher:m.fetcher,
  now:()=> '2026-10-29T12:00:00+00:00'}),/UTC_REVIEW_CLOCK/);
 assert.equal(m.calls.length,0);
});
test('empty new history with checkpoint alone yields unchanged unpersisted watermark',async()=>{
 const m=mock({pages:[[checkpoint]]});
 const out=await reviewLaunchlabReconnectGap({...base,fetcher:m.fetcher});
 assert.equal(out.status,'BOUNDED_REPLAY_CLASSIFIED');
 assert.equal(out.births.length,0);
 assert.equal(out.watermarkCandidate.status,'UNCHANGED_NO_NEW_SIGNATURES');
 assert.equal(out.advanceAuthorized,false);
});
