// Cloudflare Workers Paid: six-specialist GOGET research processing.
// Uses the EXISTING D1 database and existing deterministic harness only.
// No paid LLM API, no Helius RPC, no orders, no signing keys.
import {runSixAgentTeam,TEAM_LIMITS} from './goget-six-agent-harness.mjs';
import {REVIEW_BATCH_LIMIT,makeReviewBatch} from './goget-six-agent-batching.mjs';

export const WORKER_BOUNDS=Object.freeze({
  maxSourceRows:200,leaseMs:180000,maxD1Statements:40,maxTraceBytes:12000,
  scheduleMinutes:5,modelCalls:0,heliusCalls:0,realTrades:0
});
const eventSelect=[
  'SELECT e.wallet,e.signature,e.slot,e.observed_at,e.block_time,e.classification,e.evidence_json',
  'FROM smart_wallet_webhook_events e',
  'WHERE NOT EXISTS (SELECT 1 FROM smart_wallet_six_agent_reviews a',
  'WHERE a.wallet=e.wallet AND a.signature=e.signature)',
  'ORDER BY e.observed_at ASC LIMIT ?'
].join(' ');
const pendingCount=[
  'SELECT COUNT(*) AS n FROM smart_wallet_webhook_events e',
  'WHERE NOT EXISTS (SELECT 1 FROM smart_wallet_six_agent_reviews a',
  'WHERE a.wallet=e.wallet AND a.signature=e.signature)'
].join(' ');

async function dbAll(db,sql,...params){
  const r=await db.prepare(sql).bind(...params).all();
  if(r?.success!==true||!Array.isArray(r.results))throw Error('DB_READ_UNVERIFIED');
  return r.results;
}
async function dbRun(db,sql,...params){
  const r=await db.prepare(sql).bind(...params).run();
  if(r?.success!==true||!Number.isSafeInteger(r?.meta?.changes))throw Error('DB_WRITE_UNVERIFIED');
  return r.meta.changes;
}
const groupTotals=items=>{
  const groups={},wallets=new Set(),mints=new Set();
  let hints=0,v2=0;
  for(const item of items){
    wallets.add(item.wallet);
    const status=item.status||'UNKNOWN';groups[status]=(groups[status]||0)+1;
    if(item.findings?.FORENSICS?.quantitativeHints===true)hints++;
    if(item.findings?.FORENSICS?.sourceSchema===2)v2++;
    for(const mint of item.findings?.TOKEN_GUARD?.candidateMints||[])mints.add(mint);
  }
  return {decisions:groups,distinctWallets:wallets.size,distinctCandidateMints:mints.size,
    recordsWithQuantitativeEvidence:hints,sourceSchemaV2:v2};
};
const cleanError=error=>{
  const codes=new Set(['DB_READ_UNVERIFIED','DB_WRITE_UNVERIFIED','DB_BINDING_MISSING',
    'REVIEW_TOO_LARGE','REVIEW_BATCH_LIMIT','DB_CHANGE_COUNT_UNVERIFIED',
    'D1_BUDGET_EXCEEDED','RUN_DISABLED','INVALID_RUN_TIME']);
  return codes.has(error?.message)?error.message:'SCHEDULED_RESEARCH_FAILED';
};

