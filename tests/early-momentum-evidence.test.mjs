import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateEarlyMomentumSnapshot,compareUndatedMarketImage}
 from '../src/early-momentum-evidence.mjs';
const mint='4CxjZyMNoF1p6eXHXHv1TWpS2X47CuUmLwtGe18spump';
const source={
 mint,asOf:'2026-10-28T06:10:00Z',price:0.00009981,
 ema9_15m:0.00010089,ema21_15m:0.00009395,ema9_1h:0.00009243,
 atr15m:0.0000100,confirmationLow:0.0001104,confirmationHigh:0.0001139
};
test('user-supplied MIHAO 06:10 UTC indicators remain confirmation pending',()=>{
 const r=evaluateEarlyMomentumSnapshot(source);
 assert.equal(r.kind,'RESEARCH_ONLY_SNAPSHOT');
 assert.equal(r.levelState,'BELOW_CONFIRMATION');
 assert.equal(r.candidateClass,'CONFIRMATION_PENDING');
 assert.equal(r.over15mEma9,false);
 assert.equal(r.over15mEma21,true);
 assert.equal(r.over1hEma9,true);
 assert.ok(r.atrPctOfPrice>10&&r.atrPctOfPrice<10.1);
 assert.equal(r.buyQualified,false);
 assert.equal(r.candlesVerified,false);
 assert.equal(r.independentBuyersVerified,false);
 assert.equal(r.uniqueBuyers,null);
});
test('later undated image cannot revise earlier evidence or manufacture executable P&L',()=>{
 const past=evaluateEarlyMomentumSnapshot(source);
 const image=compareUndatedMarketImage({baselinePrice:source.price,observedPrice:0.0002101});
 assert.ok(Math.abs(image.percentDifference-110.5)<0.1);
 assert.equal(image.screenshotTime,null);
 assert.equal(image.signalTime,null);
 assert.equal(image.breakoutTime,null);
 assert.equal(image.executableReturn,null);
 assert.equal(image.buyQualified,false);
 assert.equal(evaluateEarlyMomentumSnapshot(source).candidateClass,past.candidateClass);
});
test('above price zone alone does not verify momentum, safety or fill',()=>{
 const r=evaluateEarlyMomentumSnapshot({...source,price:0.0002101,
  asOf:'2026-10-29T06:10:00Z'});
 assert.equal(r.levelState,'ABOVE_ZONE_UNCONFIRMED');
 assert.equal(r.buyQualified,false);
 assert.equal(r.candlesVerified,false);
 assert.equal(r.liquidityVerified,false);
 assert.equal(r.executableExitVerified,false);
});
test('fail closed on absent timestamp, malformed mint, invalid values and inverted zones',()=>{
 for(const change of [
  {asOf:null},{asOf:'7:06'},{asOf:'2026-10-28 06:10 UTC'},
  {mint:'MIHAO'}, {price:0},{atr15m:-1},{ema9_1h:NaN},
  {confirmationLow:0.000114,confirmationHigh:0.000110}
 ]){
  assert.throws(()=>evaluateEarlyMomentumSnapshot({...source,...change}));
 }
 assert.throws(()=>compareUndatedMarketImage({baselinePrice:source.price,observedPrice:null}));
});
