import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyFomoWalletActivity,classifyWalletBalanceChanges} from '../src/trader-radar-helius.mjs';
const wallet='AGdtsMmphhymH5wYW3dWKSkAxpLYRrNDCTFAfuq8ii9v';
const usdc='EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const mint='6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN';
const bal=(mint,accountIndex,amount)=>({owner:wallet,mint,accountIndex,uiTokenAmount:{amount:String(amount),decimals:6}});
test('isolated token transfers cannot be called buys',()=>{
 const r=classifyWalletBalanceChanges(wallet,{meta:{err:null,preTokenBalances:[],postTokenBalances:[bal(mint,0,10000)]}});
 assert.equal(r.status,'NOT_VERIFIED_AS_SWAP');
});
test('two sided token balance change is swap-like, not an audited execution price',()=>{
 const r=classifyWalletBalanceChanges(wallet,{meta:{err:null,preTokenBalances:[bal(usdc,1,100000000),bal(mint,2,0)],postTokenBalances:[bal(usdc,1,60000000),bal(mint,2,12000000)]}});
 assert.equal(r.status,'TWO_SIDED_TOKEN_BALANCE_CHANGE');
 assert.equal(r.changes.length,2);
 assert.match(r.caveat,/not proof/);
});
test('Helius verifier is bounded, readonly, non-mutating and disabled without key',async()=>{
 assert.equal((await verifyFomoWalletActivity({},{})).enabled,false);
 const calls=[];
 const fetcher=async(_url,opt)=>{
  const data=JSON.parse(opt.body);calls.push(data);
  if(data.method==='getSignaturesForAddress')return {ok:true,json:async()=>({result:[{signature:'x'.repeat(88),blockTime:1,err:null}]})};
  return {ok:true,json:async()=>({result:{meta:{err:null,preTokenBalances:[],postTokenBalances:[]}}})};
 };
 const out=await verifyFomoWalletActivity({HELIUS_RPC_URL:'https://example.org'},
  {candidates:Array.from({length:20},()=>({wallet})),maxWallets:99,signatureLimit:99,fetcher});
 assert.equal(out.checked,1);
 assert.equal(calls.length,2);
 assert.equal(calls[0].method,'getSignaturesForAddress');
 assert.equal(calls[0].params[1].limit,5);
 assert.equal(calls[1].method,'getTransaction');
 assert.equal(out.wallets[0].identityVerified,false);
 assert.equal(out.wallets[0].realizedPnlVerified,false);
});
test('RPC failures are sanitized and never treated as positive verification',async()=>{
 const out=await verifyFomoWalletActivity({HELIUS_RPC_URL:'https://example.org'},
 {candidates:[{wallet}],fetcher:async()=>{throw Error('secret-auth-token');}});
 assert.equal(out.wallets[0].status,'RPC_RESEARCH_ERROR');
 assert.equal(JSON.stringify(out).includes('secret-auth-token'),false);
});
