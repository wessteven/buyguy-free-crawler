import test from 'node:test';import assert from 'node:assert/strict';
import {evaluateRpcSourceLedger} from '../src/goget-rpc-source-ledger.mjs';
import {GAP_WALLETS} from '../src/goget-wallet-gap-wave.mjs';
const a='2026-11-05T02:16:00.000Z';
const states=GAP_WALLETS.map(wallet=>({wallet,status:'CHECKPOINT_CONNECTED',
 last_checked_at:'2026-11-05T02:15:00Z',gaps:0}));
const sig=GAP_WALLETS.map(wallet=>({wallet,n:101,failed:2}));
const cycles=[0,5,10,15].map((minutes,i)=>({
 slot_utc:new Date(Date.parse('2026-11-05T02:00:00Z')+minutes*60000).toISOString(),
 trigger:i===0?'manual':'cron',status:'SOURCES_ARCHIVED_GAPS_DISCLOSED',
 wallets_scanned:3,helius_calls:3,credits_reserved:30
}));
const args={cycles,states,signatures:sig,gaps:[],rpcBudget:[{day:'2026-11-05',reserved_credits:120}],
 webhookBudget:[{day:'2026-11-05',observed_deliveries:170}],asOf:a,expectedWallets:GAP_WALLETS};
test('three original wallets and complete separate cron cycle denominators retained',()=>{
 const r=evaluateRpcSourceLedger(args);
 assert.equal(r.expectedWallets,3);
 assert.equal(r.cronCycles,3);
 assert.equal(r.completeThreeWalletCronCycles,3);
 assert.equal(r.missingIntervalsBetweenCronReceipts,0);
 assert.equal(r.utcBudget.localCombinedEstimate,290);
 assert.equal(r.status,'RECORDED_CRON_CYCLES_THREE_WALLETS_NO_KNOWN_GAPS');
});
test('missing trigger or partial source run never reported complete',()=>{
 const r=evaluateRpcSourceLedger({...args,cycles:cycles.filter((_,i)=>i!==2)});
 assert.equal(r.missingIntervalsBetweenCronReceipts,1);
 assert.equal(r.status,'SOURCE_COVERAGE_INCOMPLETE_OR_GAPS');
 const p=evaluateRpcSourceLedger({...args,cycles:[cycles[0],
  {...cycles[1],wallets_scanned:2,helius_calls:2}]});
 assert.equal(p.status,'SOURCE_COVERAGE_INCOMPLETE_OR_GAPS');
});
test('manual-only is not evidence of scheduled collection',()=>{
 assert.equal(evaluateRpcSourceLedger({...args,cycles:[cycles[0]]}).status,
  'MANUAL_VERIFIED_CRON_NOT_YET_OBSERVED');
 assert.equal(evaluateRpcSourceLedger({...args,states:states.slice(1)}).status,'MISSING_WALLET_SCOPE');
});

test('three scanned wallets with an acknowledged source gap are NOT complete',()=>{
 const changed={...cycles[2],source_gaps:1};
 const report=evaluateRpcSourceLedger({...args,cycles:[cycles[0],cycles[1],changed,cycles[3]]});
 assert.equal(report.completeThreeWalletCronCycles,2);
 assert.equal(report.status,'SOURCE_COVERAGE_INCOMPLETE_OR_GAPS');
});
test('provider returning empty or baseline source cannot silently certify forward continuity',()=>{
 const badStates=states.map((s,i)=>i===0?{...s,status:'EMPTY_PROVIDER_PAGE_UNVERIFIED'}:s);
 const report=evaluateRpcSourceLedger({...args,states:badStates});
 assert.equal(report.sourceWalletsNotContiguouslyVerified,1);
 assert.equal(report.status,'SOURCE_COVERAGE_INCOMPLETE_OR_GAPS');
});
