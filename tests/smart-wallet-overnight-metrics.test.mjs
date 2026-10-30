import test from 'node:test';
import assert from 'node:assert/strict';
import {quantile,summarizeNight} from '../src/smart-wallet-overnight-metrics.mjs';
test('empty overnight feed cannot invent latency, signals, or profits',()=>{
 const x=summarizeNight({now:'2026-10-30T14:30:00Z',webhookCount:0,pollCount:0});
 assert.equal(x.webhook.rows,0);assert.equal(x.webhook.roughP50Ms,null);
 assert.equal(x.efficacy.verifiedCopyProfitsUsd,null);assert.equal(x.efficacy.verifiedBuys,0);
});
test('counts exact signature overlap without claiming a genuine miss rate',()=>{
 const w=[{wallet:'A',signature:'1',observed_at:'2026-10-30T14:25:00Z',delay_ms:500,classification:'UNVERIFIED_ENHANCED_SWAP'}];
 const p=[{wallet:'A',signature:'1',observed_at:'2026-10-30T14:26:00Z',baseline:0,classification:'AMM_INVOCATION_WITH_TOKEN_INCREASE_UNPRICED'},
 {wallet:'A',signature:'2',observed_at:'2026-10-30T14:26:10Z',baseline:0,classification:'SIGNED_TX_NO_TOKEN_INCREASE'}];
 const r=summarizeNight({now:'2026-10-30T14:30:00Z',webhooks:w,polls:p,webhookCount:1,pollCount:2});
 assert.equal(r.comparison.sampleMatchedSignatures,1);assert.equal(r.comparison.matchedPctOfPollingSample,50);
 assert.match(r.comparison.caveat,/NOT a comprehensive/);assert.equal(r.webhook.roughP50Ms,null);
});
test('latency percentiles require enough independent receipts',()=>{
 assert.equal(quantile([1000,500,0],0.5),500);
 const w=Array.from({length:20},(_,i)=>({wallet:'A',signature:String(i),observed_at:'2026-10-30T15:00:00Z',delay_ms:1000+i*100,classification:'UNVERIFIED_ENHANCED_SWAP'}));
 const x=summarizeNight({now:'2026-10-30T15:30:00Z',webhooks:w,webhookCount:25});
 assert.equal(x.webhook.sampleLimited,true);assert.ok(x.webhook.roughP95Ms>0);
});
