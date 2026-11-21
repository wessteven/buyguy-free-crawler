import test from 'node:test';
import assert from 'node:assert/strict';
import {collect,ORIGINAL_RUN} from '../scripts/goget-event-pilot-historical-evidence.mjs';
test('failed run read does not suppress independent roster, reconciliation or matured outcome reads',async()=>{
 let calls=0;
 const r=await collect({read:async(sql,params)=>{
   calls++;assert.deepEqual(params,[ORIGINAL_RUN]);assert.match(sql,/^SELECT /);
   if(calls===1)throw Error('sensitive provider details');
   if(sql.includes('FROM goget_event_pilot_outcomes'))return [{horizon_min:1440,status:'MISSING_FUTURE_QUOTE_COVERAGE',n:10}];
   return [];
 }});
 assert.equal(calls,6);assert.equal(r.queriesVerified,5);
 assert.equal(r.status,'HISTORICAL_EVIDENCE_INCOMPLETE');assert.equal(r.rosterVerified,false);
 assert.equal(r.records.outcomes[0].n,10);assert.equal(r.errors[0].reason,'READ_UNVERIFIED');
 assert.ok(!JSON.stringify(r).includes('sensitive'));
});
test('ten exact stored pools establish roster only; neither data nor expiry creates an efficacy claim',async()=>{
 const r=await collect({read:async(sql)=>sql.includes('FROM goget_event_pilot_roster')?
   Array.from({length:10},(_,i)=>({pool:'pool'+i,mint:'mint'+i,asset_key:'solana:mint'+i})):
   sql.includes('FROM goget_event_pilot_runs')?[{run_id:ORIGINAL_RUN}]:[]});
 assert.equal(r.rosterVerified,true);assert.equal(r.queriesVerified,6);
 assert.equal(r.status,'HISTORICAL_RECORDS_ONLY_EFFICACY_UNVERIFIED');
 assert.equal(r.heliusCalls,0);assert.equal(r.d1Writes,0);assert.equal(r.trades,0);
});
