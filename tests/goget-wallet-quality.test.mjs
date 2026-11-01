import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectWalletQuality,QUALITY_BOUNDS} from '../src/goget-wallet-quality.mjs';

const W1='4'.repeat(44),W2='7'.repeat(44),W3='8'.repeat(44);
const M1='5'.repeat(44),M2='6'.repeat(44),S1='3'.repeat(64);
const at='2026-11-01T08:00:00.000Z';
const source=(wallet,signature,fee=1,obj={schemaVersion:2,tokenTransfers:[],
  swapHints:null})=>({wallet,signature,fee_payer_observed:fee,
  evidence_json:JSON.stringify(obj)});
test('never treats dominant source volume as verified profitable copy-trading',()=>{
  const result=inspectWalletQuality({
    asOf:at,cohort:[{wallet:W1},{wallet:W2},{wallet:W3}],
    walletRows:[
      {wallet:W1,n:940,fee_payer_matched:940,swap_labelled:940,
        latest_at:'2026-11-01T07:59:00.000Z'},
      {wallet:W2,n:60,fee_payer_matched:3,swap_labelled:60,
        latest_at:'2026-11-01T07:45:00.000Z'}
    ],sampleRows:[source(W1,S1,1,{schemaVersion:2,
      tokenTransfers:[{mint:M1,to:W1}],
      swapHints:{tokenOutputs:[{mint:M2}]}})],
    pollRows:[{wallet:W2,classification:'AMM_INVOCATION_WITH_TOKEN_INCREASE_UNPRICED',n:2}],
    marketOutcomes:[{horizon_min:5,status:'MISSING_FUTURE_USD_QUOTE_COVERAGE',n:10}],
    agentRows:[{verdict:'RESEARCH_ONLY',n:1000}]
  });
  assert.equal(result.topTwoReceiptSharePct,100);
  assert.equal(result.wallets[0].shareOfCohortReceiptsPct,94);
  assert.equal(result.wallets[0].investigationPriority,'HIGH_VOLUME_UNVERIFIED_SPAM_RISK');
  assert.equal(result.wallets[0].sampledInboundOwnerHints,1);
  assert.equal(result.wallets[0].sampledSwapOutputHints,1);
  assert.equal(result.wallets[0].distinctSampledHintMints,2);
  assert.equal(result.wallets[0].independentlyVerifiedBuys,0);
  assert.equal(result.wallets[0].copyTradeEligible,false);
  assert.equal(result.wallets[0].realizedProfitUsd,null);
  assert.equal(result.wallets[1].investigationPriority,
    'SIGNED_AMM_ACTIVITY_NEEDS_ROUTE_AND_PNL_REPLAY');
  assert.equal(result.publicUsdOutcomes[0].status,'MISSING_FUTURE_USD_QUOTE_COVERAGE');
  assert.equal(result.verifiedRealizedCopyPnlUsd,null);
  assert.equal(result.latestSourceAgeMinutes,1);
  assert.equal(result.verifiedCopyTrades,0);
  assert.equal(result.realTrades,0);
  assert.equal(result.wallets[2].observations,0);
});
test('does not count source schema 1, invalid JSON, or duplicate event as token evidence',()=>{
  const result=inspectWalletQuality({
    asOf:at,cohort:[W1],
    walletRows:[{wallet:W1,n:5,fee_payer_matched:1,swap_labelled:5}],
    sampleRows:[
      source(W1,S1,1,{schemaVersion:2,tokenTransfers:[{mint:M1,to:W2}]}),
      source(W1,S1,1,{schemaVersion:2,tokenTransfers:[{mint:M1,to:W1}]}),
      source(W1,'9'.repeat(64),1,{schemaVersion:1,tokenTransfers:[{mint:M1,to:W1}]}),
      {wallet:W1,signature:'A'.repeat(64),evidence_json:'BROKEN'}
    ]
  });
  assert.equal(result.wallets[0].sampledReceipts,3);
  assert.equal(result.wallets[0].invalidSampleRows,2);
  assert.equal(result.wallets[0].sampledInboundOwnerHints,0);
  assert.equal(result.wallets[0].distinctSampledHintMints,0);
  assert.equal(result.sampleSkewWarning,true);
});
test('fee payer without same-wallet token output is not a documented buy',()=>{
  const result=inspectWalletQuality({cohort:[W1],asOf:at,
    walletRows:[{wallet:W1,n:1,fee_payer_matched:1,swap_labelled:1}],
    sampleRows:[source(W1,S1,1,{schemaVersion:2,
      tokenTransfers:[{mint:M1,to:W2}],
      swapHints:{tokenOutputs:[]}})]});
  assert.equal(result.wallets[0].feePayerMatchedPct,100);
  assert.equal(result.wallets[0].sampledInboundOwnerHints,0);
  assert.equal(result.wallets[0].sampledSwapOutputHints,0);
  assert.equal(result.wallets[0].independentlyVerifiedBuys,0);
});
test('empty cohort and all missing outcomes do not invent percentages or profit',()=>{
  const result=inspectWalletQuality({cohort:[],asOf:at,
    marketOutcomes:[{status:'MISSING_FUTURE_USD_QUOTE_COVERAGE',n:21,horizon_min:60}]});
  assert.equal(result.topTwoReceiptSharePct,null);
  assert.equal(result.latestSourceAgeMinutes,null);
  assert.equal(result.publicUsdOutcomes[0].count,21);
  assert.equal(result.verifiedRealizedCopyPnlUsd,null);
});
test('enforces strict input limits and exact wallet identities',()=>{
  assert.throws(()=>inspectWalletQuality({cohort:[W1,W1],asOf:at}),/INVALID_OR_DUPLICATE_WALLET/);
  assert.throws(()=>inspectWalletQuality({cohort:[W1],asOf:'not-time'}),/INVALID_ASOF_TIME/);
  assert.throws(()=>inspectWalletQuality({
    cohort:[W1],asOf:at,sampleRows:Array(QUALITY_BOUNDS.maxSampleRows+1).fill({})
  }),/COHORT_AUDIT_INPUT_LIMIT/);
});
