import test from 'node:test';
import assert from 'node:assert/strict';
import {importFomoCandidates,scoreRealizedPerformance,detectTraderConvergence} from '../src/trader-radar.mjs';
import {normalizeBitqueryFomoRows,FOMO_LATEST_TRADES_QUERY} from '../src/trader-radar-bitquery.mjs';
import {readFileSync} from 'node:fs';
const a='AGdtsMmphhymH5wYW3dWKSkAxpLYRrNDCTFAfuq8ii9v';
const b='AH75Bn6QHSt5K2Ad4p1otns3JTwpSJWZTwiwKWNhmnKx';
const c='5DBkonys2H4qHr5x9CCeXPLSWEFbnnLFP1RdfxjJgzvy';
const mint='6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN';
const now='2026-10-21T09:00:00.000Z';
const input=JSON.parse(readFileSync(new URL('../data/trader-radar/fomo-candidates-2026-10-18.json',import.meta.url)));
test('dated third-party snapshot imports real claims but never upgrades authenticity or PnL',()=>{
 const out=importFomoCandidates(input);
 assert.equal(out.candidates.length,4);
 assert.equal(out.candidates[0].reportedPnlUsd,782000);
 assert.equal(out.candidates[0].realizedPnlUsd,null);
 assert.equal(out.candidates[0].independenceVerified,false);
 assert.equal(out.candidates[0].verifiedOwner,false);
});
test('rejects malformed input and deduplicates conflicting wallet claims',()=>{
 assert.throws(()=>importFomoCandidates({traders:[]}));
 const out=importFomoCandidates({...input,traders:[input.traders[0],{handle:'Other',solanaWallet:a},{handle:'x',solanaWallet:'garbage'}]});
 assert.equal(out.candidates.length,1);
 assert.equal(out.rejected.length,1);
 assert.equal(out.candidates[0].identityStatus,'CONFLICTING_OR_DUPLICATE_CLAIMS');
});
const trade=(side,quantity,usd,signature,at,extras={})=>({side,quantity,usd,signature,at,wallet:a,mint,
 feesUsd:0,confirmed:true,basisKnown:true,...extras});
test('conservative FIFO counts fees, partial exits and real realized profit',()=>{
 const r=scoreRealizedPerformance(a,[trade('BUY',10,100,'buy1','2026-10-01T00:00:00Z',{feesUsd:2}),
  trade('SELL',5,80,'sell1','2026-10-02T00:00:00Z',{feesUsd:1})]);
 assert.equal(r.realizedPnlUsd,28);
 assert.equal(r.roiPct,54.9);
 assert.equal(r.closedTrades,1);
 assert.equal(r.eligible,false);
 assert.equal(r.reason,'SMALL_CLOSED_TRADE_SAMPLE');
});
test('unknown inventory transfers and sales without verified basis block realized score',()=>{
 const result=scoreRealizedPerformance(a,[trade('TRANSFER_IN',10,0,'tr1','2026-10-01T00:00:00Z'),
  trade('SELL',10,100,'sell2','2026-10-02T00:00:00Z')]);
 assert.equal(result.realizedPnlUsd,null);
 assert.equal(result.reason,'INCOMPLETE_BASIS');
});
test('unpriced history and no closes cannot fabricate returns',()=>{
 assert.equal(scoreRealizedPerformance(a,[]).eligible,false);
 assert.equal(scoreRealizedPerformance(a,[trade('BUY',10,0,'one','2026-10-01T00:00:00Z')]).realizedPnlUsd,null);
});
const evt=(wallet,side,signature,mins=0,extras={})=>({wallet,mint,side,signature,
 at:new Date(Date.parse(now)-mins*60000).toISOString(),confirmed:true,notionalUsd:100,...extras});
const candidates=[a,b,c].map(wallet=>({wallet,independenceVerified:true,independenceGroup:wallet}));
test('convergence requires three separately vetted accumulating wallets',()=>{
 const out=detectTraderConvergence([evt(a,'BUY','sig1'),evt(b,'BUY','sig2'),evt(c,'BUY','sig3')],candidates,{now});
 assert.equal(out[0].verifiedIndependentGroups,3);
 assert.equal(out[0].eligibleResearchSignal,true);
 assert.equal(out[0].automaticTradeAllowed,false);
});
test('unverified wallet independence, shared groups, stale events and duplicated signatures cannot trigger',()=>{
 const es=[evt(a,'BUY','sig1'),evt(a,'BUY','sig1'),evt(b,'BUY','sig2'),evt(c,'BUY','sig3',50)];
 const no=detectTraderConvergence(es,[{wallet:a},{wallet:b},{wallet:c}],{now});
 assert.equal(no[0].eligibleResearchSignal,false);
 const same=candidates.map(x=>({...x,independenceGroup:'same-controller'}));
 assert.equal(detectTraderConvergence([evt(a,'BUY','sig1'),evt(b,'BUY','sig2'),evt(c,'BUY','sig3')],same,{now})[0].verifiedIndependentGroups,1);
});
test('sell after buys reduces net accumulation and removes that wallet from convergence',()=>{
 const out=detectTraderConvergence([evt(a,'BUY','1'),evt(b,'BUY','2'),evt(c,'BUY','3'),evt(c,'SELL','4',0,{notionalUsd:110})],candidates,{now});
 assert.equal(out[0].verifiedIndependentGroups,2);
 assert.equal(out[0].eligibleResearchSignal,false);
});
test('Bitquery optional adapter stays untrusted and has no implicit network calls',()=>{
 assert.match(FOMO_LATEST_TRADES_QUERY,/ProtocolName: \{is: "dflow"\}/);
 const sample={data:{Solana:{DEXTrades:[{Block:{Time:now},Transaction:{Signature:'signature1'},
  Trade:{Buy:{Account:{Owner:a},Currency:{MintAddress:mint}},Sell:{Currency:{MintAddress:'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'}}}}]}}};
 const result=normalizeBitqueryFomoRows(sample);
 assert.equal(result.events.length,1);
 assert.equal(result.events[0].confirmed,false);
});
