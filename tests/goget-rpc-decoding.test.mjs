import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {GAP_WALLETS} from '../src/goget-wallet-gap-wave.mjs';
import {DECODE_BOUNDS as B,assertExactSourceRoster,allowedDecoderReservation,
 inspectExactTransaction,reservedForRemainingForwardCycles}
 from '../src/goget-rpc-decoding.mjs';
const wallet=GAP_WALLETS[0],sig='5'.repeat(88),at='2026-11-05T10:00:00.000Z';
const source={wallet,signature:sig,slot:444444444,failed:0,observed_at:at};
const other='So11111111111111111111111111111111111111112';
const message={accountKeys:[{pubkey:wallet,signer:true},{pubkey:other,signer:false}],
 instructions:[{programId:other}]};
const response={slot:source.slot,transaction:{signatures:[sig],message},
 meta:{err:null,preTokenBalances:[],postTokenBalances:[],innerInstructions:[]}};
test('decoder requires exact original three wallets with no silent subset',()=>{
 assert.equal(B.originalWallets,3);assert.equal(B.runCalls,3);
 assert.deepEqual(assertExactSourceRoster(GAP_WALLETS.map(wallet=>({wallet}))),GAP_WALLETS.map(wallet=>({wallet})));
 assert.throws(()=>assertExactSourceRoster([{wallet}]),/ALL_THREE_SOURCES_REQUIRED/);
 assert.throws(()=>assertExactSourceRoster([...[...GAP_WALLETS].slice(0,2).map(wallet=>({wallet})),{wallet:'wrong'}]),/ALL_THREE_SOURCES_REQUIRED/);
});
test('preserve remaining independent five-minute full-budget source cycles',()=>{
 const time=Date.parse('2026-11-05T00:00:00Z');
 assert.equal(reservedForRemainingForwardCycles(time),8640);
 assert.equal(allowedDecoderReservation({now:time,rpcReserved:0,webhookEstimated:100,
  decodedReserved:0,armed:true}),true);
 assert.equal(allowedDecoderReservation({now:time,rpcReserved:360,webhookEstimated:100,
  decodedReserved:0,armed:true}),false);
 assert.equal(allowedDecoderReservation({now:time,rpcReserved:0,webhookEstimated:100,
  decodedReserved:300,armed:true}),false);
 assert.equal(allowedDecoderReservation({now:time,rpcReserved:0,webhookEstimated:20000,
  decodedReserved:0,armed:true}),false);
 assert.equal(allowedDecoderReservation({now:time,rpcReserved:0,webhookEstimated:0,
  decodedReserved:0,armed:false}),false);
});
test('exact RPC transaction signature and slot are required, never inferred buys',()=>{
 const x=inspectExactTransaction(response,source,{retrievedAt:at});
 assert.equal(x.status,'DECODED_RAW_UNCLASSIFIED');
 assert.equal(x.walletSignerConfirmed,true);
 assert.equal(x.feePayerIsWatchedWallet,true);
 assert.equal(x.independentlyVerifiedBuy,false);
 assert.equal(x.executionPriceUsd,null);
 assert.equal(x.tradeEligible,false);
 assert.equal(x.historicalRetrospective,true);
 assert.throws(()=>inspectExactTransaction({...response,slot:444444443},source,{retrievedAt:at}),
  /SLOT_MISMATCH/);
 assert.throws(()=>inspectExactTransaction({...response,transaction:{...response.transaction,
   signatures:['4'.repeat(88)]}},source,{retrievedAt:at}),/SIGNATURE_MISMATCH/);
});
test('failed source transactions cannot be interpreted as profitable signals',()=>{
 const x=inspectExactTransaction({...response,meta:{...response.meta,err:{InstructionError:[0,1]}}},
  {...source,failed:1},{retrievedAt:at});
 assert.equal(x.status,'DECODED_CHAIN_FAILED');
 assert.equal(x.independentlyVerifiedBuy,false);
 assert.equal(x.tradeEligible,false);
 assert.throws(()=>inspectExactTransaction(response,{...source,failed:1},{retrievedAt:at}),
  /CHAIN_STATUS_MISMATCH/);
});
test('wallet referenced does not imply wallet signed; token balance deltas not trades',()=>{
 const msg={...message,accountKeys:[{pubkey:other,signer:true},{pubkey:wallet,signer:false}]};
 const row=inspectExactTransaction({...response,transaction:{signatures:[sig],message:msg},meta:{
  ...response.meta,postTokenBalances:[{accountIndex:1,owner:wallet,mint:other,
   uiTokenAmount:{uiAmount:12}}]}},source,{retrievedAt:at});
 assert.equal(row.walletSignerConfirmed,false);
 assert.equal(row.feePayerIsWatchedWallet,false);
 assert.equal(row.tokenBalancesChanged[0].evidence,'PARSED_OWNER_BALANCE_DELTA_NOT_TRADE');
});
test('missing provider results, untrusted account keys and large source bodies fail closed',()=>{
 assert.throws(()=>inspectExactTransaction(null,source,{retrievedAt:at}),/PROVIDER_NOT_FOUND/);
 assert.throws(()=>inspectExactTransaction({...response,transaction:{signatures:[sig],
  message:{accountKeys:[]}}},source,{retrievedAt:at}),/ACCOUNT_KEYS_INVALID/);
 assert.equal(B.maxRawResponseBytes,350000);
 assert.equal(B.costPerArchivalTransaction,10);
 assert.equal(B.perUtcDayCredits,300);
 assert.equal(B.sharedRpcCredits,9000);
 assert.equal(B.localCombinedCredits,20000);
 assert.equal(B.stopUtc,'2026-11-08T00:00:00Z');
});
test('decode script only adds isolated derived tables and reserves from existing shared credit gate',async()=>{
 const src=await readFile('scripts/goget-rpc-source-decode.mjs','utf8');
 const schema=await readFile('sql/goget-rpc-decoding.sql','utf8');
 assert.match(src,/getTransaction/);
 assert.match(src,/reservedForRemainingForwardCycles/);
 assert.match(src,/smart_wallet_webhook_control/);
 assert.match(src,/smart_wallet_webhook_credit_estimates/);
 assert.match(src,/goget_rpc_source_budget/);
 assert.match(src,/assertExactSourceRoster/);
 assert.doesNotMatch(src,/(INSERT INTO|UPDATE|DELETE FROM)\s+(?:smart_wallet_webhook_events|smart_wallet_live_cursors|goget_rpc_source_signatures|goget_pre_signal_market_outcomes)/i);
 assert.doesNotMatch(src,/sendTransaction|signTransaction|privateKey/);
 assert.doesNotMatch(schema,/ALTER TABLE|DROP TABLE|smart_wallet_/i);
});
