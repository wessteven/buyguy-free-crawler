import test from 'node:test';
import assert from 'node:assert/strict';
import {choosePaperEntry,choosePaperExit,markPosition,PAPER_CONFIG} from '../src/paper-core.mjs';
const now=Date.parse('2026-10-19T00:00:00Z');
const asset={
 asset_key:'solana:So11111111111111111111111111111111111111112',chain:'solana',pool:'POOL',
 risk_status:'PAPER_ELIGIBLE',status:'ALIVE',score:85,observations:5,
 price:0.01,liquidity:72000,market_cap:85000,buys_m5:40,sells_m5:10,
 last_seen:'2026-10-18T23:54:00Z',pool_created:'2026-10-18T18:00:00Z'
};
const context={now,cash:1000,openCount:0,realized:0};
test('Never paper-buy a token with incomplete risk checks',()=>{
 const result=choosePaperEntry({...asset,risk_status:'MINT_CONTROLS_REVOKED'},context);
 assert.equal(result.ok,false);
 assert.ok(result.reasons.includes('NO_VERIFIED_PAPER_APPROVAL'));
});
test('Entry accounts for slippage, fee, stop, target and precise cost',()=>{
 const result=choosePaperEntry(asset,context);
 assert.equal(result.ok,true);
 assert.equal(result.cost,40);
 assert.ok(Math.abs(result.price-0.0102)<1e-10);
 assert.ok(Math.abs(result.units-(40-.12)/.0102)<1e-7);
 assert.ok(Math.abs(result.stop-(result.price*.88))<1e-9);
 assert.ok(Math.abs(result.target-(result.price*1.35))<1e-9);
});
test('Stale quotes, pool switch, cooldown and max positions block entries',()=>{
 const old={...asset,last_seen:'2026-10-18T21:00:00Z'};
 assert.ok(choosePaperEntry(old,context).reasons.includes('QUOTE_STALE'));
 assert.ok(choosePaperEntry(asset,{...context,lastExit:'2026-10-18T23:00:00Z'}).reasons.includes('COOLDOWN'));
 assert.ok(choosePaperEntry(asset,{...context,openCount:8}).reasons.includes('MAX_POSITIONS'));
 assert.ok(choosePaperEntry(asset,{...context,realized:-205}).reasons.includes('LOSS_LIMIT'));
});
test('Stop sells use worse than quoted price, fee, and produce realised loss',()=>{
 const entry=choosePaperEntry(asset,context);
 const pos={id:'1',asset_key:asset.asset_key,pool:asset.pool,status:'OPEN',
  opened_at:new Date(now-1800000).toISOString(),entry_usd:entry.price,stop_usd:entry.stop,
  target_usd:entry.target,units:entry.units,cost_usd:entry.cost};
 const stop=choosePaperExit(pos,{...asset,price:entry.stop*.99},context);
 assert.equal(stop.ok,true);
 assert.equal(stop.reason,'STOP');
 assert.ok(stop.price<entry.stop*.99);
 assert.ok(stop.realized<0);
 assert.ok(stop.proceeds<40);
 assert.equal(choosePaperExit(pos,{...asset,pool:'SWITCH',price:entry.stop*.8},context).reason,'POOL_IDENTITY_UNCERTAIN');
 assert.equal(choosePaperExit(pos,{...asset,last_seen:'2026-10-18T20:00:00Z',price:entry.stop*.8},context).reason,'PRICE_STALE');
});
test('Mark-to-market uses net liquidation assumption and refuses stale marks',()=>{
 const entry=choosePaperEntry(asset,context);
 const p={asset_key:asset.asset_key,pool:asset.pool,cost_usd:40,units:entry.units};
 const good=markPosition(p,asset,context);
 assert.equal(good.stale,false);
 assert.ok(good.unrealized<0);
 assert.equal(markPosition(p,{...asset,pool:'different'},context).estimatedValue,null);
});
