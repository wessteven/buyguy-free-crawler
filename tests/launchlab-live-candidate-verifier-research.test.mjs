import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {verifyLaunchlabLiveCandidate} from '../src/launchlab-live-candidate-verifier-research.mjs';

const f=JSON.parse(readFileSync(new URL('./fixtures/float-launchlab-birth-2026-10-28.json',import.meta.url),'utf8'));
const received='2026-10-30T02:00:00.000Z';
const base={rpcUrl:'https://rpc.example',signature:f.signature,slot:f.slot,
 streamReceivedAt:received,streamReceivedMonotonicMs:100,
 now:()=> '2026-10-30T02:00:00.080Z',monotonic:()=>180};
const withSig=(sig=f.signature)=>({...f.transaction,
 transaction:{...f.transaction.transaction,signatures:[sig]}});
const run=(tx,extra={})=>verifyLaunchlabLiveCandidate({...base,
 transactionLoader:async()=>tx,...extra});
test('real FLOAT instruction fixture plus explicit signature proof verifies only a live candidate, never trade qualification',async()=>{
 const out=await run(withSig());
 assert.equal(out.classification,'LAUNCH_INSTRUCTION_VERIFIED');
 assert.equal(out.signature,f.signature);assert.equal(out.slot,f.slot);
 assert.equal(out.mint,f.expectedMint);assert.equal(out.curve,f.expectedCurve);
 assert.equal(out.noticeToVerificationMs,80);
 assert.equal(out.verifiedAt,'2026-10-30T02:00:00.080Z');
 assert.equal(out.origin,'POST_ACK_LIVE_LOG_HINT');
 assert.equal(out.actualLiveAlertLatencyMs,null);
 assert.equal(out.deviceDeliveredAt,null);
 assert.equal(out.independentBuyersVerified,null);
 assert.equal(out.marketCapUsd,null);
 assert.equal(out.liquidityUsd,null);
 assert.equal(out.buyQualified,false);
});
test('trimmed historical FLOAT fixture without signature field is not sufficient for verified live status',async()=>{
 const out=await run(f.transaction);
 assert.equal(out.classification,'TRANSACTION_SIGNATURE_MISSING_OR_MISMATCH');
 assert.equal(out.mint,null);
});
test('different RPC signature is not accepted as the requested live transaction',async()=>{
 const out=await run(withSig('C'.repeat(88)));
 assert.equal(out.classification,'TRANSACTION_SIGNATURE_MISSING_OR_MISMATCH');
});
test('wrong or unknown slot cannot be called a live birth',async()=>{
 for(const tx of [{...withSig(),slot:f.slot+1},{...withSig(),slot:null}]){
  const out=await run(tx);
  assert.equal(out.classification,'TRANSACTION_SLOT_MISMATCH_OR_UNKNOWN');
  assert.equal(out.mint,null);
 }
});
test('missing success flag, failed transaction, and absent result fail closed',async()=>{
 const noMeta={...withSig(),meta:{}};
 const failed={...withSig(),meta:{err:{InstructionError:[0,'Custom']}}};
 assert.equal((await run(noMeta)).classification,'TRANSACTION_RESULT_UNKNOWN');
 assert.equal((await run(failed)).classification,'TRANSACTION_FAILED');
 assert.equal((await run(null)).classification,'TRANSACTION_UNAVAILABLE');
});
test('non-initialize instruction does not become a birth even with valid signature and slot',async()=>{
 const tx=withSig();
 tx.transaction.message.instructions=[];
 const out=await run(tx);
 assert.equal(out.classification,'NO_SUPPORTED_LAUNCH_INSTRUCTION');
 assert.equal(out.mint,null);
});
test('RPC exceptions are sanitized and cannot leak provider keys',async()=>{
 const out=await verifyLaunchlabLiveCandidate({...base,
  transactionLoader:async()=>{throw Error('https://secret.example/?api-key=DO_NOT_LEAK')}});
 assert.equal(out.classification,'RPC_TRANSACTION_LOOKUP_FAILED');
 assert.ok(!JSON.stringify(out).includes('DO_NOT_LEAK'));
});
test('invalid monotonic clock cannot certify a live birth',async()=>{
 const out=await run(withSig(),{monotonic:()=>99});
 assert.equal(out.classification,'VERIFICATION_CLOCK_INVALID');
 assert.equal(out.mint,f.expectedMint); // evidence still decoded, but not valid timed verification
 assert.equal(out.noticeToVerificationMs,null);
});
test('reject insecure endpoints and ungrounded event identity without a lookup',async()=>{
 await assert.rejects(()=>verifyLaunchlabLiveCandidate({...base,rpcUrl:'http://unsafe'}),
  /VALID_LIVE_CANDIDATE/);
 await assert.rejects(()=>verifyLaunchlabLiveCandidate({...base,slot:0}),
  /VALID_LIVE_CANDIDATE/);
 await assert.rejects(()=>verifyLaunchlabLiveCandidate({...base,signature:'fake'}),
  /VALID_LIVE_CANDIDATE/);
});
