import test from 'node:test';
import assert from 'node:assert/strict';
import {GAP_WINDOW,GAP_WALLETS,planGapSlices,
 validateEnhancedPage,validateJournal} from '../src/goget-wallet-gap-wave.mjs';
const a=GAP_WALLETS[0];
const sig1='5'.repeat(88),sig2='7'.repeat(88),sig3='9'.repeat(88);
const slices=planGapSlices();
const timestamp=Math.floor(Date.parse(slices[0].start)/1000)+90;
function tx(signature,seconds=timestamp){return {signature,slot:465100000,
 timestamp:seconds,type:'SWAP'};}
test('exact adjacent UTC seconds: gap wave starts after previous historical end without overlaps',()=>{
 assert.equal(GAP_WINDOW.from,'2026-11-03T08:55:01.000Z');
 assert.equal(GAP_WINDOW.to,'2026-11-04T10:00:00.000Z');
 assert.equal(slices.length,7);
 assert.equal(slices.at(-1).endExclusive,GAP_WINDOW.to);
 for(let i=1;i<slices.length;i++){
  assert.equal(slices[i-1].endExclusive,slices[i].start);
  assert.equal(slices[i].fromUnix,slices[i-1].toUnixInclusive+1);
 }
 assert.deepEqual(GAP_WALLETS.map(x=>x.length>30),[true,true,true]);
 assert.equal(GAP_WINDOW.maxHeliusCalls*GAP_WINDOW.perRequestCreditPlanning,3960);
});
test('validate full historical page, last cursor and chronological ordering',()=>{
 const w=slices[0];
 const res=validateEnhancedPage([tx(sig1,timestamp),tx(sig2,timestamp-1)],
  {wallet:a,window:w});
 assert.equal(res.nextCursor,sig2);
 assert.equal(res.nextLastTime,timestamp-1);
 const follow=validateEnhancedPage([tx(sig3,timestamp-2)],{
  wallet:a,window:w,lastCursor:res.nextCursor,priorLastTime:res.nextLastTime});
 assert.equal(follow.nextCursor,sig3);
 assert.equal(validateEnhancedPage([],{wallet:a,window:w,
  lastCursor:sig3,priorLastTime:timestamp-2}).isEmpty,true);
});
test('untrusted provider signatures, time leakage, duplicates, ordering fail closed',()=>{
 const w=slices[0];
 assert.throws(()=>validateEnhancedPage([tx('invalid')],{wallet:a,window:w}),/PAGE_MISSING_OR_OUT_OF_ORDER/);
 assert.throws(()=>validateEnhancedPage([tx(sig1),tx(sig1)],{wallet:a,window:w}),/PAGE_MISSING_OR_OUT_OF_ORDER/);
 assert.throws(()=>validateEnhancedPage([tx(sig1,timestamp-1),tx(sig2,timestamp)],{wallet:a,window:w}),/PAGE_MISSING_OR_OUT_OF_ORDER/);
 assert.throws(()=>validateEnhancedPage([tx(sig1,w.toUnixInclusive+1)],{wallet:a,window:w}),/PAGE_MISSING_OR_OUT_OF_ORDER/);
 assert.throws(()=>validateEnhancedPage([tx(sig1)],{wallet:a,window:w,lastCursor:sig1}),/PAGE_MISSING_OR_OUT_OF_ORDER/);
 assert.throws(()=>planGapSlices({from:GAP_WINDOW.to,to:GAP_WINDOW.from}),/GAP_SCOPE_INVALID/);
 assert.throws(()=>planGapSlices({from:'2026-11-01',to:'2026-11-06'}),/GAP_SCOPE_INVALID/);
});
test('journal resumes partial cursor but retains complete windows without provider replay',()=>{
 const w=slices[0],empty=validateJournal(null,w,a);
 assert.equal(empty.complete,false);
 assert.equal(empty.cursor,null);
 const p={wallet:a,window_start:w.start,window_end_exclusive:w.endExclusive,
  status:'INCOMPLETE_BUDGET',pages_read:4,examined:320,stored_new:299,
  last_signature:sig1,last_time:timestamp,provider_error:'GLOBAL_HELIUS_BUDGET'};
 const continuation=validateJournal(p,w,a);
 assert.equal(continuation.cursor,sig1);
 assert.equal(continuation.processed,320);
 assert.equal(continuation.complete,false);
 assert.equal(validateJournal({...p,status:'COMPLETE_ENHANCED'},w,a).complete,true);
 assert.throws(()=>validateJournal({...p,window_start:slices[1].start},w,a),/JOURNAL_UNVERIFIED/);
});
test('restoration code cannot mutate live cursors or overwrite forward outcome labels',async()=>{
 const {readFile}=await import('node:fs/promises');
 const code=await readFile('scripts/goget-helius-gap-wave-2.mjs','utf8');
 const schema=await readFile('sql/goget-helius-gap-wave.sql','utf8');
 assert.match(code,/INSERT OR IGNORE INTO smart_wallet_helius_historical_replay/);
 assert.match(code,/smart_wallet_helius_gap_wave_coverage/);
 assert.match(code,/if\(heliusCalls>=GAP_WINDOW.maxHeliusCalls\)/);
 assert.match(code,/await updateJournal\(w,state,'INCOMPLETE_PAGE_CAP'/);
 assert.match(code,/noCursorMutations:true,noWebhookChanges:true/);
 assert.doesNotMatch(code,/UPDATE smart_wallet_live_cursors|UPDATE goget_pre_signal_market_outcomes|INSERT INTO smart_wallet_webhook_events/i);
 assert.match(schema,/PRIMARY KEY\(wallet,window_start,window_end_exclusive\)/);
});
