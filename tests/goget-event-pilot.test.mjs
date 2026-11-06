import test from 'node:test';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {PILOT,freezePoolRoster,subscribePayload,parseWsFrame,classifyActivity,
 classifyScheduled,rpcPageCoverage,reserveForwardGuard,pairedResult,verifyTenExactPools,verifyTenDecodedPoolIdentities} from '../src/goget-event-pilot-core.mjs';
const pubkey=n=>String(n).repeat(32),sig=n=>String(n).repeat(88),now=Date.parse('2026-11-07T01:20:00.000Z');
const roster=Array.from({length:10},(_,i)=>({
 pool:pubkey('123456789A'[i]),mint:pubkey('B'),asset_key:'solana:'+i,
 quote_at:new Date(now-1000).toISOString()
}));
test('requires exactly ten distinct, recent, Solana-shaped pool identities',()=>{
 assert.equal(freezePoolRoster(roster,now).length,PILOT.pools);
 assert.throws(()=>freezePoolRoster(roster.slice(0,9),now),/TEN_FRESH/);
 assert.throws(()=>freezePoolRoster(roster.map(x=>({...x,quote_at:new Date(now-1000000).toISOString()})),now),/TEN_FRESH/);
 assert.throws(()=>freezePoolRoster([...roster.slice(0,9),roster[0]],now),/TEN_FRESH/);
});
test('standard logsSubscribe filters exactly ONE pool and confirmed commitment',()=>{
 const s=subscribePayload(4,pubkey('A'));
 assert.deepEqual(s.params,[{mentions:[pubkey('A')]},{commitment:'confirmed'}]);
 assert.throws(()=>subscribePayload(0,pubkey('A')),/SUBSCRIPTION/);
});
test('only acknowledged exact subscriptions become valid event observations',()=>{
 const sub=new Map([[101,pubkey('A')]]);
 const ack=parseWsFrame(JSON.stringify({jsonrpc:'2.0',id:4,result:101}),sub,now);
 assert.equal(ack.kind,'ACK');
 const raw=JSON.stringify({jsonrpc:'2.0',method:'logsNotification',params:{
  subscription:101,result:{context:{slot:987},value:{signature:sig('3'),err:null,logs:['Program log: swap']}}}});
 const event=parseWsFrame(raw,sub,now);
 assert.deepEqual({pool:event.pool,failed:event.failed,signature:event.signature},
  {pool:pubkey('A'),failed:false,signature:sig('3')});
 assert.throws(()=>parseWsFrame(raw,new Map(),now),/EVENT_INVALID/);
 assert.throws(()=>parseWsFrame('{bad json',sub,now),/STREAM_JSON_INVALID/);
 assert.throws(()=>parseWsFrame('x'.repeat(PILOT.maxEventBytes+1),sub,now),/OVERSIZE/);
});
test('no connection proof means unknown, never inferred zero buying',()=>{
 assert.deepEqual(classifyActivity({recent:0,prior4:0,covered:false}),
  {status:'STREAM_COVERAGE_UNVERIFIED',triggered:null});
 assert.equal(classifyActivity({recent:5,prior4:4,covered:true}).triggered,true);
 assert.equal(classifyActivity({recent:5,prior4:20,covered:true}).triggered,false);
});
test('scheduled comparison must be fresh and decision-time only',()=>{
 assert.equal(classifyScheduled({buys:8,sells:2,quoteAt:new Date(now-1000).toISOString(),asOf:now}).triggered,true);
 assert.equal(classifyScheduled({buys:8,sells:2,quoteAt:new Date(now+1000).toISOString(),asOf:now}).triggered,null);
 assert.equal(classifyScheduled({buys:8,sells:2,quoteAt:new Date(now-11*60000).toISOString(),asOf:now}).triggered,null);
});
test('bounded RPC page cannot prove complete when 1000 signatures all in-window',()=>{
 const start=now-300000,end=now;
 const page=Array.from({length:PILOT.maxRpcPage},(_,i)=>({signature:sig(String(i%8+1)),slot:500-i,blockTime:Math.floor((now-1000)/1000)}));
 const seen=new Set([page[0].signature]);
 const outcome=rpcPageCoverage(page,start,end,seen);
 assert.equal(outcome.complete,false);
 assert.equal(outcome.recall,null);
 const short=rpcPageCoverage([{signature:sig('3'),slot:500,blockTime:Math.floor((now-1000)/1000)}],start,end,new Set([sig('3')]));
 assert.equal(short.complete,true);
 assert.equal(short.recall,1);
});
test('forward credit capacity protects existing 5-minute loops',()=>{
 const early=Date.parse('2026-11-07T00:00:00Z');
 assert.equal(reserveForwardGuard(early,100,0).allowed,true);
 assert.equal(reserveForwardGuard(early,200,0).allowed,false);
 assert.equal(reserveForwardGuard(early,100,0,200).allowed,false);
});
test('paired one-hour evaluation excludes missing prices and stream gaps',()=>{
 const rows=[
  {stream_trigger:1,scheduled_trigger:0,coverage:'CONTINUOUS_STREAM',outcome_status:'OBSERVED_EXACT_POOL',return_pct:6},
  {stream_trigger:0,scheduled_trigger:1,coverage:'CONTINUOUS_STREAM',outcome_status:'OBSERVED_EXACT_POOL',return_pct:-3},
  {stream_trigger:1,scheduled_trigger:1,coverage:'STREAM_COVERAGE_UNVERIFIED',outcome_status:'OBSERVED_EXACT_POOL',return_pct:400},
  {stream_trigger:1,scheduled_trigger:1,coverage:'CONTINUOUS_STREAM',outcome_status:'MISSING_FUTURE_PRICE_COVERAGE',return_pct:null}
 ];
 const x=pairedResult(rows);
 assert.equal(x.pairedCount,2);
 assert.deepEqual(x.stream,{alerts:1,positives:1,hitRate:1});
 assert.deepEqual(x.scheduled,{alerts:1,positives:0,hitRate:0});
 assert.equal(x.unknown,2);
});

