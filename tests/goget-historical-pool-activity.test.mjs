import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyHistoricalPoolWindows,validateEvidenceTx,FORENSIC_LIMITS} from '../src/goget-historical-pool-activity.mjs';
const pool='7'.repeat(44),mint='5'.repeat(44),other='6'.repeat(44),sig='8'.repeat(88);
const due='2026-11-01T02:50:28.000Z';
const ts=Math.floor(Date.parse('2026-11-01T02:52:00Z')/1000);
const row={pool,mint,bucket:'2026-11-01T02:45:00Z',horizon_min:5,due_at:due};
const tx=(p={})=>({signature:sig,slot:465101001,timestamp:ts,type:'SWAP',
  accountData:[{account:pool,tokenBalanceChanges:[]}],
  tokenTransfers:[{mint,tokenAmount:1000},{mint:other,tokenAmount:1}],
  transactionError:null,...p});
const review=(txs,opts={})=>classifyHistoricalPoolWindows([row],txs,{pool,mint,
 historyComplete:true,asOf:'2026-11-04T08:40:00Z',...opts})[0];
test('classified swap with correct pool and mint is evidence only, not a price',()=>{
 const result=review([tx()]);
 assert.equal(result.classification,'HELIUS_LABELED_SWAP_POOL_AND_MINT_HINT');
 assert.equal(result.exactMintHintedSwaps,1);
 assert.equal(result.usdPriceReconstructed,false);
 assert.equal(result.signatures[0].signature,sig);
});
test('unrelated pool or unrelated token must not fabricate matching swaps',()=>{
 const noPool=review([tx({accountData:[{account:other}],tokenTransfers:[{mint}]})]);
 assert.equal(noPool.classification,'NO_MATCHING_TX_IN_HELIUS_ENHANCED_HISTORY');
 const noMint=review([tx({tokenTransfers:[{mint:other}]})]);
 assert.equal(noMint.classification,'LABELED_POOL_SWAP_MINT_UNVERIFIED');
});
test('empty complete history is not definitive proof of no trades',()=>{
 const result=review([]);
 assert.equal(result.classification,'NO_MATCHING_TX_IN_HELIUS_ENHANCED_HISTORY');
 assert.match(result.caveat,/not a complete raw-chain proof/);
 assert.equal(result.usdPriceReconstructed,false);
});
test('partial history must never be called a complete absence, even if swap hint exists',()=>{
 assert.equal(review([],{historyComplete:false}).classification,
   'INCOMPLETE_PAGINATION_CANNOT_RULE_OUT_SWAPS');
 assert.equal(review([tx()],{historyComplete:false}).classification,
   'INCOMPLETE_PAGINATION_CANNOT_RULE_OUT_SWAPS');
 assert.equal(review([tx()],{providerFailure:'HELIUS_HTTP_429'}).classification,
   'INCOMPLETE_PROVIDER_HISTORY');
});
test('unknown transactions are separate from complete non-swap history',()=>{
 assert.equal(review([tx({type:'UNKNOWN'})]).classification,'UNCLASSIFIED_POOL_ACTIVITY');
 assert.equal(review([tx({type:'TRANSFER'})]).classification,'NON_SWAP_POOL_ACTIVITY');
});
test('must not use transactions outside original target plus ten minutes',()=>{
 const before=Math.floor(Date.parse('2026-11-01T02:49:00Z')/1000);
 assert.throws(()=>review([tx({timestamp:before})]),/OUT_OF_REQUESTED_TIME_WINDOW/);
});
test('reject invalid source, repeated identity and time-filter deviations',()=>{
 assert.throws(()=>validateEvidenceTx({signature:'bad'},{
   pool,fromMs:Date.parse(due),toMs:Date.parse(due)+600000
 }),/TRANSACTION_IDENTITY_UNVERIFIED/);
 assert.throws(()=>review([tx(),tx()]),/DUPLICATE_HELIUS_PAGE_SIGNATURE/);
 assert.throws(()=>review([tx({timestamp:ts-86400})]),/OUT_OF_REQUESTED_TIME_WINDOW/);
 assert.throws(()=>classifyHistoricalPoolWindows([{...row,pool:other}],[tx()],{
   pool,mint,historyComplete:true}),/ROW_POOL_MINT_OR_TIME_MISMATCH/);
 assert.equal(FORENSIC_LIMITS.maxApiCallsPerBatch,30);
});
