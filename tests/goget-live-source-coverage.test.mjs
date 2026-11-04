import test from 'node:test';
import assert from 'node:assert/strict';
import {expectedWebhookWallets,assessLiveCoverage,LIVE_COVERAGE_BOUNDS} from '../src/goget-live-source-coverage.mjs';
import {readFile} from 'node:fs/promises';
const source=JSON.parse(await readFile('research/smart-wallet-webhook-cohort.json','utf8'));
const toml=await readFile('wrangler.smart-wallet.toml','utf8');
const wanted=expectedWebhookWallets(source,toml);
const inputs={wanted,recentWalletRows:[],deliveries:[],cursors:wanted.slice(0,3).map(wallet=>({
 wallet,status:'PENDING_BACKFILL',gaps:9,last_polled_at:'2026-11-04T13:00:00Z'})),
 control:[{state:'ARMED'}],rawHealth:[],budget:[],asOf:'2026-11-04T13:20:00Z'};
test('canonical enabled roster is 12 of 14 and exactly matches Worker configuration',()=>{
 assert.equal(wanted.length,12);
 assert.equal(source.length,14);
 assert.deepEqual(source.filter(x=>!x.webhookEnabled).map(x=>x.wallet).sort(),
  ['kiwiC4pg5mC4N5AhpXc4Av3V6oV7Sn2p3CqB7NeHbJJ','3wySUKHiD15kUD7sunNe1FQpogv2FK7Tw7TzSJyC9Ft8'].sort());
 assert.equal(LIVE_COVERAGE_BOUNDS.maxD1Queries,6);
});
test('provider arrivals and all 12 wallet denominators remain explicit even with zero observed events',()=>{
 const a=assessLiveCoverage({...inputs,deliveries:[{day:'2026-11-04',
  observed_deliveries:4,last_at:'2026-11-04T13:10:00Z'}],
  recentWalletRows:[{wallet:wanted[0],n:4,last_at:'2026-11-04T13:10:00Z'}]});
 assert.equal(a.walletsExpected,12);
 assert.equal(a.walletsWithObservedEvents24h,1);
 assert.equal(a.wallets.filter(x=>x.observedWebhookRows24h===0).length,11);
 assert.equal(a.providerDelivery.ageMinutes,10);
 assert.equal(a.status,'ROSTER_MATCHED_DELIVERY_SEEN_NOT_EXHAUSTIVE');
 assert.equal(a.rpcPilot.pollers.every(x=>x.liveContinuityCertified===false),true);
});
test('stale delivery is unknown, not proof that eleven quiet wallets disappeared',()=>{
 const a=assessLiveCoverage({...inputs,deliveries:[{day:'2026-11-04',
  observed_deliveries:10,last_at:'2026-11-04T10:48:00Z'}]});
 assert.equal(a.providerDelivery.freshness,'STALE_OR_IDLE_NOT_PROOF_OF_OUTAGE');
 assert.equal(a.status,'ROSTER_MATCHED_DELIVERY_STALE_OR_UNKNOWN');
 assert.equal(a.wallets.length,12);
});
test('modified source roster and missing RPC pilot fail the scope audit',()=>{
 assert.throws(()=>expectedWebhookWallets(source.slice(1),toml),/WEBHOOK_COHORT_INVALID/);
 assert.throws(()=>expectedWebhookWallets(source,toml.replace(wanted[0],'B'.repeat(44))),/WORKER_WEBHOOK_ROSTER_MISMATCH/);
 const a=assessLiveCoverage({...inputs,cursors:inputs.cursors.slice(1)});
 assert.equal(a.status,'SCOPE_OR_CONTROL_UNVERIFIED');
});
test('single malformed or duplicated source rows fail independently rather than silent omission',()=>{
 assert.throws(()=>assessLiveCoverage({...inputs,recentWalletRows:[
  {wallet:wanted[0],n:1},{wallet:wanted[0],n:1}]}),/SOURCE_AUDIT_WALLET_ROW_INVALID/);
 const a=assessLiveCoverage({...inputs,control:[{state:'SUSPENDED'}]});
 assert.equal(a.status,'SCOPE_OR_CONTROL_UNVERIFIED');
});
test('read-only workflow and script cannot revise history or Helius credit guards',async()=>{
 const s=await readFile('scripts/goget-live-coverage-audit.mjs','utf8');
 assert.doesNotMatch(s,/(UPDATE |INSERT INTO |DELETE FROM )smart_wallet_/i);
 assert.match(s,/maxD1Queries/);
 assert.equal(LIVE_COVERAGE_BOUNDS.webhookWallets,12);
});
