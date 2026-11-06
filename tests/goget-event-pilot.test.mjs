import test from 'node:test';
import assert from 'node:assert/strict';
import {PILOT,freezePoolRoster,subscribePayload,parseWsFrame,classifyActivity,
 classifyScheduled,rpcPageCoverage,reserveForwardGuard,pairedResult} from '../src/goget-event-pilot-core.mjs';
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
test('bounded RPC page cannot prove complete when 100 signatures all in-window',()=>{
 const start=now-300000,end=now;
 const page=Array.from({length:100},(_,i)=>({signature:sig(String(i%8+1)),slot:500-i,blockTime:Math.floor((now-1000)/1000)}));
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
