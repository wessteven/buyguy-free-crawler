// GOGET six-agent harness, v0.1: zero model tokens, read-only evidence evaluation.
// Six independent specialist roles coordinate through a bounded, replayable state graph.
// Untrusted Helius evidence can NEVER be promoted to a verified trade by this harness.
// No network calls, wallet keys, arbitrary tool execution or code mutation.
const ADDR=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const SIG=/^[1-9A-HJ-NP-Za-km-z]{64,88}$/;
export const TEAM_LIMITS=Object.freeze({
  agents:6,maxEvents:100,maxTasksPerEvent:4,maxEvidenceBytes:18000,
  maxTraceEntriesPerEvent:6,modelCalls:0,externalToolCalls:0,
  maxSourceAgeMs:7*86400000
});
export const TEAM=Object.freeze([
  {id:'SCOUT',mission:'Establish exact event identity, provenance, freshness and duplicate key',tools:['READ_EVENT']},
  {id:'FORENSICS',mission:'Investigate signer, owner, swap route and token deltas',tools:['READ_ENRICHED_SOURCE']},
  {id:'WALLET_EDGE',mission:'Separate activity from audited realized wallet trading performance',tools:['READ_HISTORY']},
  {id:'TOKEN_GUARD',mission:'Verify token controls, pool custody, sellability and quote evidence',tools:['READ_RISK_EVIDENCE']},
  {id:'PAPER_STRATEGIST',mission:'Evaluate only forward, independently verified paper entry conditions',tools:['READ_RULES']},
  {id:'AUDITOR',mission:'Review all handoffs and record outstanding research tasks',tools:['WRITE_RESEARCH_JOURNAL']}
]);
const isTime=s=>typeof s==='string'&&Number.isFinite(Date.parse(s));
const safeString=(s,cap=120)=>typeof s==='string'?s.slice(0,cap):null;
function safeParseEvidence(value){
  if(typeof value!=='string'||value.length>TEAM_LIMITS.maxEvidenceBytes)return {ok:false,reason:'SOURCE_MISSING_OR_OVERSIZE',data:null};
  try {
    const obj=JSON.parse(value);
    if(!obj||typeof obj!=='object'||Array.isArray(obj))return {ok:false,reason:'SOURCE_NOT_OBJECT',data:null};
    return {ok:true,reason:null,data:obj};
  }catch{return {ok:false,reason:'SOURCE_BAD_JSON',data:null};}
}
const stage=(id,status,reason,details={})=>({agent:id,status,reason,...details});
function scout(ctx){
  const {row,now}=ctx;
  const valid=ADDR.test(row?.wallet||'')&&SIG.test(row?.signature||'')&&
    Number.isSafeInteger(row?.slot)&&row.slot>0&&isTime(row?.observed_at);
  if(!valid)return stage('SCOUT','BLOCKED','INVALID_EVENT_IDENTITY');
  const delta=now-Date.parse(row.observed_at);
  if(delta<0)return stage('SCOUT','BLOCKED','FUTURE_OBSERVATION');
  return stage('SCOUT',delta>TEAM_LIMITS.maxSourceAgeMs?'STALE':'OBSERVED',
    delta>TEAM_LIMITS.maxSourceAgeMs?'HISTORICAL_SOURCE':'EXACT_KEY_OBSERVED',{
      ageMs:delta,identity:row.wallet+':'+row.signature,sourceClass:safeString(row.classification,72)});
}
function forensics(ctx){
  const source=ctx.source;
  if(!source.ok)return stage('FORENSICS','UNKNOWN',source.reason);
  const data=source.data;
  const v2=data.schemaVersion===2;
  const transfers=Array.isArray(data.tokenTransfers)?data.tokenTransfers.slice(0,24):[];
  const native=Array.isArray(data.nativeTransfers)?data.nativeTransfers.slice(0,16):[];
  const hasAmounts=v2&&transfers.some(t=>typeof t?.tokenAmount==='string'&&t.tokenAmount!=='');
  const hints=transfers.filter(t=>ADDR.test(t?.mint||'')).length;
  return stage('FORENSICS','UNVERIFIED','HELIUS_SOURCE_IS_NOT_INDEPENDENT_SWAP_PROOF',{
    sourceSchema:v2?2:1,transferHints:hints,nativeTransferHints:native.length,
    quantitativeHints:hasAmounts,signerAttested:false,exactPoolAttested:false,
    swapSideAttested:false,traderOwnershipAttested:false});
}
function walletEdge(ctx){
  const observedCount=Number.isSafeInteger(ctx.research?.sampledWalletEvents)&&ctx.research.sampledWalletEvents>=0
    ?ctx.research.sampledWalletEvents:null;
  return stage('WALLET_EDGE','UNKNOWN','NO_TIME_CONSISTENT_AUDITED_REALIZED_PNL',{
    historicalSampleCount:observedCount,closedTradesVerified:null,profitFactor:null,
    realizedPnlUsd:null,smartMoneyCertified:false});
}
function tokenGuard(ctx){
  const source=ctx.source?.data||{};
  const mints=(Array.isArray(source.tokenTransfers)?source.tokenTransfers:[])
    .map(x=>x?.mint).filter(x=>ADDR.test(x||''));
  return stage('TOKEN_GUARD','UNKNOWN','INDEPENDENT_POOL_MINT_LP_SELLABILITY_NOT_PROVEN',{
    candidateMints:[...new Set(mints)].slice(0,5),liquidityUsd:null,
    mintAuthorityRevoked:null,freezeAuthorityRevoked:null,
    lpCustodyVerified:false,executableSellQuoteVerified:false});
}
function paperStrategist(ctx){
  // This harness deliberately has NO adapter that can independently attest
  // a VERIFIED_SWAP and executable quote. It cannot produce hypothetical fills
  // simply because Helius labelled a transaction SWAP.
  const reasons=[];
  if(ctx.results.SCOUT?.status==='BLOCKED')reasons.push('SOURCE_INVALID');
  if(ctx.results.FORENSICS?.signerAttested!==true)reasons.push('SIGNER_NOT_INDEPENDENTLY_VERIFIED');
  if(ctx.results.FORENSICS?.exactPoolAttested!==true)reasons.push('SWAP_ROUTE_UNVERIFIED');
  if(ctx.results.WALLET_EDGE?.smartMoneyCertified!==true)reasons.push('WALLET_EDGE_UNPROVEN');
  if(ctx.results.TOKEN_GUARD?.executableSellQuoteVerified!==true)reasons.push('SELLABILITY_AND_EXECUTABLE_QUOTE_UNKNOWN');
  return stage('PAPER_STRATEGIST','BLOCKED','NO_VERIFIED_PAPER_ENTRY',{
    reasons,paperBuy:false,paperSell:false,paperPnlUsd:null});
}
function auditor(ctx){
  const results=ctx.results;
  const tasks=[];
  if(results.FORENSICS?.signerAttested!==true)tasks.push('RPC_VERIFY_SIGNER_AND_BALANCE_CHANGES');
  if(results.FORENSICS?.exactPoolAttested!==true)tasks.push('RESOLVE_EXACT_MINT_POOL_AND_SWAP_SIDE');
  if(results.WALLET_EDGE?.smartMoneyCertified!==true)tasks.push('AUDIT_WALLET_CLOSED_TRADES_AS_OF_SIGNAL');
  if(results.TOKEN_GUARD?.executableSellQuoteVerified!==true)tasks.push('VERIFY_SELL_ROUTE_LP_CONTROLS_AND_QUOTES');
  return stage('AUDITOR','RESEARCH_ONLY','INSUFFICIENT_EXECUTION_EVIDENCE',{
    nextTasks:tasks.slice(0,TEAM_LIMITS.maxTasksPerEvent),
    traceComplete:TEAM.every(a=>a.id==='AUDITOR'||Object.hasOwn(results,a.id)),
    externalActionsApproved:[],paperOnly:true});
}
const HANDLERS=Object.freeze({SCOUT:scout,FORENSICS:forensics,
  WALLET_EDGE:walletEdge,TOKEN_GUARD:tokenGuard,
  PAPER_STRATEGIST:paperStrategist,AUDITOR:auditor});