test('independent Dex receipt admits only ten exactly matched pool+mint pairs with liquidity',()=>{
 const candidates=roster.map(x=>({...x,quote_at:new Date(now-30*60000).toISOString()}));
 const pairs=candidates.map(x=>({chainId:'solana',pairAddress:x.pool,
  baseToken:{address:x.mint},priceUsd:'0.00002',liquidity:{usd:5000}}));
 const out=verifyTenExactPools(candidates,pairs,now);
 assert.equal(out.length,10);
 assert.equal(out[0].admissionProvider,'DEX_SCREENER_PUBLIC_AGGREGATE_RECEIPT_ONLY');
 assert.throws(()=>verifyTenExactPools(candidates,pairs.slice(0,9),now),/TEN_FRESH/);
 assert.throws(()=>verifyTenExactPools(candidates,pairs.map((x,i)=>i===0?
  {...x,baseToken:{address:pubkey('F')}}:x),now),/TEN_FRESH/);
 assert.throws(()=>verifyTenExactPools(candidates,pairs.map((x,i)=>i===1?
  {...x,liquidity:{usd:999}}:x),now),/TEN_FRESH/);
 assert.throws(()=>verifyTenExactPools(candidates.map(x=>({...x,
  quote_at:new Date(now-121*60000).toISOString()})),pairs,now),/TEN_FRESH/);
});

test('confirmed on-chain ten-pool admission rejects false owners, layouts, mints and stale IDs',()=>{
 const sources=roster.map(x=>({...x,quote_at:new Date(now-30*60000).toISOString()}));
 const proofs=sources.map(x=>({pool:x.pool,mint:x.mint,owner:'pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA',
  protocol:'PUMPSWAP',slot:466140205,ownerVerified:true,layoutVerified:true,mintMatched:true}));
 const good=verifyTenDecodedPoolIdentities(sources,proofs,now);
 assert.equal(good.length,10);
 assert.equal(good[0].admissionProvider,'SOLANA_PUBLIC_CONFIRMED_POOL_ACCOUNT');
 assert.equal(good[0].priceVerified,false);
 assert.equal(good[0].liquidityVerified,false);
 const altered=(field,value)=>proofs.map((x,i)=>i===0?{...x,[field]:value}:x);
 assert.throws(()=>verifyTenDecodedPoolIdentities(sources,altered('owner',pubkey('A')),now),/TEN_ONCHAIN/);
 assert.throws(()=>verifyTenDecodedPoolIdentities(sources,altered('layoutVerified',false),now),/TEN_ONCHAIN/);
 assert.throws(()=>verifyTenDecodedPoolIdentities(sources,altered('mintMatched',false),now),/TEN_ONCHAIN/);
 assert.throws(()=>verifyTenDecodedPoolIdentities(sources.slice(0,9),proofs.slice(0,9),now),/TEN_ONCHAIN/);
 assert.throws(()=>verifyTenDecodedPoolIdentities(sources.map(x=>({...x,quote_at:new Date(now-121*60000).toISOString()})),proofs,now),/TEN_ONCHAIN/);
});

test('one Helius admission RPC is ledgered and fully reserved before it can be sent',()=>{
 const src=readFileSync(new URL('../src/goget-event-pilot-worker.mjs',import.meta.url),'utf8');
 const attempt=src.indexOf("'ADMISSION_BUDGET_PENDING'");
 const reserve=src.indexOf("'UPDATE goget_rpc_source_budget SET reserved_credits=reserved_credits+? WHERE day=?'");
 const ledger=src.indexOf("'ADMISSION_RUNNING',PILOT.reserveHeliusCredits,1,id");
 const call=src.indexOf("method:'getMultipleAccounts'");
 const ws=src.indexOf("this.connect(run)");
 assert.ok(attempt>=0&&attempt<reserve&&reserve<ledger&&ledger<call&&call<ws);
 assert.ok(src.includes("PILOT_SHARED_BUDGET_PROTECTED"));
 assert.ok(src.includes("smart_wallet_webhook_control"));
 assert.ok(src.includes("stats.duplicate_events||0,estimatedWs,attempted+1,stats.ws_connections||0"));
 assert.equal(src.includes('api.dexscreener.com'),false);
 assert.equal(src.includes("method:'sendTransaction'"),false);
});
