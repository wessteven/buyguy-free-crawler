import test from 'node:test';
import assert from 'node:assert/strict';
import {REVIEW_BATCH_LIMIT,makeReviewBatch} from '../src/goget-six-agent-batching.mjs';
const row={wallet:'A'.repeat(44),signature:'5'.repeat(88),
  sourceObservedAt:'2026-11-01T00:00:00Z',processedAt:'2026-11-01T00:01:00Z',
  schemaVersion:1,status:'RESEARCH_ONLY',decision:'RESEARCH_ONLY',mode:'ZERO_LLM',
  trace:[{agent:'SCOUT',status:'OBSERVED'}],findings:{},nextTasks:[]};
test('10-row batch uses at most 60 D1-bound values and no inline data',()=>{
 const q=makeReviewBatch(Array.from({length:REVIEW_BATCH_LIMIT},(_,i)=>({
  ...row,signature:String((i%9)+1).repeat(88)
 })));
 assert.equal(q.rows,10);assert.equal(q.params.length,60);
 assert.equal((q.sql.match(/\?/g)||[]).length,60);
 assert.ok(q.sql.startsWith('INSERT OR IGNORE'));
 assert.ok(!q.sql.includes(row.wallet));
});
test('over-cap batch rejected rather than constructing unsupported SQL',()=>{
 assert.throws(()=>makeReviewBatch([]),/REVIEW_BATCH_LIMIT/);
 assert.throws(()=>makeReviewBatch(Array.from({length:11},()=>row)),/REVIEW_BATCH_LIMIT/);
});
test('research result cannot contain real trade or model call status',()=>{
 const q=makeReviewBatch([row]);
 const doc=JSON.parse(q.params[5]);
 assert.equal(doc.realTrades,0);assert.equal(doc.modelCalls,0);
 assert.equal(doc.paperEntries,0);
});
test('untrusted SQL-like input stays in a bound parameter',()=>{
 const evil={...row,wallet:"'); DROP TABLE smart_wallet_webhook_events; --"};
 const q=makeReviewBatch([evil]);
 assert.ok(!q.sql.includes('DROP TABLE'));
 assert.equal(q.params[0],evil.wallet);
});
