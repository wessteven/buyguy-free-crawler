import test from 'node:test';
import assert from 'node:assert/strict';
import { auditTrackCA,BASELINE_IDS,REQUIREMENTS } from '../src/audit.mjs';
import {ASSETS} from '../../trackca/src/watchlist.mjs';
const NOW=Date.parse('2026-11-02T09:30:00Z');
const stamp=(mins=0)=>new Date(NOW-mins*60000).toISOString();
const source={run_id:'trackca-999',started_at:stamp(2),status:'INCOMPLETE'};
const a=ASSETS.find(x=>x.id==='pons');
const c={asset_id:'pons',token_address:a.address};
const p={run_id:source.run_id,asset_id:'pons',chain:a.chain,token_address:a.address,pool_id:'0x1234',
  observed_at:stamp(2),volume_m5_usd:0,volume_h1_usd:123,volume_h24_usd:456};
test('frozen roster and denominator are strictly enforced',()=>{
 assert.equal(BASELINE_IDS.length,22);
 assert.equal(REQUIREMENTS.length,10);
 const r=auditTrackCA({run:source,now:NOW});
 assert.equal(r.expected,220);
 assert.equal(r.checks.length,220);
 assert.equal(r.complete,false);
 assert.throws(()=>auditTrackCA({assets:ASSETS.slice(1),now:NOW}),/BASELINE_ROSTER_CHANGED/);
});
test('persisted exact pool evidence is recorded but never falsely marked fully verified',()=>{
 const r=auditTrackCA({run:source,coverage:[c],pairs:[p],now:NOW});
 const q=k=>r.checks.find(x=>x.key==='pons/'+k);
 assert.equal(q('identity_join').status,'SOURCE_RECORDED');
 assert.equal(q('exact_pool_record').status,'SOURCE_RECORDED');
 assert.equal(q('volume_5m').status,'SOURCE_RECORDED');
 assert.equal(q('independent_buyers').status,'UNVERIFIED');
 assert.equal(q('executable_sell_depth').status,'UNVERIFIED');
 assert.equal(r.complete,false);
});
test('reject address mismatches, old records, absent runs, and future-dated evidence',()=>{
 let r=auditTrackCA({run:source,coverage:[c],pairs:[{...p,token_address:'0xWRONG'}],now:NOW});
 assert.equal(r.checks.find(x=>x.key==='pons/exact_pool_record').status,'MISSING');
 r=auditTrackCA({run:source,pairs:[{...p,observed_at:stamp(18)}],now:NOW});
 assert.equal(r.checks.find(x=>x.key==='pons/exact_pool_record').status,'STALE');
 r=auditTrackCA({run:source,pairs:[{...p,observed_at:new Date(NOW+360000).toISOString()}],now:NOW});
 assert.equal(r.checks.find(x=>x.key==='pons/exact_pool_record').status,'STALE');
 r=auditTrackCA({run:{...source,started_at:stamp(80)},coverage:[c],pairs:[p],now:NOW});
 assert.equal(r.status,'SOURCE_RUN_GAP');
 assert.equal(r.counts.SOURCE_RECORDED,0);
});
test('holder delta requires two timestamp-separated actual records',()=>{
 const h={asset_id:'pons',holders_count:100,observed_at:stamp(1)};
 let r=auditTrackCA({run:source,holders:[h],now:NOW});
 assert.equal(r.checks.find(x=>x.key==='pons/holder_delta').status,'MISSING');
 r=auditTrackCA({run:source,holders:[h,{...h,holders_count:98,observed_at:stamp(20)}],now:NOW});
 assert.equal(r.checks.find(x=>x.key==='pons/holder_delta').status,'SOURCE_RECORDED');
});
test('a drop against a comparable prior measured audit is a regression, not successful completion',()=>{
 const first=auditTrackCA({run:source,coverage:[c],pairs:[p],now:NOW});
 const prev={version:first.version,source_run_id:'previous',source_recorded:first.counts.SOURCE_RECORDED};
 const second=auditTrackCA({run:{...source,run_id:'trackca-1000'},previous:prev,now:NOW});
 assert.equal(second.regression,true);
 assert.equal(second.status,'REGRESSION');
 assert.equal(second.previousObserved,first.counts.SOURCE_RECORDED);
});
