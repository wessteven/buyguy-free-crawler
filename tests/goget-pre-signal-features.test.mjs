import test from 'node:test';
import assert from 'node:assert/strict';
import {detectSignalWindows,attachAsOfQuotes,SIGNAL_LIMITS} from '../src/goget-pre-signal-features.mjs';

const walletA='8LJWz8uW51u6kL2XBZ6cKYBngnXCpxQjUZRbwKLfVYp4';
const walletB='whamNNP9tHoxLg92yHvJPdYhghEoCg1qYTsh5a2oLbx';
const mintA='3bpm71ztUtB66EsMdYHShV5DLm4wssEfK4YrnKysmoon';
const mintB='84vc5bnWKH1ndVdKxGpMrqfoEMDBhfkFoV4boYZkoMcu';
const now=Date.parse('2026-11-01T01:35:00Z');
const at=min=>new Date(now-min*60000).toISOString();
const mk=(mint,who,id,minutes,opts={})=>({
  wallet:who,signature:String(id).repeat(88),slot:460000000+id,
  observed_at:at(minutes),fee_payer_observed:opts.feePayer?1:0,
  evidence_json:JSON.stringify({schemaVersion:2,
    tokenTransfers:[{mint,to:who,tokenAmount:'25'}],
    swapHints:{tokenOutputs:[{mint,amount:'25'}]}})
});
test('two-wallet fresh burst is research anomaly, not a trade signal',()=>{
  const x=detectSignalWindows([
    mk(mintA,walletA,1,12,{feePayer:true}),
    mk(mintA,walletB,2,8),
    mk(mintA,walletA,3,2),
    mk(mintA,walletB,4,44),
    mk(mintB,walletA,5,3)
  ],{now});
  const a=x.snapshots.find(z=>z.mint===mintA);
  assert.equal(a.category,'MULTIWALLET_ACTIVITY_ACCELERATION');
  assert.equal(a.recentSignatures,3);
  assert.equal(a.priorSignatures,1);
  assert.equal(a.distinctWallets,2);
  assert.equal(a.feePayerWallets,1);
  assert.equal(a.intensity,15);
  assert.equal(a.sampleKind,'POTENTIAL_SIGNAL');
  assert.equal(a.independentlyVerifiedBuy,false);
  const b=x.snapshots.find(z=>z.mint===mintB);
  assert.equal(b.sampleKind,'CONTROL');
  assert.equal(x.modelCalls,0);
  assert.equal(x.heliusCalls,0);
  assert.equal(x.tradeOrders,0);
});
test('one wallet repeated activity is never promoted to multiwallet',()=>{
 const x=detectSignalWindows([mk(mintA,walletA,1,9),mk(mintA,walletA,2,6),
  mk(mintA,walletA,3,3)],{now});
 assert.equal(x.snapshots[0].category,'SINGLE_WALLET_ACTIVITY_ACCELERATION');
 assert.equal(x.snapshots[0].distinctWallets,1);
});
test('duplicate signature for two wallets cannot inflate transaction count',()=>{
 const x=detectSignalWindows([mk(mintA,walletA,7,5),mk(mintA,walletB,7,5)],{now});
 assert.equal(x.snapshots[0].recentSignatures,1);
 assert.equal(x.snapshots[0].distinctWallets,2);
 assert.equal(x.snapshots[0].sampleKind,'CONTROL');
});
test('older, future, malformed and v1 source are excluded',()=>{
 const x=detectSignalWindows([mk(mintA,walletA,1,92),mk(mintA,walletA,2,-1),
  {...mk(mintA,walletA,3,3),evidence_json:'{bad'},
  {...mk(mintA,walletA,4,1),evidence_json:JSON.stringify({schemaVersion:1})}],{now});
 assert.equal(x.snapshots.length,0);
 assert.equal(x.invalidSourceRows,4);
});
test('as-of quote refuses future, old, mismatched pool or missing quote',()=>{
 const s=detectSignalWindows([mk(mintA,walletA,1,2)],{now}).snapshots;
 const pool='Gf3HJhA4iJubBpKBLqTXikUT9E3sv6wGhhZ3EahAqQxk';
 const testQuotes=[
  {mint:mintA,pool,minute:at(-1),price_sol:0.00005},
  {mint:mintA,pool,minute:at(4),price_sol:0.00004},
  {mint:mintA,pool,minute:at(2),price_sol:0.00003},
  {mint:mintA,pool:'bad',minute:at(1),price_sol:500}
 ];
 const out=attachAsOfQuotes(s,testQuotes,{now});
 assert.equal(out[0].quote.priceSol,0.00003);
 assert.equal(out[0].quoteStatus,'MATCHED_ASOF_POOL_NATIVE_QUOTE');
 const absent=attachAsOfQuotes(s,[testQuotes[0]],{now});
 assert.equal(absent[0].quote,null);
});
test('larger than 1200 source rows fails closed; exactly cap is incomplete',()=>{
 assert.throws(()=>detectSignalWindows(Array(1201).fill(mk(mintA,walletA,1,3)),{now}),
   /SOURCE_ROWS_EXCEEDED/);
 const x=detectSignalWindows(Array(1200).fill(mk(mintA,walletA,1,3)),{now});
 assert.equal(x.sourceCoverage,'AT_CAP_CANNOT_ASSERT_COMPLETE_WINDOW');
});
test('excluded native and stablecoin mints cannot be falsely promoted',()=>{
 const stable=SIGNAL_LIMITS.excludedMints[1];
 const x=detectSignalWindows([mk(stable,walletA,1,2),mk(stable,walletB,2,1),
  mk(stable,walletA,3,1)],{now});
 assert.equal(x.snapshots.length,0);
});
