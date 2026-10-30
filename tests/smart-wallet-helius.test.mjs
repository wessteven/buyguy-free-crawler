import test from 'node:test';
import assert from 'node:assert/strict';
import {extractHeliusSwapCandidates} from '../src/smart-wallet-helius.mjs';

const wallet='A'.repeat(44),mint='B'.repeat(44);
const ts=Date.parse('2026-10-30T02:00:00Z');
const event={type:'SWAP',transactionError:null,feePayer:wallet,signature:'5'.repeat(88),
  slot:461000000,timestamp:Math.floor((ts-1500)/1000),
  tokenTransfers:[{mint,fromUserAccount:wallet,toUserAccount:'C'.repeat(44),tokenAmount:10}]};
const run=(payload)=>extractHeliusSwapCandidates(payload,new Set([wallet]),{receivedAt:new Date(ts).toISOString()});

test('Helius parsed SWAP yields only an unverified candidate with exact identity and timing',()=>{
 const res=run([event]);assert.equal(res.invalid.length,0);assert.equal(res.candidates.length,1);
 assert.equal(res.candidates[0].source,'HELIUS_ENHANCED_CANDIDATE');
 assert.equal(res.candidates[0].verifiedBuy,false);assert.equal(res.candidates[0].canTrade,false);
 assert.equal(res.candidates[0].transferHints[0].mint,mint);
 assert.equal(res.candidates[0].slot,event.slot);
});

test('duplicated signatures are not emitted twice within a webhook batch',()=>{
 const res=run([event,event]);assert.equal(res.candidates.length,1);
 assert.equal(res.invalid[0].reason,'DUPLICATE_SIGNATURE');
});

test('irrelevant fee payers and transfers are not automatically treated as watched wallet swaps',()=>{
 assert.equal(run([{...event,feePayer:'D'.repeat(44)}]).candidates.length,0);
 assert.equal(run([{...event,type:'TRANSFER'}]).invalid[0].reason,'NOT_SWAP');
 assert.equal(run([{...event,tokenTransfers:[]}]).invalid[0].reason,'NO_TOKEN_TRANSFER_EVIDENCE');
});

test('failed, stale, future, and overlarge batches fail closed',()=>{
 assert.equal(run([{...event,transactionError:{InstructionError:[0,'Error']}}]).invalid[0].reason,'NOT_VERIFIED_SUCCESS');
 assert.equal(run([{...event,timestamp:Math.floor((ts-65000)/1000)}]).invalid[0].reason,'DELAY_UNKNOWN_OR_OLD');
 assert.equal(run([{...event,timestamp:Math.floor((ts+65000)/1000)}]).invalid[0].reason,'DELAY_UNKNOWN_OR_OLD');
 assert.equal(run(Array.from({length:101},()=>event)).invalid[0].reason,'WEBHOOK_BATCH_LIMIT_EXCEEDED');
 assert.equal(run({type:'SWAP'}).invalid[0].reason,'WEBHOOK_BODY_NOT_ARRAY');
});
