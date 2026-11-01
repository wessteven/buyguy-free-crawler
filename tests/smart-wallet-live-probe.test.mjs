import test from 'node:test';
import assert from 'node:assert/strict';
import {selectWindow,cursorAfterPersisted,classifyObservedTransaction,WATCH_LIMITS,MAX_SUPPORTED_SOLANA_TRANSACTION_VERSION,WSOL} from '../src/smart-wallet-live-probe.mjs';
import {PUMPSWAP} from '../src/pumpswap.mjs';

const wallet='A'.repeat(44),mint='B'.repeat(44),sig='5'.repeat(88);
const observation='2026-10-30T02:00:01.000Z';
const amount=(n,m,raw,owner=wallet)=>({accountIndex:n,mint:m,owner,uiTokenAmount:{amount:String(raw),decimals:9}});
const transaction={
 slot:462900001,blockTime:1793325600,
 transaction:{signatures:[sig],message:{
   accountKeys:[{pubkey:wallet,signer:true},{pubkey:PUMPSWAP,signer:false}],
   instructions:[{programId:PUMPSWAP}]}},
 meta:{err:null,
   preTokenBalances:[amount(10,mint,10),amount(11,WSOL,300)],
   postTokenBalances:[amount(10,mint,210),amount(11,WSOL,250)]}
};
const classify=(tx=transaction,override={})=>
 classifyObservedTransaction({wallet,signature:sig,tx,observedAt:observation,...override});

test('true signed confirmed RPC balance increase + PumpSwap instruction is unpriced research ONLY',()=>{
 const v=classify();assert.equal(v.classification,'AMM_INVOCATION_WITH_TOKEN_INCREASE_UNPRICED');
 assert.equal(v.tradeEligible,false);assert.equal(v.paperEligible,false);
 assert.equal(v.tokenIncreases[0].mint,mint);assert.equal(v.tokenIncreases[0].changeRaw,'200');
 assert.deepEqual(v.programs,[PUMPSWAP]);
 assert.equal(v.delayMs,1000);
});
test('reference by a creator or a non-signer never becomes a wallet buy',()=>{
 const tx=structuredClone(transaction);
 tx.transaction.message.accountKeys[0].signer=false;
 const v=classify(tx);assert.equal(v.classification,'WALLET_REFERENCED_NOT_SIGNER');
 assert.equal(v.tokenIncreases.length,0);assert.equal(v.tradeEligible,false);
});
test('failed/mismatched transactions and unknown token-owner mapping fail closed',()=>{
 assert.equal(classify({...transaction,meta:{...transaction.meta,err:{InstructionError:[0,'err']}}}).classification,'TRANSACTION_UNAVAILABLE_OR_FAILED');
 assert.equal(classify({...transaction,transaction:{...transaction.transaction,signatures:['6'.repeat(88)]}}).classification,'TRANSACTION_UNAVAILABLE_OR_FAILED');
 const tx=structuredClone(transaction);delete tx.meta.postTokenBalances[0].owner;
 assert.equal(classify(tx).classification,'TOKEN_INCREASE_OWNER_MAPPING_PARTIAL');
});
test('a simple token transfer with no AMM is not called a purchase',()=>{
 const tx=structuredClone(transaction);tx.transaction.message.instructions=[];
 assert.equal(classify(tx).classification,'TOKEN_INCREASE_NO_VERIFIED_AMM');
});
test('only bounded new signatures are selected with honest gap and truncation accounting',()=>{
 const sigs=Array.from({length:16},(_,i)=>({signature:String(i%9+1).repeat(88),err:null}));
 const state=selectWindow(sigs,sigs[3].signature);
 assert.equal(state.selected.length,2);assert.equal(state.observedCount,3);
 assert.equal(state.gap,false);assert.equal(state.truncated,true);
 assert.equal(state.head,sigs[0].signature);
 const unknown=selectWindow(sigs,'Z'.repeat(88));
 assert.equal(unknown.gap,true);
 assert.equal(selectWindow(sigs,null).baseline,true);
 assert.equal(WATCH_LIMITS.maxWallets,3);assert.equal(WATCH_LIMITS.maxDecodesPerRun,6);
});
test('invalid account-owner mapping or amount cannot be counted as safe',()=>{
 const tx=structuredClone(transaction);tx.meta.postTokenBalances[0].uiTokenAmount.amount='NOT_A_NUMBER';
 assert.equal(classify(tx).classification,'TOKEN_INCREASE_OWNER_MAPPING_PARTIAL');
});

test('Helius JSON-RPC reader supports Solana v1 transactions',()=>{
 assert.equal(MAX_SUPPORTED_SOLANA_TRANSACTION_VERSION,1);
});

test('bounded multi-cycle polling replays all new signatures rather than skipping the middle',()=>{
 const sigs=Array.from({length:8},(_,i)=>({signature:String(i+1).repeat(88),err:null}));
 const first=selectWindow(sigs,sigs[5].signature);
 assert.equal(first.observedCount,5);
 assert.equal(first.truncated,true);
 assert.equal(first.gap,false);
 // newest-first selection but intentionally the OLDEST pending two.
 assert.deepEqual(first.selected.map(x=>x.signature),
   [sigs[3].signature,sigs[4].signature]);
 const doneFirst=first.selected.map(x=>x.signature).reverse();
 const afterFirst=cursorAfterPersisted(sigs[5].signature,doneFirst);
 assert.equal(afterFirst,sigs[3].signature);
 const second=selectWindow(sigs,afterFirst);
 assert.deepEqual(second.selected.map(x=>x.signature),
   [sigs[1].signature,sigs[2].signature]);
 const doneSecond=second.selected.map(x=>x.signature).reverse();
 const afterSecond=cursorAfterPersisted(afterFirst,doneSecond);
 const third=selectWindow(sigs,afterSecond);
 assert.deepEqual(third.selected.map(x=>x.signature),[sigs[0].signature]);
 const doneThird=third.selected.map(x=>x.signature).reverse();
 const afterThird=cursorAfterPersisted(afterSecond,doneThird);
 assert.equal(afterThird,sigs[0].signature);
 assert.equal(selectWindow(sigs,afterThird).selected.length,0);
 assert.deepEqual([...doneFirst,...doneSecond,...doneThird],[
   sigs[4].signature,sigs[3].signature,
   sigs[2].signature,sigs[1].signature,sigs[0].signature]);
});
test('cursor never moves to newest receipt when a write was not confirmed',()=>{
 const previous='5'.repeat(88),older='4'.repeat(88),newer='3'.repeat(88);
 assert.equal(cursorAfterPersisted(previous,[]),previous);
 assert.equal(cursorAfterPersisted(previous,[older]),older);
 assert.equal(cursorAfterPersisted(previous,[older,newer]),newer);
 assert.equal(cursorAfterPersisted(null,[]),null);
 assert.throws(()=>cursorAfterPersisted(previous,['BAD']),/INVALID_PROCESSED_SIGNATURE/);
 assert.throws(()=>cursorAfterPersisted(previous,Array(7).fill(older)),
   /INVALID_PROCESSED_SIGNATURES/);
});
test('invalid or zero decode limit cannot select any unprocessed transaction',()=>{
 const list=Array.from({length:3},(_,i)=>({signature:String(i+1).repeat(88),err:null}));
 assert.equal(selectWindow(list,null,{limit:0}).selected.length,0);
 assert.equal(selectWindow(list,null,{limit:-1}).selected.length,0);
 assert.equal(selectWindow(list,null,{limit:100}).selected.length,WATCH_LIMITS.decodePerWallet);
});
