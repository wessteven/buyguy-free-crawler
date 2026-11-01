#!/usr/bin/env node
// GOGET six specialists replay Helius data at zero AI API cost.
// D1 writes are a separate research ledger; no trading endpoints or private keys.
import {writeFile} from 'node:fs/promises';
import {runSixAgentTeam,TEAM_LIMITS} from '../src/goget-six-agent-harness.mjs';
import {REVIEW_BATCH_LIMIT,makeReviewBatch} from '../src/goget-six-agent-batching.mjs';
const MAX_ROWS=400;
const field=name=>{const v=process.env[name];if(!v)throw Error('MISSING_'+name);return v;};
async function main(){
  const account=field('CF_ACCOUNT_ID'),database=field('CF_DATABASE_ID'),token=field('CF_D1_API_TOKEN');
  const url='https://api.cloudflare.com/client/v4/accounts/'+encodeURIComponent(account)+
    '/d1/database/'+encodeURIComponent(database)+'/query';
  let queries=0;
  async function query(sql,params=[]){
    if(++queries>125)throw Error('QUERY_BUDGET_EXHAUSTED');
    const res=await fetch(url,{method:'POST',headers:{authorization:'Bearer '+token,
      'content-type':'application/json'},body:JSON.stringify({sql,params}),
      signal:AbortSignal.timeout(18000)});
    if(!res.ok)throw Error('D1_HTTP_'+res.status);
    const payload=await res.json();
    if(payload?.success!==true||payload?.result?.[0]?.success!==true)throw Error('D1_QUERY_FAILED');
    return payload.result[0];
  }
  await query([
    'CREATE TABLE IF NOT EXISTS smart_wallet_six_agent_reviews(',
    'wallet TEXT NOT NULL,signature TEXT NOT NULL,source_observed_at TEXT NOT NULL,',
    'reviewed_at TEXT NOT NULL,verdict TEXT NOT NULL,trace_json TEXT NOT NULL,',
    'PRIMARY KEY(wallet,signature))'
  ].join(' '));
  const rows=(await query([
    'SELECT e.wallet,e.signature,e.slot,e.observed_at,e.block_time,e.classification,e.evidence_json',
    'FROM smart_wallet_webhook_events e WHERE NOT EXISTS(',
    'SELECT 1 FROM smart_wallet_six_agent_reviews a',
    'WHERE a.wallet=e.wallet AND a.signature=e.signature)',
    'ORDER BY e.observed_at ASC LIMIT ?'
  ].join(' '),[MAX_ROWS])).results||[];
  const now=Date.now(),items=[],counts={};
  for(let offset=0;offset<rows.length;offset+=TEAM_LIMITS.maxEvents){
    const block=runSixAgentTeam(rows.slice(offset,offset+TEAM_LIMITS.maxEvents),{now});
    items.push(...block.items);
    for(const [key,n] of Object.entries(block.decisionCounts))
      counts[key]=(counts[key]||0)+n;
  }
  let persisted=0,duplicates=0;
  for(let offset=0;offset<items.length;offset+=REVIEW_BATCH_LIMIT){
    const group=items.slice(offset,offset+REVIEW_BATCH_LIMIT)
      .filter(x=>x.wallet&&x.signature);
    if(!group.length)continue;
    const batch=makeReviewBatch(group);
    const inserted=(await query(batch.sql,batch.params)).meta?.changes;
    if(!Number.isSafeInteger(inserted)||inserted<0||inserted>group.length)
      throw Error('D1_WRITE_COUNT_INVALID');
    persisted+=inserted;duplicates+=group.length-inserted;
  }
  const report={items,decisionCounts:counts,mode:'SIX_SPECIALISTS_ZERO_LLM_PAPER_ONLY'};
  const pending=await query([
    'SELECT COUNT(*) AS n FROM smart_wallet_webhook_events e WHERE NOT EXISTS(',
    'SELECT 1 FROM smart_wallet_six_agent_reviews a',
    'WHERE a.wallet=e.wallet AND a.signature=e.signature)'
  ].join(' '));
  const summary={at:new Date(now).toISOString(),mode:'SIX_SPECIALISTS_ZERO_LLM_PAPER_ONLY',
    inputRows:rows.length,persisted,duplicateReviewWrites:duplicates,
    remainingUnreviewed:pending.results?.[0]?.n??null,
    decisionCounts:report.decisionCounts,modelCalls:0,paidAiApiCalls:0,
    realOrders:0,paperOrders:0,verifiedProfitsUsd:null,queries,
    limitations:['No independent onchain signer attestation',
      'No time-consistent wallet realized-PnL history',
      'No certified executable bid/ask or pool-control evidence',
      'Research reviews are not buy signals']};
  await writeFile('goget-six-agent-reviews.json',JSON.stringify({summary,report},null,2)+'\n','utf8');
  console.log('GOGET_SIX_AGENT_HARNESS',JSON.stringify(summary));
  if(rows.length>TEAM_LIMITS.maxEvents)process.exitCode=1;
}
main().catch(e=>{
  console.error('GOGET_SIX_AGENT_HARNESS_FAILED',
    /^(MISSING_[A-Z_]+|D1_HTTP_\d+|D1_QUERY_FAILED|QUERY_BUDGET_EXHAUSTED|REVIEW_TOO_LARGE)$/.test(e.message)
      ?e.message:'SAFE_REPLAY_FAILED');
  process.exitCode=1;
});
