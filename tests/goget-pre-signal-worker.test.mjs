import test from 'node:test';
import assert from 'node:assert/strict';
import worker,{processPreSignalCycle,SIGNAL_WORKER_LIMITS} from '../src/goget-pre-signal-worker.mjs';

const now=Date.parse('2026-11-01T01:35:00Z'),iso=x=>new Date(x).toISOString();
const mint='3bpm71ztUtB66EsMdYHShV5DLm4wssEfK4YrnKysmoon';
const walletA='8LJWz8uW51u6kL2XBZ6cKYBngnXCpxQjUZRbwKLfVYp4';
const walletB='whamNNP9tHoxLg92yHvJPdYhghEoCg1qYTsh5a2oLbx';
const pool='Gf3HJhA4iJubBpKBLqTXikUT9E3sv6wGhhZ3EahAqQxk';
const source=(i,minutes,wallet)=>({
 wallet,signature:String(i).repeat(88),observed_at:iso(now-minutes*60000),
 fee_payer_observed:i===1?1:0,
 evidence_json:JSON.stringify({schemaVersion:2,type:'SWAP',feePayer:wallet,
 tokenTransfers:[{mint,to:wallet,tokenAmount:'250'}],
 swapHints:{tokenOutputs:[{mint,amount:'250'}]}})
});
function db(){
 const state={lease:'',until:0,source:[
   source(1,12,walletA),source(2,7,walletB),source(3,2,walletA),
   source(4,39,walletB)
 ],snapshots:new Map(),outcomes:new Map(),runs:[]};
 const database={state,prepare(sql){return {bind(...params){return {
  async all(){
    if(sql.startsWith('SELECT wallet,signature'))return {success:true,results:state.source};
    if(sql.startsWith('SELECT a.address AS mint'))return {success:true,
      results:[{mint,pool,minute:iso(now-60000),price_sol:0.00002}]};
    if(sql.startsWith('SELECT mint,bucket,horizon_min'))
      return {success:true,results:[...state.outcomes.values()]
        .filter(x=>x.status==='PENDING'&&x.due_at<=params[1]).slice(0,params[2])};
    if(sql.startsWith('SELECT minute,price_sol FROM chain_radar_samples')){
      const due=Date.parse(params[2]);
      const price=due<=now+5*60000?0.00004:0.00001;
      return {success:true,results:[{minute:iso(due),price_sol:price}]};
    }
    throw Error('BAD_SELECT');
  },
  async run(){
   if(sql.startsWith('UPDATE goget_pre_signal_lease SET owner=?')){
    if(state.until>=params[2])return {success:true,meta:{changes:0}};
    state.lease=params[0];state.until=params[1];
    return {success:true,meta:{changes:1}};
   }
   if(sql.startsWith("UPDATE goget_pre_signal_lease SET owner=''")){
    if(state.lease===params[0]){state.lease='';state.until=0;return {success:true,meta:{changes:1}};}
    return {success:true,meta:{changes:0}};
   }
   if(sql.startsWith('INSERT OR IGNORE INTO goget_pre_signal_snapshots')){
    let changed=0;for(let i=0;i<params.length;i+=17){
      const k=params[i]+':'+params[i+1];
      if(!state.snapshots.has(k)){state.snapshots.set(k,params.slice(i,i+17));changed++;}
    }
    return {success:true,meta:{changes:changed}};
   }
   if(sql.startsWith('INSERT OR IGNORE INTO goget_pre_signal_outcomes')){
    let changed=0;for(let i=0;i<params.length;i+=7){
      const row={mint:params[i],bucket:params[i+1],horizon_min:params[i+2],
        due_at:params[i+3],pool:params[i+4],reference_price_sol:params[i+5],status:params[i+6]};
      const k=row.mint+':'+row.bucket+':'+row.horizon_min;
      if(!state.outcomes.has(k)){state.outcomes.set(k,row);changed++;}
    }
    return {success:true,meta:{changes:changed}};
   }
   if(sql.startsWith('UPDATE goget_pre_signal_outcomes SET status=?')){
    const k=params[5]+':'+params[6]+':'+params[7],row=state.outcomes.get(k);
    if(row?.status!=='PENDING')return {success:true,meta:{changes:0}};
    Object.assign(row,{status:params[0],checked_at:params[1],
      future_quote_minute:params[2],future_price_sol:params[3],change_pct:params[4]});
    return {success:true,meta:{changes:1}};
   }
   if(sql.startsWith('INSERT INTO goget_pre_signal_runs')){
    state.runs.push(params);return {success:true,meta:{changes:1}};
   }
   throw Error('BAD_WRITE');
  }
 };}}};};
 return database;
}
test('pre-signal cron is bounded, no AI/RPC/trades',()=>{
 assert.equal(SIGNAL_WORKER_LIMITS.cronMinutes,5);
 assert.equal(SIGNAL_WORKER_LIMITS.modelCalls,0);
 assert.equal(SIGNAL_WORKER_LIMITS.heliusCalls,0);
 assert.equal(SIGNAL_WORKER_LIMITS.tradeCalls,0);
 assert.equal(SIGNAL_WORKER_LIMITS.maxOutcomeChecks,20);
});
test('first prospective run saves a signal and future jobs, no future price leakage',async()=>{
 const d=db(),r=await processPreSignalCycle({DB:d,PRE_SIGNAL_ENABLED:'true'},{now,runId:'first'});
 assert.equal(r.status,'OK');
 assert.equal(r.potentialSignalCount,1);
 assert.equal(r.storedSnapshots,1);
 assert.equal(r.freshExactPoolQuotes,1);
 assert.equal(r.prospectiveOutcomeJobsCreated,4);
 assert.equal(r.observedOutcomes,0);
 assert.equal(r.heliusCalls,0);assert.equal(r.trades,0);
 const snap=[...d.state.snapshots.values()][0];
 assert.equal(snap[10],'MULTIWALLET_ACTIVITY_ACCELERATION');
 assert.equal(snap[14],0.00002);
 assert.equal(d.state.outcomes.size,4);
});
test('future label can be recorded only after due date, with exact matched pool',async()=>{
 const d=db(),env={DB:d,PRE_SIGNAL_ENABLED:'true'};
 await processPreSignalCycle(env,{now,runId:'first'});
 const earlier=[...d.state.outcomes.values()].filter(x=>x.status!=='PENDING');
 assert.equal(earlier.length,0);
 const follow=await processPreSignalCycle(env,{now:now+6*60000,runId:'second'});
 assert.ok(follow.observedOutcomes>=1);
 const five=[...d.state.outcomes.values()].find(x=>x.bucket===iso(now)&&x.horizon_min===5);
 assert.equal(five.status,'OBSERVED_MATCHED_POOL_PRICE');
 assert.equal(five.change_pct,100);
 assert.equal(five.reference_price_sol,0.00002);
});
test('lease and disabled mode refuse duplicate action',async()=>{
 const d=db(),env={DB:d,PRE_SIGNAL_ENABLED:'true'};
 d.state.until=now+3000;d.state.lease='someone-else';
 const r=await processPreSignalCycle(env,{now,runId:'new'});
 assert.equal(r.status,'LEASE_BUSY');assert.equal(d.state.snapshots.size,0);
 const off=await processPreSignalCycle({...env,PRE_SIGNAL_ENABLED:'false'},{now});
 assert.equal(off.status,'DISABLED');
});
test('remote control requires bearer and does not expose research',async()=>{
 const d=db(),env={DB:d,PRE_SIGNAL_ENABLED:'true',PRE_SIGNAL_CONTROL_TOKEN:'t'.repeat(64)};
 const health=await worker.fetch(new Request('https://test/health'),env);
 assert.equal((await health.json()).mode,'RESEARCH_ONLY');
 const blocked=await worker.fetch(new Request('https://test/run',{method:'POST'}),env);
 assert.equal(blocked.status,401);assert.equal(d.state.runs.length,0);
 const ok=await worker.fetch(new Request('https://test/run',{method:'POST',
  headers:{authorization:'Bearer '+env.PRE_SIGNAL_CONTROL_TOKEN}}),env);
 assert.equal(ok.status,200);assert.equal((await ok.json()).trades,0);
});
test('source truncation refuses to publish confident signals',async()=>{
 const d=db(),env={DB:d,PRE_SIGNAL_ENABLED:'true'};
 d.state.source=Array.from({length:1200},(_,i)=>source((i%8)+1,3,walletA));
 const r=await processPreSignalCycle(env,{now,runId:'overloaded'});
 assert.equal(r.status,'INCOMPLETE_SOURCE_WINDOW');
 assert.equal(r.storedSnapshots,0);
 assert.equal(d.state.snapshots.size,0);
});
