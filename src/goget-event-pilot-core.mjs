// Isolated GOGET event-stream research pilot; pool mentions are NOT verified trades.
// Research-only, never sends a transaction and never changes production source cursors.
export const PILOT=Object.freeze({
 pools:10,durationMs:60*60000,minuteMs:60000,
 maxWsBytes:4_000_000,maxUniqueEvents:12000,maxEventBytes:80000,
 maxRpcCalls:10,maxRpcPage:1000,maxRpcBytes:500000,
 reserveHeliusCredits:200,maxWsEstimatedCredits:80,
 perSignatureRpcCreditEstimate:10,
 sharedRpcDailyCap:9000,localHeliusDailyCap:20000,
 existingForwardCreditsPer5m:30,
 horizons:[5,60,1440],maxDuePerCycle:60,missToleranceMs:10*60000
});
const ADDR=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const SIG=/^[1-9A-HJ-NP-Za-km-z]{64,88}$/;
export const validAddr=x=>typeof x==='string'&&ADDR.test(x);
export const validSig=x=>typeof x==='string'&&SIG.test(x);
export const minuteStart=ms=>Math.floor(ms/PILOT.minuteMs)*PILOT.minuteMs;
export function freezePoolRoster(rows,asOf){
 if(!Array.isArray(rows)||!Number.isSafeInteger(asOf))throw Error('PILOT_ROSTER_INVALID');
 const found=[],seen=new Set();
 for(const r of rows){
  if(!validAddr(r.pool)||!validAddr(r.mint)||typeof r.asset_key!=='string'||!r.asset_key||seen.has(r.pool))continue;
  const quoteTime=Date.parse(r.quote_at||'');
  if(!Number.isFinite(quoteTime)||quoteTime>asOf||asOf-quoteTime>10*60000)continue;
  seen.add(r.pool);found.push({pool:r.pool,mint:r.mint,assetKey:r.asset_key});
  if(found.length===PILOT.pools)break;
 }
 if(found.length!==PILOT.pools)throw Error('PILOT_TEN_FRESH_EXACT_POOLS_REQUIRED');
 return found;
}
export function subscribePayload(id,pool){
 if(!Number.isSafeInteger(id)||id<=0||!validAddr(pool))throw Error('PILOT_SUBSCRIPTION_INVALID');
 return {jsonrpc:'2.0',id,method:'logsSubscribe',
   params:[{mentions:[pool]},{commitment:'confirmed'}]};
}
export function parseWsFrame(input,subscriptionToPool,receivedMs){
 if(typeof input!=='string'||input.length>PILOT.maxEventBytes)
  throw Error('PILOT_STREAM_MESSAGE_OVERSIZE');
 if(!Number.isSafeInteger(receivedMs)||receivedMs<0)throw Error('PILOT_RECEIPT_INVALID');
 let frame;try{frame=JSON.parse(input)}catch{throw Error('PILOT_STREAM_JSON_INVALID')}
 if(Number.isSafeInteger(frame?.id)){
  if(frame.error)return {kind:'SUBSCRIPTION_REJECTED',id:frame.id};
  if(!Number.isSafeInteger(frame.result)||frame.result<=0)
    return {kind:'SUBSCRIPTION_REJECTED',id:frame.id};
  return {kind:'ACK',id:frame.id,subscription:frame.result};
 }
 if(frame?.method!=='logsNotification')return {kind:'UNRECOGNISED'};
 const pool=subscriptionToPool.get(frame?.params?.subscription);
 const value=frame?.params?.result?.value;
 const slot=frame?.params?.result?.context?.slot;
 if(!validAddr(pool)||!validSig(value?.signature)||
   !Number.isSafeInteger(slot)||slot<=0||
   !Array.isArray(value?.logs)||value.logs.length>250)
  throw Error('PILOT_STREAM_EVENT_INVALID');
 return {kind:'EVENT',pool,signature:value.signature,slot,
   failed:value.err!==null,receivedMs,bytes:input.length};
}
// This is a raw log-activity anomaly, not a buy signal.
export function classifyActivity({recent,prior4,covered}){
 if(!covered)return {status:'STREAM_COVERAGE_UNVERIFIED',triggered:null};
 if(!Number.isSafeInteger(recent)||recent<0||!Number.isSafeInteger(prior4)||prior4<0)
  throw Error('PILOT_ACTIVITY_INPUT_INVALID');
 return {status:'RAW_POOL_MENTION_ACTIVITY',triggered:recent>=5&&recent*4>=Math.max(4,prior4*3),
   recent,prior4};
}
export function classifyScheduled({buys,sells,quoteAt,asOf}){
 const time=Date.parse(quoteAt||'');
 if(!Number.isFinite(time)||time>asOf||asOf-time>10*60000||
  !Number.isSafeInteger(buys)||buys<0||!Number.isSafeInteger(sells)||sells<0)
   return {status:'NO_FRESH_SCHEDULED_COMPARATOR',triggered:null};
 return {status:'SCHEDULED_M5_BUY_RATIO_PROXY',triggered:buys>=6&&buys>=2*(sells+1)};
}
export function rpcPageCoverage(page,startedMs,endedMs,seenSignatures){
 if(!Array.isArray(page)||page.length>PILOT.maxRpcPage||
  !Number.isSafeInteger(startedMs)||!Number.isSafeInteger(endedMs)||
  !(seenSignatures instanceof Set))throw Error('PILOT_RECONCILIATION_INVALID');
 let previousSlot=Infinity;
 const expected=new Set();let invalid=false;
 for(const x of page){
  if(!validSig(x?.signature)||!Number.isSafeInteger(x.slot)||x.slot>previousSlot||
     (x.blockTime!==null&&!Number.isSafeInteger(x.blockTime))){invalid=true;break;}
  previousSlot=x.slot;
  if(x.blockTime!==null&&x.blockTime*1000>=startedMs&&x.blockTime*1000<=endedMs)
   expected.add(x.signature);
 }
 const oldest=page.at(-1)?.blockTime;
 // A full page still inside the test window is truncated. Never report 100% recall.
 const complete=!invalid&&page.every(x=>x.blockTime!==null)&&
  (page.length<PILOT.maxRpcPage||
   (Number.isSafeInteger(oldest)&&oldest*1000<=startedMs));
 const matched=[...expected].filter(x=>seenSignatures.has(x)).length;
 return {status:invalid?'INVALID_RPC_PAGE':complete?'BOUNDED_RPC_PAGE_COVERS_WINDOW':'RPC_PAGE_TRUNCATED_OR_BLOCKTIME_UNKNOWN',
  rpcInWindow:expected.size,websocketMatched:matched,missed:expected.size-matched,
  recall:complete&&expected.size>0?matched/expected.size:null,complete};
}
export function reserveForwardGuard(now,reserved,webhook,decodeBudget=0){
 const values=[now,reserved,webhook,decodeBudget];
 if(values.some(v=>!Number.isSafeInteger(v)||v<0))throw Error('PILOT_BUDGET_INPUT_INVALID');
 const nextUtcDay=Date.parse(new Date(now).toISOString().slice(0,10)+'T00:00:00Z')+86400000;
 const future=Math.ceil((nextUtcDay-now)/300000)*PILOT.existingForwardCreditsPer5m;
 const allowed=reserved+PILOT.reserveHeliusCredits+future+decodeBudget<=PILOT.sharedRpcDailyCap&&
   reserved+webhook+decodeBudget+PILOT.reserveHeliusCredits<=PILOT.localHeliusDailyCap;
 return {allowed,futureCreditsProtected:future,pilotReservedCredits:PILOT.reserveHeliusCredits};
}
export function pairedResult(rows){
 const usable=rows.filter(r=>r.stream_trigger!==null&&r.scheduled_trigger!==null&&
  r.coverage==='CONTINUOUS_STREAM'&&r.outcome_status==='OBSERVED_EXACT_POOL');
 const avg=which=>{const flagged=usable.filter(r=>r[which]===1);
  return {alerts:flagged.length,positives:flagged.filter(r=>r.return_pct>=5).length,
   hitRate:flagged.length?flagged.filter(r=>r.return_pct>=5).length/flagged.length:null};};
 return {pairedCount:usable.length,stream:avg('stream_trigger'),
  scheduled:avg('scheduled_trigger'),unknown:rows.length-usable.length,
  caveat:'ACTIVITY_VS_M5_BUY_RATIO_PROXIES_NOT_EQUAL_TRADING_SIGNALS;SMALL_PILOT_NO_PROOF_OF_ALPHA'};
}
