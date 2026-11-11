import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const record=JSON.parse(readFileSync(new URL('../research/live-launchlab-latency-2026-10-29.json',import.meta.url),'utf8'));

test('real live launch proof records verified chain time, stream receive, and RPC verification distinctly',()=>{
 assert.equal(record.status,'TIME_BOUND');
 assert.equal(record.subscriptionAcknowledged,true);
 assert.equal(record.findings.length,1);
 const f=record.findings[0];
 assert.equal(f.slot,462855617);
 assert.equal(f.mint,'4aLmAx2hKomyZ5nyM3UgcKjPfFX8AMcV2Aev6gkwdm3w');
 assert.ok(Date.parse(f.chainBlockTime)<=Date.parse(f.streamReceivedAt));
 assert.ok(Date.parse(f.streamReceivedAt)<=Date.parse(f.verifiedAt));
 assert.ok(f.noticeToVerificationMs>=0&&f.noticeToVerificationMs<1000);
 assert.equal(record.verifiedBirths,1);
 assert.equal(record.prodWrites,0);
 assert.equal(record.trades,0);
 assert.equal(f.buyQualified,false);
});
test('post-birth DAS data must not be relabeled an at-notification safety pass',()=>{
 assert.ok(record.laterHeliusAssetObservation.lastIndexedSlot>record.findings[0].slot);
 assert.equal(record.laterHeliusAssetObservation.observedAfterBirth,true);
 assert.equal(record.laterHeliusAssetObservation.transferFeeBasisPoints,100);
 assert.equal(record.laterHeliusAssetObservation.marketCapUsd,null);
 assert.equal(record.laterHeliusAssetObservation.liquidityUsd,null);
 assert.equal(record.findings[0].feePayerIndependenceVerified,false);
});
test('public fixture contains no RPC credential URI',()=>{
 const s=JSON.stringify(record);
 assert.equal(s.includes('api-key='),false);
 assert.equal(s.includes('HELIUS_API_KEY'),false);
});
