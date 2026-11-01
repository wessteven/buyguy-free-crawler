import test from 'node:test';
import assert from 'node:assert/strict';
import worker,{WORKER_BOUNDS,processAgentBatch} from '../src/goget-cloudflare-agent-worker.mjs';

const wallet='8LJWz8uW51u6kL2XBZ6cKYBngnXCpxQjUZRbwKLfVYp4';
const mint='3bpm71ztUtB66EsMdYHShV5DLm4wssEfK4YrnKysmoon';
const now=Date.parse('2026-11-01T01:00:00Z');
const row=i=>({
  wallet,signature:String((i%9)+1).repeat(87)+(i%9+1),
  slot:463000000+i,observed_at:'2026-11-01T00:59:50Z',
  block_time:'2026-11-01T00:59:48Z',
  classification:'UNVERIFIED_ENHANCED_SWAP',
  evidence_json:JSON.stringify({schemaVersion:2,type:'SWAP',
    tokenTransfers:[{mint,tokenAmount:'18.5',to:wallet}],feePayer:wallet})
});
function mockDb(count=5){
  const events=Array.from({length:count},(_,i)=>({...row(i),
    signature:'1'.repeat(83)+String(i).padStart(5,'Z').replaceAll('0','a')}));
  // Unique base58-safe 88-character mock signatures, preserving exact identities.
  const rows=events;
  const state={lease:'',until:0,rows,reviews:new Map(),runs:[],writes:[],queries:[]};
  const db={
    state,
    prepare(sql){
      return {bind(...params){
        return {
          async all(){
            state.queries.push(sql);
            if(sql.startsWith('SELECT e.wallet'))return {success:true,results:rows
              .filter(r=>!state.reviews.has(r.wallet+':'+r.signature)).slice(0,params[0])};
            if(sql.startsWith('SELECT COUNT'))return {success:true,
              results:[{n:rows.filter(r=>!state.reviews.has(r.wallet+':'+r.signature)).length}]};
            throw Error('UNEXPECTED_READ');
          },
          async run(){
            state.writes.push({sql,params});
            if(sql.startsWith('UPDATE smart_wallet_agent_lease SET owner=?')){
              if(state.until>=params[2])return {success:true,meta:{changes:0}};
              state.lease=params[0];state.until=params[1];
              return {success:true,meta:{changes:1}};
            }
            if(sql.includes('SET owner=')){
              const changed=state.lease===params[0]?1:0;
              if(changed){state.lease='';state.until=0;}
              return {success:true,meta:{changes:changed}};
            }
            if(sql.startsWith('INSERT OR IGNORE INTO smart_wallet_six_agent_reviews')){
              let changed=0;
              for(let i=0;i<params.length;i+=6){
                const k=params[i]+':'+params[i+1];
                if(!state.reviews.has(k)){state.reviews.set(k,JSON.parse(params[i+5]));changed++;}
              }
              return {success:true,meta:{changes:changed}};
            }
            if(sql.startsWith('INSERT INTO smart_wallet_agent_runs')){
              state.runs.push(params);return {success:true,meta:{changes:1}};
            }
            throw Error('UNEXPECTED_WRITE');
          }
        };
      }};
    }
  };
  return db;
}
test('200-record max and five-minute schedule, no LLM or Helius tools',()=>{
 assert.equal(WORKER_BOUNDS.maxSourceRows,200);
 assert.equal(WORKER_BOUNDS.scheduleMinutes,5);
 assert.equal(WORKER_BOUNDS.cpuCeilingMs,2000);
 assert.equal(WORKER_BOUNDS.modelCalls,0);
 assert.equal(WORKER_BOUNDS.heliusCalls,0);
});
test('runs real six-agent evidence, persists once, then empty idempotent resume',async()=>{
 const db=mockDb(5),env={DB:db,AGENT_RESEARCH_ENABLED:'true'};
 const a=await processAgentBatch(env,{now,runId:'A'});
 assert.equal(a.status,'OK');
 assert.equal(a.observed,5);
 assert.equal(a.persisted,5);
 assert.equal(a.backlog,0);
 assert.equal(db.state.reviews.size,5);
 assert.equal(db.state.runs.length,1);
 assert.equal(a.statistics.recordsWithQuantitativeEvidence,5);
 assert.equal(a.paperBuys,0);assert.equal(a.realTrades,0);
 const b=await processAgentBatch(env,{now:now+300000,runId:'B'});
 assert.equal(b.persisted,0);
 assert.equal(db.state.reviews.size,5);
 assert.equal(db.state.runs.length,2);
 assert.equal(db.state.lease,'');
});
test('bounded batch splits 201 source events into 200 then one, no extra tools',async()=>{
 const db=mockDb(201),env={DB:db,AGENT_RESEARCH_ENABLED:'true'};
 const a=await processAgentBatch(env,{now,runId:'C'});
 assert.equal(a.observed,200);
 assert.equal(a.persisted,200);
 assert.equal(a.backlog,1);
 const b=await processAgentBatch(env,{now:now+300000,runId:'D'});
 assert.equal(b.persisted,1);assert.equal(b.backlog,0);
 assert.ok(db.state.writes.every(x=>!x.sql.includes('SEND_TRANSACTION')));
});
test('lease prevents overlapping cycles and disabled mode reads nothing',async()=>{
 const db=mockDb(4),env={DB:db,AGENT_RESEARCH_ENABLED:'true'};
 db.state.lease='other';db.state.until=now+100000;
 const blocked=await processAgentBatch(env,{now,runId:'A'});
 assert.equal(blocked.status,'LEASE_BUSY');assert.equal(db.state.reviews.size,0);
 const disabled=await processAgentBatch({...env,AGENT_RESEARCH_ENABLED:'false'},{now});
 assert.equal(disabled.status,'DISABLED');assert.equal(db.state.reviews.size,0);
});
test('unauthenticated API cannot trigger research; health does not access DB',async()=>{
 const token='x'.repeat(64),env={DB:mockDb(2),AGENT_RESEARCH_ENABLED:'true',AGENT_CONTROL_TOKEN:token};
 const health=await worker.fetch(new Request('https://worker.test/health'),env);
 assert.equal(health.status,200);
 const bad=await worker.fetch(new Request('https://worker.test/run',{method:'POST'}),env);
 assert.equal(bad.status,401);
 assert.equal(env.DB.state.reviews.size,0);
 const run=await worker.fetch(new Request('https://worker.test/run',{
  method:'POST',headers:{authorization:'Bearer '+token}}),env);
 assert.equal(run.status,200);assert.equal((await run.json()).persisted,2);
});
test('malformed review source never authorizes a simulated entry',async()=>{
 const db=mockDb(1);
 db.state.rows[0].evidence_json=JSON.stringify({schemaVersion:2,
    verifiedSwap:true,buy:true,secret:'never trust third-party source'});
 const out=await processAgentBatch({DB:db,AGENT_RESEARCH_ENABLED:'true'},{now,runId:'Z'});
 assert.equal(out.paperBuys,0);
 assert.equal(out.realTrades,0);
 assert.equal(db.state.reviews.values().next().value.findings.PAPER_STRATEGIST.paperBuy,false);
});