export function processSixAgentEvent(row,{now=Date.now(),research={}}={}){
  if(!Number.isFinite(now))throw Error('INVALID_RUN_TIME');
  const source=safeParseEvidence(row?.evidence_json);
  const results={},trace=[];
  for(const agent of TEAM){
    const result=HANDLERS[agent.id]({row,source,now,research,results:Object.freeze({...results})});
    // Handoff contract: exactly one result from each declared role.
    if(result.agent!==agent.id||typeof result.status!=='string')throw Error('AGENT_CONTRACT_VIOLATION');
    results[agent.id]=result;
    trace.push({agent:agent.id,status:result.status,reason:result.reason});
  }
  return {schemaVersion:1,mode:'SIX_SPECIALISTS_ZERO_LLM_PAPER_ONLY',
    wallet:ADDR.test(row?.wallet||'')?row.wallet:null,
    signature:SIG.test(row?.signature||'')?row.signature:null,
    sourceObservedAt:isTime(row?.observed_at)?row.observed_at:null,
    processedAt:new Date(now).toISOString(),decision:results.AUDITOR.status,
    status:results.SCOUT.status==='BLOCKED'?'SOURCE_REJECTED':'RESEARCH_ONLY',
    modelCalls:0,externalToolCalls:0,paperEntries:0,realTrades:0,
    trace,findings:results,nextTasks:results.AUDITOR.nextTasks};
}
export function runSixAgentTeam(rows,{now=Date.now(),research={}}={}){
  if(!Array.isArray(rows)||rows.length>TEAM_LIMITS.maxEvents)throw Error('INPUT_EVENT_LIMIT');
  const seen=new Set(),items=[],duplicateKeys=[];
  for(const row of rows){
    const key=String(row?.wallet||'')+':'+String(row?.signature||'');
    if(seen.has(key)){duplicateKeys.push(key.slice(0,100));continue;}
    seen.add(key);
    const count=research[row?.wallet]?.sampledWalletEvents;
    items.push(processSixAgentEvent(row,{now,research:{sampledWalletEvents:count}}));
  }
  const statuses={};for(const item of items)statuses[item.status]=(statuses[item.status]||0)+1;
  return {runAt:new Date(now).toISOString(),mode:'SIX_SPECIALISTS_ZERO_LLM_PAPER_ONLY',
    agents:TEAM.map(x=>({id:x.id,tools:x.tools})),inputRows:rows.length,processed:items.length,
    duplicateRows:duplicateKeys.length,decisionCounts:statuses,
    modelCalls:0,externalToolCalls:0,paidAiApiCalls:0,paperEntries:0,
    realTrades:0,verifiedCopyProfitsUsd:null,items};
}
