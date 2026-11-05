import test from 'node:test';
import assert from 'node:assert/strict';
import {GAP_WALLETS} from '../src/goget-wallet-gap-wave.mjs';
import {readFile} from 'node:fs/promises';
import {LIVE_RPC_BOUNDS,validateSourceWallets,validateSignaturePage,
 interpretPage,planBudget} from '../src/goget-cloudflare-live-rpc.mjs';
import worker,{collectLiveRpcSources} from '../src/goget-cloudflare-live-rpc-worker.mjs';
const at='2026-11-05T01:55:00Z';
const chars='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const sig=i=>'5'.repeat(87)+chars[i];
const tx=(i,slot=500000000)=>({signature:sig(i),slot,blockTime:Math.floor(Date.parse(at)/1000)-20,err:null});
test('exact original three-wallet read-only RPC cohort and hard credit caps',async()=>{
 const cohort=JSON.parse(await readFile('research/smart-wallet-live-cohort.json','utf8'));
 assert.deepEqual(validateSourceWallets(GAP_WALLETS),cohort.map(x=>x.wallet));
 assert.equal(LIVE_RPC_BOUNDS.walletCount,3);
 assert.equal(LIVE_RPC_BOUNDS.perWalletSignatureLimit,100);
 assert.equal(LIVE_RPC_BOUNDS.maxHeliusCallsPerRun,3);
 assert.equal(LIVE_RPC_BOUNDS.maxRunReservedCredits,30);
 assert.equal(LIVE_RPC_BOUNDS.maxUtcDayReservedCredits,9000);
 assert.equal(LIVE_RPC_BOUNDS.combinedLocalDayCredits,20000);
 assert.equal(LIVE_RPC_BOUNDS.stopAt,'2026-11-08T00:00:00Z');
});
test('last known head in bounded signature page proves only new interval; never calls it a trade',()=>{
 const page=validateSignaturePage([tx(0),tx(1,499999999),tx(2,499999998)],at);
 const result=interpretPage(page,sig(1));
 assert.equal(result.status,'CHECKPOINT_CONNECTED');
 assert.equal(result.gap,false);
 assert.deepEqual(result.newRows.map(x=>x.signature),[sig(0)]);
 assert.equal(result.head,sig(0));
});
test('source page missing previous head creates explicit gap and new independent head',()=>{
 const page=validateSignaturePage([tx(0),tx(1,499999999)],at);
 const miss=interpretPage(page,sig(7));
 assert.equal(miss.gap,true);
 assert.equal(miss.newRows.length,2);
 assert.equal(miss.status,'UNRESOLVED_SOURCE_INTERVAL');
 assert.equal(interpretPage(page,null).status,'BASELINE_HISTORY_UNVERIFIED');
 assert.equal(interpretPage([],sig(7)).gap,false);
 assert.equal(interpretPage([],sig(7)).status,'EMPTY_PROVIDER_PAGE_UNVERIFIED');
});
test('unverified transaction slot order, identity, future timestamp and duplicated pages fail closed',()=>{
 assert.throws(()=>validateSignaturePage([tx(0,5),tx(1,6)],at),/RPC_SOURCE_IDENTITY_UNVERIFIED/);
 assert.throws(()=>validateSignaturePage([tx(0),tx(0)],at),/RPC_SOURCE_IDENTITY_UNVERIFIED/);
 assert.throws(()=>validateSignaturePage([{...tx(0),blockTime:Math.floor(Date.parse(at)/1000)+600}],at),/RPC_SOURCE_IDENTITY_UNVERIFIED/);
 assert.throws(()=>validateSignaturePage(Array(101).fill(tx(0)),at),/RPC_SOURCE_PAGE_INVALID/);
 assert.throws(()=>interpretPage([], 'BAD'),/RPC_PREVIOUS_HEAD_INVALID/);
});
test('original webhook daily estimates and persistent ARMED state guard independent RPC budget',()=>{
 assert.equal(planBudget({newReserved:8400,webhookDeliveries:3400,armed:true}),true);
 assert.equal(planBudget({newReserved:8990,webhookDeliveries:0,armed:true}),false);
 assert.equal(planBudget({newReserved:4000,webhookDeliveries:15980,armed:true}),false);
 assert.equal(planBudget({newReserved:100,webhookDeliveries:100,armed:false}),false);
 assert.throws(()=>planBudget({newReserved:-1,webhookDeliveries:0,armed:true}),/RPC_BUDGET_INPUT_UNVERIFIED/);
});
test('confirmed source collector archives all three original wallets in a separate D1 namespace',async()=>{
 const calls=[],writes=[];
 const db={prepare(sql){return {bind(...args){this.args=args;return this;},
  async all(){if(!sql.includes('FROM goget_rpc_source_wallets'))throw Error('UNEXPECTED_SELECT');
   return {success:true,results:[]};},
  async run(){writes.push({sql,args:this.args});return {success:true,meta:{changes:1}};}};}};
 const fetchFn=async(url,init)=>{
   const req=JSON.parse(init.body);calls.push(req);
   assert.equal(req.method,'getSignaturesForAddress');
   assert.equal(req.params[1].limit,100);
   const n=GAP_WALLETS.indexOf(req.params[0]);assert.ok(n>=0);
   return new Response(JSON.stringify({jsonrpc:'2.0',id:1,result:[tx(n)]}),{
    status:200,headers:{'content-type':'application/json'}});
 };
 const result=await collectLiveRpcSources({DB:db,GOGET_RPC_ENABLED:'true',
   GOGET_RPC_STOP_AT:LIVE_RPC_BOUNDS.stopAt,HELIUS_API_KEY:'test-private-key-long'},{
   now:Date.parse(at),scheduledAt:Date.parse(at),trigger:'cron',fetchFn});
 assert.equal(result.status,'SOURCES_ARCHIVED_GAPS_DISCLOSED');
 assert.equal(result.walletsScanned,3);assert.equal(result.heliusCalls,3);
 assert.equal(result.creditsReserved,30);assert.equal(result.signaturesSaved,3);
 assert.equal(result.sourceGaps,0);assert.equal(result.trades,0);
 assert.deepEqual(calls.map(x=>x.params[0]),GAP_WALLETS);
 assert.equal(writes.filter(x=>x.sql.includes('goget_rpc_source_signatures')).length,3);
 assert.equal(writes.filter(x=>x.sql.includes('goget_rpc_source_wallets')).length,3);
 assert.equal(writes.filter(x=>x.sql.includes('goget_rpc_source_cycles')&&x.sql.includes('UPDATE')).length,1);
 assert.equal(writes.some(x=>/UPDATE smart_wallet_|UPDATE goget_pre_signal_/i.test(x.sql)),false);
});
test('any RPC provider failure keeps the three-wallet denominator and marks result PARTIAL',async()=>{
 const db={prepare(sql){return {bind(){return this;},
  async all(){return {success:true,results:[]};},
  async run(){return {success:true,meta:{changes:1}};}};}};
 let n=0;
 const fetchFn=async()=>{
  n++;return n===2?new Response('temporarily unavailable',{status:503}):
    new Response(JSON.stringify({result:[tx(n)]}),{status:200});
 };
 const result=await collectLiveRpcSources({DB:db,GOGET_RPC_ENABLED:'true',
  GOGET_RPC_STOP_AT:LIVE_RPC_BOUNDS.stopAt,HELIUS_API_KEY:'test-private-key-long'},{
   now:Date.parse(at),fetchFn});
 assert.equal(result.status,'PARTIAL_SOURCE_FAILURE');
 assert.equal(result.sourceReports.length,3);
 assert.equal(result.sourceReports.filter(x=>x.status==='SOURCE_FAILED').length,1);
 assert.equal(result.heliusCalls,3);
});
test('disabled or expired sensor makes exactly zero Helius and D1 calls',async()=>{
 const expired=await collectLiveRpcSources({GOGET_RPC_ENABLED:'true',
  GOGET_RPC_STOP_AT:LIVE_RPC_BOUNDS.stopAt},{now:Date.parse('2026-11-08T00:00:01Z')});
 assert.equal(expired.status,'PILOT_EXPIRED');
 const disabled=await collectLiveRpcSources({GOGET_RPC_ENABLED:'false'},{now:Date.parse(at)});
 assert.equal(disabled.status,'DISABLED');
});
test('Cloudflare Worker code is source-only and cannot send transactions or change legacy data',async()=>{
 const src=await readFile('src/goget-cloudflare-live-rpc-worker.mjs','utf8');
 assert.equal(typeof worker.scheduled,'function');
 assert.match(src,/getSignaturesForAddress/);
 assert.match(src,/goget_rpc_source_gaps/);
 assert.match(src,/smart_wallet_webhook_credit_estimates/);
 assert.match(src,/smart_wallet_webhook_control/);
 assert.doesNotMatch(src,/sendTransaction|signTransaction|privateKey|UPDATE smart_wallet_live_cursors|INSERT INTO smart_wallet_webhook_events|UPDATE goget_pre_signal_market_outcomes/i);
});

test('post-deployment verification retries authentication only and never retries a spent RPC cycle',async()=>{
 const s=await readFile('scripts/verify-goget-cloudflare-live-rpc.mjs','utf8');
 assert.match(s,/response.status!==401\|\|report\?\.error!=='UNAUTHORIZED'/);
 assert.match(s,/Do NOT retry HTTP 503/);
 assert.doesNotMatch(s,/if\(response.status===503\).*continue/);
});
