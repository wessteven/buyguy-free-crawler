import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcileLaunchlabCheckpoint} from '../src/launchlab-reconnect-research.mjs';
import {LAUNCHLAB_PROGRAM} from '../src/launchlab-birth-research.mjs';
const sig=s=>s.repeat(88);
const anchor=sig('B');
const row=(s,slot,err=null)=>({signature:sig(s),slot,blockTime:1793290000,err});
function fakeFetch(pages){
 const requests=[];
 const fetcher=async(url,options)=>{
  const q=JSON.parse(options.body);
  requests.push({url,method:q.method,program:q.params[0],opts:q.params[1]});
  const p=pages[requests.length-1]||[];
  return p.status?{ok:false,status:p.status}:{ok:true,json:async()=>({result:p})};
 };
 return {requests,fetcher};
}
const base={rpcUrl:'https://rpc.example',checkpointSignature:anchor,checkpointSlot:1000,
 pageLimit:2,maxPages:3,requestedAt:()=>'2026-10-29T23:00:00.000Z'};
test('two RPC pages establish overlap only when checkpoint signature is actually included',async()=>{
 const mock=fakeFetch([[row('D',1003),row('C',1002)],[row('A',1001),row('B',1000)]]);
 const out=await reconcileLaunchlabCheckpoint({...base,fetcher:mock.fetcher});
 assert.equal(out.status,'CHECKPOINT_OVERLAP_VERIFIED');
 assert.equal(out.checkpointOverlapFound,true);
 assert.equal(out.pages,2);
 assert.equal(out.signaturesFetched,4);
 assert.deepEqual(out.candidates.map(x=>x.signature),[sig('A'),sig('C'),sig('D')]);
 assert.equal(out.notifiedBirthsVerified,0);
 assert.equal(out.buyQualified,false);
 assert.equal(out.launchInitializationEvidence,null);
 assert.equal(mock.requests.length,2);
 assert.equal(mock.requests[0].program,LAUNCHLAB_PROGRAM);
 assert.equal(mock.requests[0].method,'getSignaturesForAddress');
 assert.equal(mock.requests[0].opts.commitment,'confirmed');
 assert.equal(mock.requests[1].opts.before,sig('C'));
 assert.equal(mock.requests[1].opts.limit,2);
});
test('bounded page cap leaves gap unresolved and never claims coverage',async()=>{
 const mock=fakeFetch([[row('D',1004),row('C',1003)],[row('A',1002),row('F',1001)]]);
 const out=await reconcileLaunchlabCheckpoint({...base,maxPages:2,fetcher:mock.fetcher});
 assert.equal(out.status,'GAP_UNRESOLVED_PAGE_CAP');
 assert.equal(out.checkpointOverlapFound,false);
 assert.equal(out.pages,2);
 assert.equal(out.candidates.length,4);
});
test('provider rate limiting fails closed without automatic retry',async()=>{
 const mock=fakeFetch([{status:429}]);
 const out=await reconcileLaunchlabCheckpoint({...base,fetcher:mock.fetcher});
 assert.equal(out.status,'RATE_LIMITED');
 assert.equal(out.pages,1);
 assert.equal(out.checkpointOverlapFound,false);
 assert.equal(mock.requests.length,1);
});
test('truncated history cannot imply checkpoint continuity',async()=>{
 const mock=fakeFetch([[row('D',1004)]]);
 const out=await reconcileLaunchlabCheckpoint({...base,fetcher:mock.fetcher});
 assert.equal(out.status,'HISTORY_EXHAUSTED_BEFORE_CHECKPOINT');
 assert.equal(out.checkpointOverlapFound,false);
});
test('malformed RPC history and nonmonotonic slots invalidate overlap',async()=>{
 const bad=fakeFetch([[row('D',1003),{signature:'not-valid',slot:1002}]]);
 const a=await reconcileLaunchlabCheckpoint({...base,fetcher:bad.fetcher});
 assert.equal(a.status,'INVALID_RPC_HISTORY');
 const badOrder=fakeFetch([[row('D',1003),row('C',1004)],[row('B',1000)]]);
 const b=await reconcileLaunchlabCheckpoint({...base,fetcher:badOrder.fetcher});
 assert.equal(b.status,'CHECKPOINT_OVERLAP_WITH_ORDER_VIOLATION');
 assert.equal(b.sourceOrderViolations,1);
});
test('failed transactions are counted but never converted to observed token births',async()=>{
 const mock=fakeFetch([[row('D',1003,{InstructionError:[0,'Custom']}),row('B',1000)]]);
 const out=await reconcileLaunchlabCheckpoint({...base,fetcher:mock.fetcher});
 assert.equal(out.failedTxSignatures,1);
 assert.equal(out.candidates[0].status,'FAILED_TRANSACTION');
 assert.equal(out.notifiedBirthsVerified,0);
});
test('same checkpoint signature but wrong slot cannot count as continuity',async()=>{
 const m=fakeFetch([[row('D',1003),row('B',999)]]);
 const r=await reconcileLaunchlabCheckpoint({...base,fetcher:m.fetcher});
 assert.equal(r.status,'CHECKPOINT_SLOT_MISMATCH');
 assert.equal(r.checkpointOverlapFound,false);
});
test('failed checkpoint cannot establish a successful prior live event',async()=>{
 const m=fakeFetch([[row('D',1003),row('B',1000,{InstructionError:[0,'Custom']})]]);
 const r=await reconcileLaunchlabCheckpoint({...base,fetcher:m.fetcher});
 assert.equal(r.status,'CHECKPOINT_FAILED_TRANSACTION');
 assert.equal(r.checkpointOverlapFound,false);
});
test('duplicate signature in history invalidates source completeness',async()=>{
 const m=fakeFetch([[row('D',1003),row('D',1003)]]);
 const r=await reconcileLaunchlabCheckpoint({...base,fetcher:m.fetcher});
 assert.equal(r.status,'INVALID_RPC_HISTORY');
 assert.equal(r.duplicateSignatures,1);
 assert.equal(r.checkpointOverlapFound,false);
});
test('missing or malformed RPC error field invalidates signature history',async()=>{
 const m=fakeFetch([[{signature:sig('D'),slot:1003,blockTime:1793290000},row('B',1000)]]);
 const r=await reconcileLaunchlabCheckpoint({...base,fetcher:m.fetcher});
 assert.equal(r.status,'INVALID_RPC_HISTORY');
 assert.equal(r.checkpointOverlapFound,false);
 const n=fakeFetch([[{...row('D',1003),err:'bad'},row('B',1000)]]);
 const q=await reconcileLaunchlabCheckpoint({...base,fetcher:n.fetcher});
 assert.equal(q.status,'INVALID_RPC_HISTORY');
});
test('invalid endpoint or cursor is refused',async()=>{
 await assert.rejects(()=>reconcileLaunchlabCheckpoint({...base,rpcUrl:'http://rpc.example'}),/VALID_RPC/);
 await assert.rejects(()=>reconcileLaunchlabCheckpoint({...base,checkpointSignature:'TOMMY'}),/VALID_RPC/);
 await assert.rejects(()=>reconcileLaunchlabCheckpoint({...base,checkpointSlot:-1}),/CHECKPOINT_SLOT/);
});
