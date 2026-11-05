import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {GAP_WALLETS} from '../src/goget-wallet-gap-wave.mjs';
import {LEGACY_REPLAY_LIMITS as L,validateExactReplayRoster,
 validateReplaySourcePage,planReplayPage,verifiedJournal,testHistoricalBudget}
 from '../src/goget-legacy-live-gap-replay.mjs';
const at='2026-11-05T06:45:00.000Z';
const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const sig=i=>'5'.repeat(86)+alphabet[Math.floor(i/58)]+alphabet[i%58];
const tx=(i,slot=500000000-i)=>({signature:sig(i),slot,blockTime:Math.floor(Date.parse(at)/1000)-30,err:null});
test('all THREE canonical legacy source wallets required, no roster reduction or substitution',async()=>{
 const cohort=JSON.parse(await readFile('research/smart-wallet-live-cohort.json','utf8'));
 assert.deepEqual(validateExactReplayRoster(cohort,GAP_WALLETS),GAP_WALLETS);
 assert.equal(L.walletCount,3);
 assert.equal(L.maxCallsPerRun,18);
 assert.equal(L.maxPagesPerWalletPerRun,6);
 assert.equal(L.dayHistoricalCredits,300);
 assert.equal(L.sharedDailyRpcCredits,9000);
 assert.equal(L.combinedLocalCredits,20000);
 assert.equal(L.creditsPerCall,10);
 assert.equal(L.stopUtc,'2026-11-08T00:00:00Z');
 assert.throws(()=>validateExactReplayRoster(cohort.slice(1),GAP_WALLETS),/ROSTER_UNVERIFIED/);
 assert.throws(()=>validateExactReplayRoster(cohort,[GAP_WALLETS[0],GAP_WALLETS[1],'A'.repeat(44)]),/ROSTER_UNVERIFIED/);
});
test('exact old signature terminates source bridge; no older signatures mislabeled',()=>{
 const before=sig(0),old=sig(4);
 const page=validateReplaySourcePage([tx(1),tx(2),tx(3),tx(4),tx(5)],{before,at});
 const plan=planReplayPage(page,old);
 assert.equal(plan.foundOldAnchor,true);
 assert.deepEqual(plan.archived.map(x=>x.signature),[sig(1),sig(2),sig(3),sig(4)]);
 assert.equal(plan.nextBefore,old);
 assert.equal(plan.reachedSourceEnd,false);
});
test('continuous multi-page provenance has strict <= slot, no repeated before signature',()=>{
 const first=validateReplaySourcePage([tx(1),tx(2),tx(3)],{before:sig(0),at});
 const plan=planReplayPage(first,sig(7));
 assert.equal(plan.foundOldAnchor,false);
 assert.equal(plan.shortPage,true);
 const second=validateReplaySourcePage([tx(4),tx(5),tx(6),tx(7)],{
  before:plan.nextBefore,at,priorLastSlot:plan.nextLastSlot});
 assert.equal(planReplayPage(second,sig(7)).foundOldAnchor,true);
 assert.throws(()=>validateReplaySourcePage([tx(5,500000000)],{
  before:sig(3),at,priorLastSlot:499999997}),/PAGE_IDENTITY_UNVERIFIED/);
 assert.throws(()=>validateReplaySourcePage([tx(4),tx(4)],{before:sig(3),at}),
  /PAGE_IDENTITY_UNVERIFIED/);
 assert.throws(()=>validateReplaySourcePage([tx(3)],{before:sig(3),at}),
  /PAGE_IDENTITY_UNVERIFIED/);
});
test('failed transactions are preserved as source receipts, NOT trading signals',()=>{
 const page=validateReplaySourcePage([{...tx(1),err:{InstructionError:[0,'custom']}},
  tx(2)],{before:sig(0),at});
 assert.equal(page[0].failed,1);
 assert.equal(page[1].failed,0);
 assert.equal(L.trades,0);
});
test('provider malformed, future and oversize source pages are fail-closed',()=>{
 const kwargs={before:sig(0),at};
 assert.throws(()=>validateReplaySourcePage([tx(1,0)],kwargs),/PAGE_IDENTITY_UNVERIFIED/);
 assert.throws(()=>validateReplaySourcePage([{...tx(1),blockTime:Math.floor(Date.parse(at)/1000)+600}],kwargs),
  /PAGE_IDENTITY_UNVERIFIED/);
 assert.throws(()=>validateReplaySourcePage(Array.from({length:101},(_,i)=>tx(i+1)),kwargs),
  /PAGE_INPUT_INVALID/);
 assert.throws(()=>validateReplaySourcePage([tx(1)],{before:'garbage',at}),
  /PAGE_INPUT_INVALID/);
 assert.deepEqual(planReplayPage([],sig(7)),{
  archived:[],foundOldAnchor:false,nextBefore:null,nextLastSlot:null,
  reachedSourceEnd:true,shortPage:true
 });
});
test('retained replay journal anchors must match actual ORIGINAL legacy cursor',()=>{
 const wallet=GAP_WALLETS[0],legacyCursor=sig(95),sourceHead=sig(1);
 const fresh=verifiedJournal(null,{wallet,legacyCursor,sourceHead});
 assert.equal(fresh.status,'NOT_STARTED');
 const row={wallet,legacy_cursor:legacyCursor,seed_head:sourceHead,
  before_signature:sig(30),last_slot:499999970,pages:3,examined:290,
  inserted:285,status:'INCOMPLETE_PAGE_CAP'};
 const resumed=verifiedJournal(row,{wallet,legacyCursor,sourceHead:sig(0)});
 assert.equal(resumed.seedHead,sourceHead);
 assert.equal(resumed.before,sig(30));
 assert.equal(resumed.pages,3);
 assert.equal(resumed.found,false);
 assert.throws(()=>verifiedJournal(row,{wallet,legacyCursor:sig(94),sourceHead:sig(0)}),
  /JOURNAL_UNVERIFIED/);
 assert.equal(verifiedJournal({...row,status:'SOURCE_EXHAUSTED_ANCHOR_MISSING'},
  {wallet,legacyCursor,sourceHead}).blocked,true);
 assert.equal(verifiedJournal({...row,status:'ANCHOR_FOUND_SOURCE_RECONCILE_PENDING'},
  {wallet,legacyCursor,sourceHead}).found,true);
});
test('daily replay cap and shared LIVE RPC/WEBHOOK guard are independently enforced',()=>{
 assert.equal(testHistoricalBudget({rpcAlready:8600,webhookDeliveries:3000,replayAlready:290}),true);
 assert.equal(testHistoricalBudget({rpcAlready:8995,webhookDeliveries:0,replayAlready:0}),false);
 assert.equal(testHistoricalBudget({rpcAlready:1000,webhookDeliveries:18995,replayAlready:0}),false);
 assert.equal(testHistoricalBudget({rpcAlready:8500,webhookDeliveries:0,replayAlready:295}),false);
 assert.throws(()=>testHistoricalBudget({rpcAlready:-1,webhookDeliveries:0,replayAlready:0}),
  /BUDGET_INPUT_UNVERIFIED/);
});
test('historical recovery script has no UPDATE/DELETE in existing source tables',async()=>{
 const script=await readFile('scripts/goget-legacy-live-gap-repair.mjs','utf8');
 const sql=await readFile('sql/goget-legacy-live-gap-replay.sql','utf8');
 assert.match(script,/getSignaturesForAddress/);
 assert.match(script,/await reserveOne\(\)/);
 assert.match(script,/journalUpdate/);
 assert.match(script,/smart_wallet_live_events/);
 assert.match(script,/smart_wallet_helius_historical_replay/);
 assert.match(script,/goget_rpc_source_signatures/);
 assert.match(script,/COMPLETE_ALL_THREE_HELIUS_SIGNATURE_BRIDGES/);
 assert.doesNotMatch(script,/(UPDATE|DELETE FROM|INSERT INTO)\s+smart_wallet_(?:live_cursors|live_events|helius_historical_replay|webhook_events)/i);
 assert.doesNotMatch(script,/(UPDATE|DELETE FROM|INSERT INTO)\s+goget_rpc_source_(?:wallets|signatures|cycles)/i);
 assert.doesNotMatch(sql,/CREATE TABLE IF NOT EXISTS smart_wallet_/);
 assert.doesNotMatch(script,/sendTransaction|signTransaction|privateKey/);
});
