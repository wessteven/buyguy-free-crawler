import test from 'node:test';
import assert from 'node:assert/strict';
import {assessGreenLight} from '../src/green-gate.mjs';
import {SPL_TOKEN} from '../src/token-risk.mjs';
const now=Date.parse('2026-10-19T12:00:00Z');
const address='So11111111111111111111111111111111111111112',key='solana:'+address;
const asset={asset_key:key,chain:'solana',address,pool:'poolABC',status:'ALIVE',
  risk_status:'PARTIAL_ONCHAIN_REVIEW',last_seen:'2026-10-19T11:55:00Z',
  liquidity:100000,price:0.01};
function event(kind,properties={},time='2026-10-19T11:55:00Z'){
 return {asset_key:key,kind,at:time,note:JSON.stringify(properties)};
}
const mint=()=>event('MINT_AUTHORITY_REVIEW',{
 checkedAt:'2026-10-19T11:55:00Z',program:SPL_TOKEN,decimals:9,
 mintFlags:[],holderStatus:'TOKEN_ACCOUNT_BALANCES_SCREENED',holderFlags:[],
 top1Bps:1400,top5Bps:4800,top20Bps:7900,extensionTypes:[]
});
const round=()=>event('ROUNDTRIP_QUOTE',{
 source:'Jupiter read-only buy/sell route quotes',
 label:'BOTH_DIRECTIONS_QUOTED',buyRoute:true,sellRoute:true,flags:[],
 maxImpactPct:1,estimatedRoundTripLossPct:4,marketVsQuotePct:2
});
const owner=()=>event('BENEFICIAL_OWNER_AUDIT',{
 verifier:'buyguy-beneficial-owners-v1',assetKey:key,verdict:'VERIFIED_DISTRIBUTION',
 vaultsExcluded:true,pool:asset.pool,onchainSource:'Helius'
});
const pool=()=>event('POOL_CUSTODY_AUDIT',{
 verifier:'buyguy-pool-custody-v1',assetKey:key,chain:'solana',pool:asset.pool,
 verdict:'LOCK_VERIFIED',onchainSource:'VERIFIED_POOL_STATE',
 adminControlsReviewed:true,unlockAfterMs:now+30*86400000
});
test('Mint, liquidity and Jupiter quotes do not imply green without owner and LP evidence',()=>{
 const r=assessGreenLight(asset,{mintEvent:mint(),routeEvent:round(),now});
 assert.equal(r.green,false);
 assert.equal(r.status,'PARTIAL');
 assert.equal(r.passed,5);
 assert.deepEqual(r.blocking,['Beneficial owners','Pool custody / LP lock']);
});
test('Seven independently identified stages must all pass to earn green screen',()=>{
 const r=assessGreenLight(asset,{mintEvent:mint(),routeEvent:round(),
  ownerEvent:owner(),poolEvent:pool(),now});
 assert.equal(r.green,true);
 assert.equal(r.passed,7);
 assert.equal(r.status,'SCREEN_PASSED');
 assert.equal(r.blocking.length,0);
 assert.match(r.warning,/cannot guarantee/);
});
test('FAKE risk_status=FULL_REVIEW_PASSED alone cannot override absent evidence',()=>{
 const r=assessGreenLight({...asset,risk_status:'FULL_REVIEW_PASSED'},{now});
 assert.equal(r.green,false);
 assert.notEqual(r.status,'SCREEN_PASSED');
});
test('Exactly matching chain, pool, mint and timestamp required for owner and lock evidence',()=>{
 for(const field of ['asset_key','at','note']){
  const altered=owner();
  if(field==='asset_key')altered[field]='solana:ANOTHER';
  if(field==='at')altered[field]='2026-10-15T00:00:00Z';
  if(field==='note')altered.note=JSON.stringify({...JSON.parse(altered.note),pool:'wrong-pool'});
  const r=assessGreenLight(asset,{mintEvent:mint(),routeEvent:round(),ownerEvent:altered,poolEvent:pool(),now});
  assert.equal(r.green,false,field);
 }
 const badPool=pool();
 badPool.note=JSON.stringify({...JSON.parse(badPool.note),pool:'other'});
 assert.equal(assessGreenLight(asset,{mintEvent:mint(),routeEvent:round(),ownerEvent:owner(),
    poolEvent:badPool,now}).green,false);
});
test('Quote after 20 minutes, old mint review, or no current liquidity loses green',()=>{
 assert.equal(assessGreenLight(asset,{mintEvent:mint(),
  routeEvent:round(),ownerEvent:owner(),poolEvent:pool(),now:now+25*60000}).green,false);
 assert.equal(assessGreenLight({...asset,liquidity:1000},{
  mintEvent:mint(),routeEvent:round(),ownerEvent:owner(),poolEvent:pool(),now}).green,false);
 const ancient=event('MINT_AUTHORITY_REVIEW',JSON.parse(mint().note),'2026-10-17T11:00:00Z');
 assert.equal(assessGreenLight(asset,{mintEvent:ancient,routeEvent:round(),
 ownerEvent:owner(),poolEvent:pool(),now}).green,false);
});
test('Known mint-control or concentration risks always override positive external evidence',()=>{
 const r=assessGreenLight({...asset,risk_status:'MINT_CONTROL_RISK'},{
  mintEvent:mint(),routeEvent:round(),ownerEvent:owner(),poolEvent:pool(),now});
 assert.equal(r.green,false);
 assert.equal(r.status,'RISK');
});
test('A spoofed route missing reverse quote, or claimed on-chain lock lacking verifier fails',()=>{
 const r=round(),bad=JSON.parse(r.note);
 bad.sellRoute=false;r.note=JSON.stringify(bad);
 assert.equal(assessGreenLight(asset,{mintEvent:mint(),routeEvent:r,
  ownerEvent:owner(),poolEvent:pool(),now}).green,false);
 const badPool=pool(),value=JSON.parse(badPool.note);delete value.onchainSource;
 badPool.note=JSON.stringify(value);
 assert.equal(assessGreenLight(asset,{mintEvent:mint(),routeEvent:round(),
  ownerEvent:owner(),poolEvent:badPool,now}).green,false);
});
test('Robinhood requires its own verified program/route and cannot inherit Solana evidence',()=>{
 const e='0x2cc0fac44b8252f6b10208b091aff2c94b4da77d';
 const rh={...asset,chain:'robinhood',address:e,asset_key:'robinhood:'+e};
 assert.equal(assessGreenLight(rh,{mintEvent:mint(),routeEvent:round(),
  ownerEvent:owner(),poolEvent:pool(),now}).green,false);
});
test('Unknown or malformed input always fails closed',()=>{
 assert.equal(assessGreenLight(null,{now}).green,false);
 assert.equal(assessGreenLight({asset_key:'solana:foo',chain:'solana',address:'bar'},{now}).green,false);
 const malformed=round();malformed.note='{not json';
 assert.equal(assessGreenLight(asset,{mintEvent:mint(),routeEvent:malformed,now}).green,false);
});
