import test from 'node:test';import assert from 'node:assert/strict';
import {evaluateFlowWindow,evaluateNightLabEvidence} from '../src/night-lab-evidence.mjs';
const base={chain:'solana',address:'exact-mint',pool:'exact-pool',marketCapUsd:90000,
 liquidityUsd:22000,quoteAgeMinutes:5,sellQuoteVerified:true,lpCustodyVerified:true,
 holderConcentrationVerified:true,windows:[{complete:true,buys:40,sells:20,distinctBuyers:30,meaningfulBuyers:25,buyUsd:1500,sellUsd:900},
 {complete:true,buys:42,sells:21,distinctBuyers:32,meaningfulBuyers:28,buyUsd:1700,sellUsd:800}]};
test('requires economically positive complete consecutive windows',()=>{
 assert.equal(evaluateNightLabEvidence(base).qualified,true);
 assert.equal(evaluateNightLabEvidence({...base,windows:[base.windows[0],{...base.windows[1],sellUsd:2200}]}).qualified,false);
 assert.equal(evaluateNightLabEvidence({...base,windows:[base.windows[0],{...base.windows[1],complete:false}]}).qualified,false);
});
test('liquidity withdrawal overrides buyers and promotional signals',()=>{
 const x=evaluateNightLabEvidence({...base,liquidityWithdrawn:true});
 assert.equal(x.state,'TRASH');assert.equal(x.score,0);assert.equal(x.qualified,false);
});
test('no proof of LP custody or sell quote cannot qualify',()=>{
 const x=evaluateNightLabEvidence({...base,lpCustodyVerified:false,sellQuoteVerified:false});
 assert.equal(x.qualified,false);assert.ok(x.score<=65);
});
test('missing quote and liquidity do not create qualification',()=>{
 const x=evaluateNightLabEvidence({...base,liquidityUsd:null,quoteAgeMinutes:null});
 assert.equal(x.qualified,false);assert.ok(x.missing.includes('LIQUIDITY_USD'));
});
test('fee payer and meaningful buyer counts must be internally consistent',()=>{
 assert.equal(evaluateFlowWindow({...base.windows[0],meaningfulBuyers:45}).eligible,false);
});
test('FDV proxy is explicitly distinguished from market cap',()=>{
 const x=evaluateNightLabEvidence({...base,marketCapUsd:null,fdvUsd:90000});
 assert.equal(x.valuationType,'FDV_PROXY');
});