export async function processAgentBatch(env,{now=Date.now(),runId=null}={}){
  if(!Number.isSafeInteger(now)||now<0)throw Error('INVALID_RUN_TIME');
  if(env?.AGENT_RESEARCH_ENABLED!=='true')return {status:'DISABLED',processed:0};
  if(!env?.DB)throw Error('DB_BINDING_MISSING');
  const id=runId||crypto.randomUUID();
  const db=env.DB,openedAt=new Date(now).toISOString();
  let statements=0;
  const execute=async(sql,...params)=>{
    if(++statements>WORKER_BOUNDS.maxD1Statements)throw Error('D1_BUDGET_EXCEEDED');
    return dbRun(db,sql,...params);
  };
  const lease=await execute(
    "UPDATE smart_wallet_agent_lease SET owner=?,until_ms=? WHERE id='runner' AND until_ms < ?",
    id,now+WORKER_BOUNDS.leaseMs,now);
  if(lease!==1)return {status:'LEASE_BUSY',processed:0};
  try{
    const rows=await dbAll(db,eventSelect,WORKER_BOUNDS.maxSourceRows);
    const reports=[],stats={};
    for(let offset=0;offset<rows.length;offset+=TEAM_LIMITS.maxEvents){
      const result=runSixAgentTeam(rows.slice(offset,offset+TEAM_LIMITS.maxEvents),{now});
      reports.push(...result.items);
      for(const [status,n] of Object.entries(result.decisionCounts))
        stats[status]=(stats[status]||0)+n;
    }
    let inserted=0;
    for(let offset=0;offset<reports.length;offset+=REVIEW_BATCH_LIMIT){
      const items=reports.slice(offset,offset+REVIEW_BATCH_LIMIT).filter(x=>x.wallet&&x.signature);
      if(!items.length)continue;
      const write=makeReviewBatch(items);
      const changed=await execute(write.sql,...write.params);
      if(changed<0||changed>items.length)throw Error('DB_CHANGE_COUNT_UNVERIFIED');
      inserted+=changed;
    }
    const pending=(await dbAll(db,pendingCount))[0]?.n;
    const totals=groupTotals(reports);
    const summary={version:1,mode:'SIX_SPECIALISTS_ZERO_LLM_PAPER_ONLY',
      status:'OK',runId:id,at:openedAt,completedAt:new Date().toISOString(),
      observed:rows.length,persisted:inserted,duplicateWrites:reports.length-inserted,
      backlog:Number.isSafeInteger(pending)?pending:null,statistics:totals,
      modelCalls:0,heliusCalls:0,realTrades:0,paperBuys:0,verifiedProfitUsd:null};
    const json=JSON.stringify(summary);
    if(json.length>WORKER_BOUNDS.maxTraceBytes)throw Error('REVIEW_TOO_LARGE');
    await execute('INSERT INTO smart_wallet_agent_runs(run_id,started_at,completed_at,source_rows,persisted_rows,backlog,summary_json) VALUES(?,?,?,?,?,?,?)',
      id,openedAt,summary.completedAt,rows.length,inserted,summary.backlog,json);
    console.log('GOGET_CLOUDFLARE_AGENTS',json);
    return summary;
  }finally{
    try{await dbRun(db,"UPDATE smart_wallet_agent_lease SET owner='',until_ms=0 WHERE id='runner' AND owner=?",id);}
    catch{console.error('GOGET_AGENT_LEASE_RELEASE_UNVERIFIED');}
  }
}
const reply=(obj,status=200)=>new Response(JSON.stringify(obj),{status,
  headers:{'content-type':'application/json','cache-control':'no-store'}});
async function auth(headers,secret){
  if(typeof secret!=='string'||secret.length<40)return false;
  const value=headers.get('authorization')||'';
  const supplied=value.startsWith('Bearer ')?value.slice(7):'';
  const a=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(supplied)));
  const b=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(secret)));
  let diff=0;for(let i=0;i<a.length;i++)diff|=a[i]^b[i];
  return diff===0;
}
export default {
  async fetch(request,env){
    const path=new URL(request.url).pathname;
    if(path==='/health'&&request.method==='GET')
      return reply({service:'goget-six-agent-cloudflare',mode:'PAPER_ONLY_NO_LLM',
        scheduled:'EVERY_5_MIN_UTC',enabled:env?.AGENT_RESEARCH_ENABLED==='true'});
    if(path!=='/run'||request.method!=='POST')return reply({error:'NOT_FOUND'},404);
    if(typeof env?.AGENT_CONTROL_TOKEN!=='string'||env.AGENT_CONTROL_TOKEN.length<40)
      return reply({error:'CONTROL_NOT_CONFIGURED'},503);
    if(!await auth(request.headers,env.AGENT_CONTROL_TOKEN))return reply({error:'UNAUTHORIZED'},401);
    try{return reply(await processAgentBatch(env));}
    catch(e){const err=cleanError(e);console.error('GOGET_AGENT_MANUAL_FAILURE',err);return reply({error:err},503);}
  },
  async scheduled(controller,env){
    try{await processAgentBatch(env,{now:Number.isFinite(controller?.scheduledTime)?
      controller.scheduledTime:Date.now()});}
    catch(e){console.error('GOGET_AGENT_SCHEDULE_FAILURE',cleanError(e));throw e;}
  }
};
