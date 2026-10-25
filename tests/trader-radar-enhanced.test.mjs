import test from 'node:test';
import assert from 'node:assert/strict';
import {interpretEnhancedTokenFlow,summarizeEnhancedWalletSamples,analyzeProvisionalCrowding} from '../src/trader-radar-enhanced.mjs';
import {detectTraderConvergence,scoreRealizedPerformance} from '../src/trader-radar.mjs';
const a='AGdtsMmphhymH5wYW3dWKSkAxpLYRrNDCTFAfuq8ii9v';
const b='AH75Bn6QHSt5K2Ad4p1otns3JTwpSJWZTwiwKWNhmnKx';
const usdc='EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const mint='Cbkg5w7V7W2J2sUmecnyN825CbvwvXwasfhduVtNpump';
const T=1792587600;
const sig='3'.repeat(88);
const leg=(mint,amount,from,to)=>({mint,tokenAmount:amount,fromUserAccount:from,toUserAccount:to});
const tx=(wallet,signature=sig,extra={})=>({signature,timestamp:T,type:'TRANSFER',source:'SOLANA_PROGRAM_LIBRARY',
 tokenTransfers:[leg(usdc,100,wallet,b),leg(mint,1000000,b,wallet)],transactionError:null,...extra});
test('net two-sided Helius flows are explicitly unverified',()=>{
 const x=interpretEnhancedTokenFlow(a,tx(a));
 assert.equal(x.status,'UNVERIFIED_TWO_SIDED_FLOW');
 assert.equal(x.provisionalFlow.side,'BUY_LIKE');
 assert.equal(x.provisionalFlow.quoteUnits,100);
 assert.equal(x.provisionalFlow.confirmed,false);
 assert.equal(x.provisionalFlow.realizedPnlUsd,null);
 assert.equal(x.provisionalFlow.tradeExecutionVerified,false);
 assert.equal(x.provisionalFlow.independenceVerified,false);
});
test('raw transfer labels and fee payers do not elevate evidence',()=>{
 const x=interpretEnhancedTokenFlow(a,tx(a,sig,{feePayer:a,type:'SWAP'}));
 assert.equal(x.provisionalFlow.confirmed,false);
 assert.equal(x.provisionalFlow.tradeExecutionVerified,false);
});
test('failed, one-sided, unrelated and malformed token transfers reject',()=>{
 assert.equal(interpretEnhancedTokenFlow(a,tx(a,sig,{transactionError:{error:'failed'}})).provisionalFlow,null);
 assert.equal(interpretEnhancedTokenFlow(a,tx(a,sig,{tokenTransfers:[leg(mint,2,b,a)]})).status,'NOT_TWO_TOKEN_SIDES');
 assert.equal(interpretEnhancedTokenFlow(a,tx(a,sig,{tokenTransfers:[leg(usdc,100,a,b),leg(mint,3,b,b)]})).status,'NOT_TWO_TOKEN_SIDES');
 assert.equal(interpretEnhancedTokenFlow(a,tx(a,sig,{tokenTransfers:[leg(usdc,NaN,a,b)]})).status,'MALFORMED_TRANSFER_LEG');
});
test('routed multiple legs net to a single provisional wallet delta',()=>{
 const trades=tx(a,sig,{tokenTransfers:[leg(usdc,60,a,b),leg(usdc,40,a,b),
  leg(mint,400000,b,a),leg(mint,600000,b,a)]});
 assert.equal(interpretEnhancedTokenFlow(a,trades).provisionalFlow.quoteUnits,100);
});
test('sample dedup is wallet/signature bounded',()=>{
 const x=summarizeEnhancedWalletSamples([{wallet:a,transactions:[tx(a),tx(a)]},{wallet:a,transactions:[tx(a)]}],{maxPerWallet:100});
 assert.equal(x.wallets.length,1);assert.equal(x.wallets[0].sampled,1);
 assert.equal(x.flows.length,1);
});
test('two provisional wallets on same mint are NOT a verified convergence signal',()=>{
 const x=summarizeEnhancedWalletSamples([{wallet:a,transactions:[tx(a)]},
  {wallet:b,transactions:[tx(b,'4'.repeat(88),{tokenTransfers:[leg(usdc,100,b,a),leg(mint,1000000,a,b)]})]}]);
 const report=analyzeProvisionalCrowding(x.flows,{asOf:new Date(T*1000).toISOString()});
 assert.equal(report.rows[0].provisionalNetBuyWallets,2);
 assert.equal(report.rows[0].eligibleResearchSignal,false);
 assert.equal(report.confirmedTraderConvergences,0);
 assert.equal(detectTraderConvergence(x.flows,[{wallet:a,independenceVerified:true},{wallet:b,independenceVerified:true}],{now:new Date(T*1000).toISOString()}).length,0);
 assert.equal(scoreRealizedPerformance(a,x.flows).realizedPnlUsd,null);
});
test('sell-like counterpart and duplicates prevent false crowding',()=>{
 const base=interpretEnhancedTokenFlow(a,tx(a)).provisionalFlow;
 const sell=interpretEnhancedTokenFlow(b,tx(b,'4'.repeat(88),{
 tokenTransfers:[leg(usdc,200,a,b),leg(mint,700000,b,a)]})).provisionalFlow;
 assert.equal(sell.side,'SELL_LIKE');
 const x=analyzeProvisionalCrowding([base,base,sell],{asOf:new Date(T*1000).toISOString()});
 assert.equal(x.rows[0].provisionalNetBuyWallets,1);
 assert.equal(x.rows[0].provisionalNetSellWallets,1);
});
test('future and stale flows excluded',()=>{
 const base=interpretEnhancedTokenFlow(a,tx(a)).provisionalFlow;
 assert.equal(analyzeProvisionalCrowding([base],{asOf:new Date((T-60)*1000).toISOString()}).rows.length,0);
 assert.equal(analyzeProvisionalCrowding([base],{asOf:new Date((T+86400)*1000).toISOString()}).rows.length,0);
 assert.throws(()=>analyzeProvisionalCrowding([base],{}));
});
