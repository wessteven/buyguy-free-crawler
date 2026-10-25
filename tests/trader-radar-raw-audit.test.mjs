import test from 'node:test';
import assert from 'node:assert/strict';
import {rawWalletTokenDeltas,auditRawSignature} from '../src/trader-radar-raw-audit.mjs';
const wallet='AH75Bn6QHSt5K2Ad4p1otns3JTwpSJWZTwiwKWNhmnKx';
const mint='Cbkg5w7V7W2J2sUmecnyN825CbvwvXwasfhduVtNpump';
const quote='EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const signature='3wrQhLnuUFE1DjLD5AEcX9sGVKN4dntG3iTmBzm5gbvkKNjxKYBS7UKdXQLbPeKWoyrSGfcLm3JGHGezP9iUroWE';
const at='2026-10-21T05:22:48Z';
const bal=(mint,index,amount,owner=wallet)=>({mint,accountIndex:index,owner,uiTokenAmount:{amount:String(amount),decimals:6}});
const expected={wallet,mint,quoteMint:quote,signature,at,side:'BUY_LIKE',
 baseUnits:1064431.063751,quoteUnits:100};
const tx=(overrides={})=>({blockTime:Math.floor(Date.parse(at)/1000),
 transaction:{signatures:[signature],message:{accountKeys:[{pubkey:wallet,signer:true}]}},
 meta:{err:null,fee:5000,preTokenBalances:[bal(quote,2,100000000),bal(mint,3,0)],
 postTokenBalances:[bal(quote,2,0),bal(mint,3,1064431063751)]},...overrides});
test('raw independent token balance audit matches opposing wallet deltas only',()=>{
 const r=auditRawSignature(expected,tx());
 assert.equal(r.status,'RAW_BALANCE_DELTAS_CORROBORATED');
 assert.equal(r.corroborated,true);
 assert.equal(r.walletSignerObserved,true);
 assert.equal(r.feeLamports,5000);
 assert.equal(r.swapVerified,false);
 assert.equal(r.realizedPnlUsd,null);
 assert.equal(r.transferFundedBasisResolved,false);
});
test('failed, mismatched and incomplete raw transactions refuse corroboration',()=>{
 assert.equal(auditRawSignature(expected,null).corroborated,false);
 assert.equal(auditRawSignature(expected,tx({meta:{err:'failed'}})).corroborated,false);
 assert.equal(auditRawSignature(expected,tx({transaction:{signatures:['4'.repeat(88)],message:{accountKeys:[]}}})).corroborated,false);
 assert.equal(auditRawSignature(expected,tx({meta:{err:null,preTokenBalances:[],postTokenBalances:[]}})).corroborated,false);
});
test('other owner, change of owner, wrong quantities and duplicate index reject',()=>{
 const a=rawWalletTokenDeltas(wallet,tx({meta:{err:null,preTokenBalances:[bal(quote,2,100000000)],
 postTokenBalances:[bal(quote,2,0,'AGdtsMmphhymH5wYW3dWKSkAxpLYRrNDCTFAfuq8ii9v')]}}));
 assert.equal(a.status,'RAW_ACCOUNT_OWNER_OR_MINT_CHANGED');
 const bad=auditRawSignature(expected,tx({meta:{err:null,fee:5000,
 preTokenBalances:[bal(quote,2,100000000),bal(mint,3,0)],
 postTokenBalances:[bal(quote,2,0),bal(mint,3,100000000)]}}));
 assert.equal(bad.status,'ENHANCED_RAW_DELTA_DISAGREEMENT');
 const duplicate=rawWalletTokenDeltas(wallet,tx({meta:{err:null,
 preTokenBalances:[bal(quote,2,100000000),bal(quote,2,100000000)],postTokenBalances:[]}}));
 assert.equal(duplicate.status,'DUPLICATE_TOKEN_ACCOUNT_INDEX');
});
test('never infer wallet signing from non-signers',()=>{
 const t=tx();t.transaction.message.accountKeys=[{pubkey:wallet,signer:false}];
 const r=auditRawSignature(expected,t);
 assert.equal(r.walletSignerObserved,false);
 assert.equal(r.traderIdentityVerified,false);
});
