import test from 'node:test';
import assert from 'node:assert/strict';
import {assessSourceHeartbeat,SOURCE_WATCHDOG_BOUNDS} from '../src/goget-live-source-watchdog.mjs';
import {GAP_WALLETS} from '../src/goget-wallet-gap-wave.mjs';
import worker,{runSourceWatchdog} from '../src/goget-live-source-watchdog-worker.mjs';
import {readFile} from 'node:fs/promises';
const at='2026-11-04T13:25:00.000Z';
const sample={at,control:[{state:'ARMED'}],
 deliveries:[{last_at:'2026-11-04T13:24:00.000Z'}],
 events:[{observed_at:'2026-11-04T10:48:00.000Z'}],
 cursors:GAP_WALLETS.map(wallet=>({wallet,status:'PENDING_BACKFILL',
  last_polled_at:'2026-11-04T13:19:00.000Z'})),
 priorCron:[{at:'2026-11-04T13:20:00.000Z'}],
 walletsSeen24h:7,expectedRpcWallets:GAP_WALLETS};
test('provider receipt is distinct from normalized event and all three RPC cursors remain pending',()=>{
 const a=assessSourceHeartbeat(sample);
 assert.equal(a.webhookRosterExpected,12);
 assert.equal(a.providerDeliveryAgeMinutes,1);
 assert.equal(a.normalizedAgeMinutes,157);
 assert.equal(a.rpcFound,3);
 assert.equal(a.rpcPending,3);
 assert.equal(a.status,'SOURCES_OBSERVED_NOT_CERTIFIED_COMPLETE');
});
test('unknown and missing cron slots never imply complete Helius coverage',()=>{
 const a=assessSourceHeartbeat({...sample,priorCron:[{at:'2026-11-04T13:05:00.000Z'}]});
 assert.equal(a.status,'CLOUDFLARE_SCHEDULE_GAP');
 assert.equal(a.missedCron,true);
 const b=assessSourceHeartbeat({...sample,control:[{state:'SUSPENDED'}]});
 assert.equal(b.status,'CONTROL_OR_SCOPE_UNVERIFIED');
 const c=assessSourceHeartbeat({...sample,deliveries:[],priorCron:[]});
 assert.equal(c.providerDeliveryAgeMinutes,null);
 assert.equal(c.status,'HELIUS_DELIVERY_STALE_OR_IDLE');
});
test('read-only Cloudflare sensor is distinct from Helius polling, source histories and trading',async()=>{
 const s=await readFile('src/goget-live-source-watchdog-worker.mjs','utf8');
 const toml=await readFile('wrangler.live-watchdog.toml','utf8');
 assert.match(toml,/crons = \["\*\/5 \* \* \* \*"\]/);
 assert.equal(SOURCE_WATCHDOG_BOUNDS.heliusCalls,0);
 assert.equal(SOURCE_WATCHDOG_BOUNDS.maxD1Reads,6);
 assert.equal(SOURCE_WATCHDOG_BOUNDS.maxD1Writes,1);
 assert.doesNotMatch(s,/(HELIUS_API_KEY|rpc\.helius|api-mainnet\.helius|UPDATE smart_wallet_|DELETE FROM smart_wallet_|INSERT INTO smart_wallet_)/i);
 assert.equal(typeof worker.scheduled,'function');
});
test('watchdog does six D1 reads, exactly one separate ledger insert and zero Helius calls',async()=>{
 const sqls=[];
 const db={prepare(sql){const entry={sql,params:[]};return {
   bind(...params){entry.params=params;return this;},
   async all(){sqls.push({operation:'read',...entry});const q=sql;
    let results=[];
    if(q.includes('smart_wallet_webhook_control'))results=sample.control;
    else if(q.includes('smart_wallet_webhook_credit_estimates'))results=sample.deliveries;
    else if(q.includes('smart_wallet_webhook_events ORDER BY'))results=sample.events;
    else if(q.includes('smart_wallet_live_cursors'))results=sample.cursors;
    else if(q.includes('goget_live_source_watchdog_runs WHERE'))results=sample.priorCron;
    else if(q.includes('COUNT(DISTINCT'))results=[{n:7}];
    else throw Error('UNEXPECTED_SQL_'+q);
    return {success:true,results};},
   async run(){sqls.push({operation:'write',...entry});return {success:true,meta:{changes:1}};}
 };}};
 const result=await runSourceWatchdog({WATCHDOG_ENABLED:'true',WATCHDOG_STOP_AT:'2026-11-08T00:00:00Z',DB:db},
   {now:Date.parse(at),scheduledAt:Date.parse(at),trigger:'cron'});
 assert.equal(result.d1Reads,6);assert.equal(result.d1Writes,1);
 assert.equal(sqls.filter(x=>x.operation==='read').length,6);
 assert.equal(sqls.filter(x=>x.operation==='write').length,1);
 assert.match(sqls.at(-1).sql,/INSERT INTO goget_live_source_watchdog_runs/);
 assert.equal(result.heliusCalls,0);
});
test('expired cron performs zero D1 reads and zero provider calls',async()=>{
 const result=await runSourceWatchdog({WATCHDOG_ENABLED:'true',
  WATCHDOG_STOP_AT:'2026-11-08T00:00:00Z'},{
    now:Date.parse('2026-11-08T00:00:01Z'),trigger:'cron'});
 assert.equal(result.status,'PILOT_EXPIRED');
 assert.equal(result.heliusCalls,0);
});
