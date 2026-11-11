import test from 'node:test';
import assert from 'node:assert/strict';
import {studyTraderConvergence} from '../src/trader-radar-forward-study.mjs';
const mint='6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN';
const pool='AH75Bn6QHSt5K2Ad4p1otns3JTwpSJWZTwiwKWNhmnKx';
const other='5DBkonys2H4qHr5x9CCeXPLSWEFbnnLFP1RdfxjJgzvy';
const start='2026-10-21T09:00:00Z',asOf='2026-10-21T10:00:00Z';
const signal={mint,pool,observedAt:start,eligibleResearchSignal:true,independenceVerified:true};
const q=(m,price,liquidity=40000,extra={})=>({mint,pool,at:new Date(Date.parse(start)+m*60000).toISOString(),
 priceUsd:price,liquidityUsd:liquidity,source:'fixture',...extra});
test('forward returns use delayed entry and later exit, not signal-bar price',()=>{
 const x=studyTraderConvergence([signal],[q(0,1),q(1,2),q(16,3)],{asOf});
 assert.equal(x.resolvedCount,1);
 assert.equal(x.results[0].grossReturnPct,50);
 assert.equal(x.results[0].entryPriceUsd,2);
 assert.equal(x.predictiveAlphaEstablished,false);
 assert.equal(x.automaticTradeAllowed,false);
});
test('no as-of future leakage or early quote substitution',()=>{
 const x=studyTraderConvergence([signal],[q(0,1),q(1,2),q(16,3)],{asOf:'2026-10-21T09:10:00Z'});
 assert.equal(x.results[0].status,'HORIZON_NOT_YET_ELAPSED');
 assert.equal(x.meanGrossPct,null);
 assert.throws(()=>studyTraderConvergence([signal],[]));
});
test('never fill stale entry, wrong pool or low-liquidity execution',()=>{
 const stale=studyTraderConvergence([signal],[q(10,2),q(25,3)],{asOf});
 assert.equal(stale.results[0].status,'NO_EXECUTABLE_ENTRY_QUOTE');
 const wrong=studyTraderConvergence([signal],[q(1,2,40000,{pool:other}),q(16,3,40000,{pool:other})],{asOf});
 assert.equal(wrong.resolvedCount,0);
 const thin=studyTraderConvergence([signal],[q(1,2,500),q(16,3)],{asOf});
 assert.equal(thin.resolvedCount,0);
});
test('missing exit is excluded, never treated as winner or zero return',()=>{
 const x=studyTraderConvergence([signal],[q(1,2)],{asOf});
 assert.equal(x.resolvedCount,0);
 assert.equal(x.results[0].status,'NO_EXIT_QUOTE');
 assert.equal(x.positiveGrossRatioPct,null);
});
test('unverified independence is excluded even when prices show a big win',()=>{
 const x=studyTraderConvergence([{...signal,independenceVerified:false}],
 [q(1,1),q(16,100)],{asOf});
 assert.equal(x.results[0].status,'SIGNAL_NOT_INDEPENDENTLY_VERIFIED');
});
