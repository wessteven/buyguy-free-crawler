import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeParsedEventForNativeRatio} from '../src/goget-parsed-events-adapter.mjs';
import {inferExactCounterpartyNativeRatio} from '../src/goget-historical-native-ratio.mjs';
const pool='7'.repeat(44),mint='5'.repeat(44),wallet='6'.repeat(44),sig='8'.repeat(88);
const WSOL='So11111111111111111111111111111111111111112';
const tx=(legs,opts={})=>({
 signature:sig,parserStatus:'OK',parsed:{
  slot:465111111,blockTime:1793783126,transactionStatus:'OK',
  error:null,summary:{type:'swap'},instructions:[{rawAccounts:[pool,wallet]}],
  tokenTransfers:legs,nativeTransfers:[],...opts
 }});
const leg=(mint,raw,decimals,from,to)=>({
 mint,rawTokenAmount:raw,decimals,fromUserAccount:from,toUserAccount:to
});
const run=e=>{
 const n=normalizeParsedEventForNativeRatio(e,{pool,mint,expectedSignature:sig});
 return {n,trade:n.ok?inferExactCounterpartyNativeRatio(n.normalized,{pool,mint}):null};
};
test('decodes raw integer token units and native WSOL raw units for exact BUY',()=>{
 const e=tx([leg(WSOL,500000000,9,wallet,pool),
             leg(mint,100000000000,6,pool,wallet)]);
 const {n,trade}=run(e);
 assert.equal(n.ok,true);
 assert.equal(trade.status,'HISTORIC_NATIVE_POOL_FLOW_RATIO_ONLY');
 assert.equal(trade.side,'TOKEN_BOUGHT_FROM_POOL');
 assert.equal(trade.solPerToken,0.000005);
 assert.equal(trade.usdPerToken,undefined);
});
test('native lamport transfer substitutes for missing WSOL pool token transfer only',()=>{
 const e=tx([leg(mint,600000000000,6,wallet,pool)],{
   nativeTransfers:[{fromUserAccount:pool,toUserAccount:wallet,amount:1200000000}]
 });
 const {n,trade}=run(e);
 assert.equal(n.ok,true);assert.equal(trade.side,'TOKEN_SOLD_TO_POOL');
 assert.equal(trade.solPerToken,0.000002);
});
test('reject unparsed, failed, mismatched signature and unproven pool instruction',()=>{
 const e=tx([leg(mint,100,6,pool,wallet)]);
 assert.equal(run({...e,parserStatus:'FAILED'}).n.ok,false);
 assert.equal(run({...e,signature:'9'.repeat(88)}).n.ok,false);
 assert.equal(run({...e,parsed:{...e.parsed,transactionStatus:'FAILED'}}).n.ok,false);
 assert.equal(run({...e,parsed:{...e.parsed,instructions:[{rawAccounts:[wallet]}]}}).n.reason,
   'EXACT_POOL_INSTRUCTION_UNVERIFIED');
});
test('reject unsafe integer raw units, wrong decimals, and mixed source legs',()=>{
 const base=tx([leg(mint,100,6,pool,wallet)]);
 const badQty=tx([leg(mint,Number.MAX_SAFE_INTEGER+1,6,pool,wallet)]);
 assert.equal(run(badQty).n.reason,'POOL_TOKEN_TRANSFER_AMOUNT_UNVERIFIED');
 assert.equal(run(tx([leg(mint,100,22,pool,wallet)])).n.reason,
   'POOL_TOKEN_TRANSFER_AMOUNT_UNVERIFIED');
 assert.equal(run(base).trade.status,'NO_UNAMBIGUOUS_DIRECT_COUNTERPARTY_LEGS');
 const mixed=tx([leg(mint,100,6,pool,wallet),leg('9'.repeat(44),5,6,pool,wallet),
   leg(WSOL,1000,9,wallet,pool)]);
 assert.equal(run(mixed).trade.status,'MULTI_MINT_POOL_LEGS_AMBIGUOUS');
});
test('different counterparty directions and multiple legs are not clean pool rates',()=>{
 const routed=tx([leg(WSOL,1000000000,9,wallet,pool),
   leg(mint,50000000,6,pool,'9'.repeat(44))]);
 assert.equal(run(routed).trade.status,'NO_UNAMBIGUOUS_DIRECT_COUNTERPARTY_LEGS');
 const repeated=tx([leg(WSOL,1000000000,9,wallet,pool),
  leg(mint,50000000,6,pool,wallet),leg(mint,60000000,6,pool,wallet)]);
 assert.equal(run(repeated).trade.status,'NO_UNAMBIGUOUS_DIRECT_COUNTERPARTY_LEGS');
});
