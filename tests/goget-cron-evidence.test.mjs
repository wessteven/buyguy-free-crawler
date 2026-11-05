import test from 'node:test';import assert from 'node:assert/strict';
import {checkCronEvidence} from '../src/goget-cron-evidence.mjs';
const start='2026-11-04T13:35:00Z',end='2026-11-04T14:00:01Z';
test('denominator never claims absent cron slots were checked',()=>{
 const rows=[0,5,15,20].map(m=>({slot_utc:new Date(Date.parse(start)+m*60000).toISOString(),observed_at:new Date(Date.parse(start)+m*60000+600).toISOString(),status:'RPC_POLLER_STALE_BUT_WEBHOOK_INDEPENDENT',rpc_stale:3,rpc_pending:3}));
 const out=checkCronEvidence({cron:rows,start,end,quota:[],normal:[],raw:[],states:[{wallet:1},{wallet:2},{wallet:3}]});
 assert.equal(out.expectedCronSlots,5);assert.equal(out.cronSlotsWithReceipt,4);
 assert.equal(out.missingCronSlots,1);assert.equal(out.maxInterReceiptMinutes,10);
 assert.equal(out.rpcPendingObserved,4);
});
test('uncertain malformed slot never becomes certified 5 minute success',()=>{
 const r={slot_utc:'2026-11-04T13:37:00Z',status:'OK'};
 const out=checkCronEvidence({cron:[r],start,end,quota:[],normal:[],raw:[],states:[]});
 assert.equal(out.scopeVerified,false);assert.equal(out.extraOrInvalidCronRows,0);
 assert.deepEqual(out.scheduleOffsetsSeconds,[120]);
});

test('five-minute periodic schedule with seconds offset is measured by interval without false missing slots',()=>{
 const start='2026-11-04T13:35:00Z',end='2026-11-04T14:50:00Z';
 const cron=Array.from({length:12},(_,i)=>({
   slot_utc:new Date(Date.parse(start)+i*300000+27000).toISOString(),
   observed_at:new Date(Date.parse(start)+i*300000+39000).toISOString(),
   status:'RPC_POLLER_STALE_BUT_WEBHOOK_INDEPENDENT',rpc_stale:3,rpc_pending:3
 }));
 const result=checkCronEvidence({start,end,cron,quota:[],normal:[],raw:[],states:[{}, {}, {}]});
 assert.equal(result.cronSlotsWithReceipt,12);
 assert.equal(result.expectedCronSlots,12);
 assert.equal(result.missingCronSlots,0);
 assert.deepEqual(result.scheduleOffsetsSeconds,[27]);
 assert.equal(result.fractionObserved,1);
});
