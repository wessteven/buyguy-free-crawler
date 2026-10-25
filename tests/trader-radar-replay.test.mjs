import test from 'node:test';
import assert from 'node:assert/strict';
import {reconstructHistoricalWalletTx,replayHistoricalWallet} from '../src/trader-radar-replay.mjs';
import {scoreRealizedPerformance,detectTraderConvergence} from '../src/trader-radar.mjs';
const wallet='AGdtsMmphhymH5wYW3dWKSkAxpLYRrNDCTFAfuq8ii9v';
const other='AH75Bn6QHSt5K2Ad4p1otns3JTwpSJWZTwiwKWNhmnKx';
const usdc='EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const mint='6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN';
const signature='3'.repeat(88),s2='4'.repeat(88);
const bal=(mint,index,raw,owner=wallet)=>({accountIndex:index,mint,owner,uiTokenAmount:{amount:String(raw),decimals:6}});
function tx({sig=signature,pre=[bal(usdc,1,100000000),bal(mint,2,0)],post=[bal(usdc,1,80000000),bal(mint,2,10000000)],time=1792550000,failed=false}={}){
 return {blockTime:time,meta:{err:failed?{InstructionError:[0,'Failed']}:null,fee:5000,
  preTokenBalances:pre,postTokenBalances:post},transaction:{signatures:[sig],
  message:{accountKeys:[{pubkey:wallet,signer:true}]} }};
}
test('USDC debit plus token credit is only a provisional BUY candidate',()=>{
 const x=reconstructHistoricalWalletTx(wallet,tx());
 assert.equal(x.status,'RESEARCH_TRADE_CANDIDATE');
 assert.equal(x.tradeCandidate.side,'BUY');
 assert.equal(x.tradeCandidate.quoteUnits,20);
 assert.equal(x.tradeCandidate.quantity,10);
 assert.equal(x.tradeCandidate.confirmed,false);
 assert.equal(x.tradeCandidate.basisKnown,false);
 assert.equal(x.tradeCandidate.feesUsd,null);
 assert.equal(x.tradeCandidate.walletSignerObserved,true);
});
test('token debit plus USDC credit is provisional SELL, never realized PnL',()=>{
 const x=reconstructHistoricalWalletTx(wallet,tx({pre:[bal(usdc,1,1e6),bal(mint,2,1e7)],
 post:[bal(usdc,1,31e6),bal(mint,2,0)]}));
 assert.equal(x.tradeCandidate.side,'SELL');
 assert.equal(x.tradeCandidate.quoteUnits,30);
 assert.equal(scoreRealizedPerformance(wallet,[x.tradeCandidate]).realizedPnlUsd,null);
});
test('airdrops, one-sided flows and simple transfers are not buys',()=>{
 const x=reconstructHistoricalWalletTx(wallet,tx({pre:[],post:[bal(mint,2,10000000)]}));
 assert.equal(x.tradeCandidate,null);
 assert.equal(x.status,'NOT_SIMPLE_TWO_SIDED_SWAP');
});
test('SOL-only, nonquote pairs and complex multi-token routes cannot infer USD cost basis',()=>{
 const alt='So11111111111111111111111111111111111111112';
 const noQuote=reconstructHistoricalWalletTx(wallet,tx({pre:[bal(alt,1,10000000),bal(mint,2,0)],
 post:[bal(alt,1,5000000),bal(mint,2,10000000)]}));
 assert.equal(noQuote.status,'NO_UNIQUE_STABLE_QUOTE');
 const multi=reconstructHistoricalWalletTx(wallet,tx({pre:[bal(usdc,1,100000000),bal(mint,2,0),bal(alt,3,5000000)],
 post:[bal(usdc,1,80000000),bal(mint,2,10000000),bal(alt,3,7000000)]}));
 assert.equal(multi.status,'NOT_SIMPLE_TWO_SIDED_SWAP');
});
test('changed token account owners, missing balances and failed transaction reject',()=>{
 assert.equal(reconstructHistoricalWalletTx(wallet,tx({failed:true})).tradeCandidate,null);
 assert.equal(reconstructHistoricalWalletTx(wallet,{meta:{err:null}}).status,'TOKEN_BALANCE_EVIDENCE_MISSING');
 const bad=reconstructHistoricalWalletTx(wallet,tx({post:[bal(usdc,1,80000000,other),bal(mint,2,10000000)]}));
 assert.equal(bad.status,'TOKEN_ACCOUNT_OWNER_CHANGED');
});
test('out of safe integer token amount is rejected, never rounded into a buy',()=>{
 const x=reconstructHistoricalWalletTx(wallet,tx({post:[bal(usdc,1,'999999999999999999999'),bal(mint,2,10000000)]}));
 assert.equal(x.status,'MALFORMED_TOKEN_BALANCE');
});
test('bounded pagination and exact signature checks, no realized score, no production writes',async()=>{
 const seen=[];
 const fetcher=async(_url,req)=>{
  const q=JSON.parse(req.body);seen.push(q);
  if(q.method==='getSignaturesForAddress'){
   if(!q.params[1].before)return {ok:true,json:async()=>({result:[{signature,err:null},{signature:s2,err:null}]})};
   return {ok:true,json:async()=>({result:[]})};
  }
  const sig=q.params[0];
  return {ok:true,json:async()=>({result:tx({sig})})};
 };
 const x=await replayHistoricalWallet({HELIUS_RPC_URL:'https://example.com'},
  {wallet,fetcher,perPage:2,pages:2,maxTransactions:9});
 assert.equal(x.candidateTrades,2);
 assert.equal(x.sourceExhausted,true);
 assert.equal(x.coverageComplete,false);
 assert.equal(x.realizedPnlUsd,null);
 assert.equal(seen.filter(x=>x.method==='getTransaction').length,2);
 assert.equal(seen.filter(x=>x.method==='getSignaturesForAddress').length,2);
 assert.equal(x.observations[0].candidate.confirmed,false);
});
test('query errors and missing transaction are not proof of trading',async()=>{
 let calls=0;
 const fetcher=async(_url,{body})=>{
  const q=JSON.parse(body);calls++;
  if(q.method==='getSignaturesForAddress')return {ok:true,json:async()=>({result:[{signature,err:null}]})};
  return {ok:true,json:async()=>({result:null})};
 };
 const x=await replayHistoricalWallet({HELIUS_RPC_URL:'https://example.com'}, {wallet,fetcher,perPage:5});
 assert.equal(calls,2);
 assert.equal(x.candidateTrades,0);
 assert.equal(x.fetchFailures,1);
 assert.equal(x.observations[0].status,'SIGNATURE_MISMATCH_OR_MISSING');
 const fail=await replayHistoricalWallet({HELIUS_RPC_URL:'https://example.com'},
 {wallet,fetcher:async()=>{throw Error('sensitive-RPC-url')}});
 assert.equal(fail.listingError,true);
 assert.equal(JSON.stringify(fail).includes('sensitive-RPC-url'),false);
});
test('reconstructed candidates never pass real-money buy convergence',()=>{
 const x=reconstructHistoricalWalletTx(wallet,tx());
 const r=detectTraderConvergence([x.tradeCandidate],[{wallet,independenceVerified:true}],{now:'2026-10-21T09:00:00Z'});
 assert.equal(r.length,0);
});
