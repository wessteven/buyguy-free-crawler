import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 MICRO_RULE,normalizeRecordedSwaps,parseCompleteness,analyzeMicroAcceleration
} from '../src/micro-acceleration-research.mjs';
const T=Date.parse('2026-10-20T15:10:00Z')/1000;
const address='7XBdVqzZFYwpBz7VshzWZWd7ms1sG9f9UQ8YiHqapump';
const feePayers=['A','B','C','D','E','F','G','H'].map(c=>c.repeat(32));
let seq=0;
const event=(t,side,payer,quote=0.1)=>{
 seq++;
 return {t,side,payer,sol:quote,sig:'ABCDEFGHJKLMNPQRSTUVWXYZ'[seq].padStart(88,'7')};
};
function synthetic(){
 seq=0;
 const events=[];
 for(let i=0;i<3;i++)events.push(event(T+5+i*6,'buy',feePayers[i]));
 events.push(event(T+23,'sell',feePayers[6]));
 for(let i=0;i<6;i++)events.push(event(T+33+i*3,'buy',feePayers[i]));
 for(let i=0;i<2;i++)events.push(event(T+55+i*2,'sell',feePayers[7]));
 const windows=[{start:new Date(T*1000).toISOString(),
  end:new Date((T+300)*1000).toISOString(),complete:true}];
 return {events,windows};
}
test('two completed 30s windows establish a bounded early hypothesis, never a buy signal',()=>{
 const {events,windows}=synthetic();
 const r=analyzeMicroAcceleration(events,windows);
 assert.equal(r.episodeCount,1);
 const hit=r.episodes[0];
 assert.equal(hit.firstWindowBuys,3);
 assert.equal(hit.secondWindowBuys,6);
 assert.equal(hit.buyAccelerationRatio,2);
 assert.equal(hit.feePayerCount,6);
 assert.equal(hit.earliestCausalCalculationAt,'2026-10-20T15:11:00.000Z');
 assert.equal(hit.actualCollectorReceiptAt,null);
 assert.equal(hit.independentBuyers,null);
 assert.equal(hit.buyQualified,false);
 assert.equal(hit.verifiedMarketSafety,false);
 assert.equal(hit.knownLiquidityUsd,null);
});
test('future transactions are excluded before both windows complete (no lookahead)',()=>{
 const {events,windows}=synthetic();
 const pre=analyzeMicroAcceleration(events,windows,{asOf:'2026-10-20T15:10:59Z'});
 assert.equal(pre.episodeCount,0);
 const ready=analyzeMicroAcceleration(events,windows,{asOf:'2026-10-20T15:11:00Z'});
 assert.equal(ready.episodeCount,1);
 const trailing=[event(T+150,'buy',feePayers[0])];
 const future=analyzeMicroAcceleration([...events,...trailing],windows,{
  asOf:'2026-10-20T15:11:00Z'});
 assert.deepEqual(future.episodes,ready.episodes);
});
test('fee payer concentration is an explicit risk rather than verified buyer count',()=>{
 const {events,windows}=synthetic();
 let counter=0;
 const concentrated=events.map(e=>{
  if(e.side!=='buy')return e;
  counter++;
  return {...e,payer:counter<=5?feePayers[0]:feePayers[counter-4]};
 });
 const r=analyzeMicroAcceleration(concentrated,windows);
 assert.equal(r.episodeCount,1);
 assert.ok(r.episodes[0].warnings.includes('FEE_PAYER_CONCENTRATION'));
 assert.equal(r.episodes[0].independentBuyers,null);
});
test('duplicate signatures never count as repeated unique buys',()=>{
 const {events,windows}=synthetic();
 const report=normalizeRecordedSwaps([...events,events[0],{...events[0],payer:feePayers[7]}]);
 assert.equal(report.duplicates,2);
 assert.equal(report.conflicts,1);
 assert.equal(report.dedupedCount,events.length);
 const r=analyzeMicroAcceleration([...events,events[0]],windows);
 assert.equal(r.episodes[0].firstWindowBuys,3);
 assert.equal(r.duplicates,1);
});
test('unknown or unverified sample completeness cannot become a 30s alert',()=>{
 const {events,windows}=synthetic();
 assert.equal(analyzeMicroAcceleration(events,[{...windows[0],complete:false}]).episodeCount,0);
 const gap=[
  {start:new Date(T*1000).toISOString(),end:new Date((T+30)*1000).toISOString(),complete:true},
  {start:new Date((T+60)*1000).toISOString(),end:new Date((T+90)*1000).toISOString(),complete:true}
 ];
 assert.equal(analyzeMicroAcceleration(events,gap).episodeCount,0);
});
test('the recorded receipt is retained separately from earliest retrospective calculation',()=>{
 const {events,windows}=synthetic();
 const retrieved='2026-10-20T15:16:00.541Z';
 const a=analyzeMicroAcceleration(events,windows,{receivedAt:retrieved});
 assert.equal(a.episodes[0].actualCollectorReceiptAt,retrieved);
 assert.ok(a.episodes[0].archiveAgeAtReceiptSeconds>300);
 assert.equal(a.episodes[0].earliestCausalCalculationAt,'2026-10-20T15:11:00.000Z');
});
test('only strict, bounded observations and 30s windows can be analyzed',()=>{
 const {events,windows}=synthetic();
 assert.throws(()=>normalizeRecordedSwaps(Array(5001).fill(events[0])),/BOUNDED/);
 assert.throws(()=>analyzeMicroAcceleration(events,windows,{rule:{...MICRO_RULE,windowSeconds:60}}),/30_SECOND/);
 assert.throws(()=>analyzeMicroAcceleration(events,windows,{asOf:'no-date'}),/INVALID_CAUSAL/);
});
test('real Night Lab evidence is replayable without provider calls or beneficiary claims',()=>{
 const files=[
  ['data/night-lab/2026-10-20/2026-10-20T1518Z-cycle11-wisp-paginated-raw-swaps.json','observations'],
  ['data/night-lab/2026-10-20/2026-10-20T1611Z-cycle12-pika-sampled-trades.json','events']
 ];
 for(const [file,key] of files){
  const data=JSON.parse(readFileSync(new URL('../'+file,import.meta.url),'utf8'));
  const r=analyzeMicroAcceleration(data[key],data.windows,{
   receivedAt:data.retrieved_utc??data.retrieved_at_utc});
  assert.ok(r.evaluated30sWindows>=10);
  assert.equal(r.receivedAt,data.retrieved_utc??data.retrieved_at_utc);
  assert.equal(r.episodes.every(x=>x.buyQualified===false),true);
  assert.equal(r.episodes.every(x=>x.independentBuyers===null),true);
 }
});
