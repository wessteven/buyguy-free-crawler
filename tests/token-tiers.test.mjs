import test from 'node:test';
import assert from 'node:assert/strict';
import {tokenTier,countCoverage,selectRefreshTargets} from '../src/token-tiers.mjs';
const now='2026-10-19T07:30:00Z';
const sample=(id,props={})=>({
 asset_key:'solana:'+id,chain:'solana',address:id,pinned:0,
 status:'ALIVE',risk_status:'PARTIAL_ONCHAIN_REVIEW',
 last_seen:'2026-10-19T07:22:00Z',score:77,
 liquidity:73000,price:0.002,buys_m5:30,sells_m5:12,change_h1:8,has_position:0,...props
});
test('HOT means fresh liquidity + activity, not merely a high score',()=>{
 assert.equal(tokenTier(sample('A'),Date.parse(now)).tier,'HOT');
 for(const data of [{liquidity:49999},{score:59},{buys_m5:4},
   {buys_m5:8,sells_m5:30},{change_h1:-20},
   {last_seen:'2026-10-19T04:00:00Z'},{risk_status:'MINT_CONTROL_RISK'},
   {status:'DEAD'},{last_seen:null}]){
  const t=tokenTier(sample('A',data),Date.parse(now));
  assert.equal(t.tier,'NOT',JSON.stringify(data));
 }
});
test('Fresh quote turns a previously dormant token HOT, no historical deletion needed',()=>{
 const old=sample('B',{status:'DEAD',last_seen:'2026-10-18T00:00:00Z'});
 assert.equal(tokenTier(old,Date.parse(now)).reason,'DORMANT_RECHECK_DUE');
 assert.equal(tokenTier({...old,status:'ALIVE',last_seen:'2026-10-19T07:25:00Z'},
   Date.parse(now)).tier,'HOT');
});
test('Coverage counts distinguish new data from total stored assets',()=>{
 const rows=[sample('A'),sample('B',{status:'DEAD'}),sample('C',{last_seen:null,pinned:1}),
   sample('D',{last_seen:'2026-10-19T05:00:00Z'})];
 const x=countCoverage(rows,Date.parse(now));
 assert.deepEqual(x,{total:4,hot:1,not:3,fresh30:2,stale120:2,noQuote:1,
   dormant:1,pinned:1,percentFresh:50});
});
test('At 176 assets, scheduler shares refresh slots with HOT, pinned and stale NOT cohorts',()=>{
 const hot=Array.from({length:32},(_,i)=>sample('HOT'+i));
 const pinned=Array.from({length:15},(_,i)=>sample('PIN'+i,{pinned:1}));
 const dormant=Array.from({length:129},(_,i)=>sample('COLD'+i,{
   status:'DEAD',score:1,last_seen:'2026-10-15T00:00:00Z'}));
 const universe=[...hot,...pinned,...dormant];
 const selected=selectRefreshTargets(universe,{limit:20,now});
 assert.equal(selected.length,20);
 assert.ok(selected.some(x=>x.asset_key.includes('HOT')));
 assert.ok(selected.some(x=>x.asset_key.includes('PIN')));
 assert.ok(selected.some(x=>x.asset_key.includes('COLD')));
 const checked=new Set();
 for(let t=0;t<48;t++){
  const timestamp=new Date(Date.parse(now)+t*600000).toISOString();
  for(const row of selectRefreshTargets(universe,{limit:20,now:timestamp}))
   checked.add(row.asset_key);
 }
 assert.equal(checked.size,176,'No cold token should be permanently starved');
});
test('Never drop pinned or open paper position; exclude archived invalid/no-data from refresh',()=>{
 const inputs=[sample('PAPER',{has_position:1,score:0,status:'DEAD'}),
 sample('ARCH',{status:'TRASH',pinned:1}),sample('PIN',{status:'STATIC',pinned:1}),
 sample('HOT'),sample('COLD',{status:'DEAD'})];
 const v=selectRefreshTargets(inputs,{now,limit:4});
 assert.ok(v.some(x=>x.asset_key==='solana:PAPER'));
 assert.ok(v.some(x=>x.asset_key==='solana:PIN'));
 assert.ok(!v.some(x=>x.asset_key==='solana:ARCH'));
 assert.equal(new Set(v.map(x=>x.asset_key)).size,v.length);
});
test('HOT is not contract approval nor trade permission',()=>{
 const asset=sample('HOT',{risk_status:'UNVERIFIED',score:90});
 assert.equal(tokenTier(asset,Date.parse(now)).tier,'HOT');
 assert.equal(asset.risk_status,'UNVERIFIED');
});
