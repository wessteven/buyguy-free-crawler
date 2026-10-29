// GOGET research-only LaunchLab reconnect review: bounded historical signature replay.
// Not wired into the production stream, D1, alerts, Android, cron or trading.
// Signature overlap is not proof of complete WebSocket notification coverage.
import {reconcileLaunchlabCheckpoint} from './launchlab-reconnect-research.mjs';
import {loadLaunchlabTransaction,classifyLaunchlabBirth} from './launchlab-birth-research.mjs';

const sigRE=/^[1-9A-HJ-NP-Za-km-z]{80,90}$/;
const validSig=s=>typeof s==='string'&&sigRE.test(s);
const validSlot=s=>Number.isSafeInteger(s)&&s>0;
const utc=s=>typeof s==='string'&&Number.isFinite(Date.parse(s))&&
 /^\d{4}-\d{2}-\d{2}T/.test(s)&&s.endsWith('Z');
const bounded=(n,max,defaultValue)=>Number.isFinite(n)?
 Math.max(1,Math.min(max,Math.floor(n))):defaultValue;

/**
 * An explicit, manual gap-review stage. Newest-first signature history is
 * reversed by the reconciliation module to process oldest -> newest.
 * Never calls Helius without caller-supplied RPC URL; no retries.
 *
 * A "complete" review means only that a finite page list overlapped the
 * checkpoint and each fetched signature was classified or known failed.
 * It does NOT prove no WebSocket events were lost or that a token is safe.
 */
export async function reviewLaunchlabReconnectGap({
 rpcUrl,checkpointSignature,checkpointSlot,
 fetcher=fetch,now=()=>new Date().toISOString(),
 pageLimit=80,maxPages=3,maxTransactions=6,
 liveSeenSignatures=[],reconciler=reconcileLaunchlabCheckpoint,
 transactionLoader=loadLaunchlabTransaction
}={}){
 if(!validSig(checkpointSignature)||!validSlot(checkpointSlot)||
    typeof fetcher!=='function'||typeof reconciler!=='function'||
    typeof transactionLoader!=='function'||typeof now!=='function'||
    !Array.isArray(liveSeenSignatures)||liveSeenSignatures.length>300||
    !liveSeenSignatures.every(validSig))
  throw Error('VALID_BOUNDED_GAP_REVIEW_INPUTS_REQUIRED');
 const maxTx=bounded(maxTransactions,6,6);
 const startedAt=now();
 if(!utc(startedAt))throw Error('UTC_REVIEW_CLOCK_REQUIRED');
 const liveSeen=new Set(liveSeenSignatures);
 const reconciliation=await reconciler({
  rpcUrl,checkpointSignature,checkpointSlot,fetcher,pageLimit,maxPages,requestedAt:now
 });
 const out={
  kind:'LAUNCHLAB_OFFLINE_RECONNECT_GAP_REVIEW',schemaVersion:1,
  startedAt,completedAt:null,checkpointSignature,checkpointSlot,
  reconciliationStatus:reconciliation.status,
  historyPages:reconciliation.pages,
  historySignaturesFetched:reconciliation.signaturesFetched,
  historyOverlapFound:reconciliation.checkpointOverlapFound,
  sourceOrderViolations:reconciliation.sourceOrderViolations,
  maxTransactionLookups:maxTx,transactionLookups:0,
  liveDuplicateSuppressed:0,failedHistoryTransactions:0,
  births:[],nonBirths:[],unresolved:[],
  status:'UNRESOLVED',replayCoverage:'UNKNOWN',
  watermarkCandidate:null,advanceAuthorized:false,
  buyQualified:false,independentBuyersVerified:null,
  actualLiveAlertLatencyMs:null,deviceDeliveryLatencyMs:null,
  caveats:[
   'This is a manual historical backfill, not a live WebSocket reconnect or a production alert.',
   'Overlap only supports bounded signature-list reconciliation; complete stream coverage remains unproven.',
   'Historical replay completion is not an actual token-birth detection timestamp.',
   'No liquidity, independently verified buyers, price, sellability, token safety or executable entry is proven.'
  ]
 };
 const finish=status=>{
  out.status=status;out.completedAt=now();
  if(!utc(out.completedAt))throw Error('UTC_REVIEW_CLOCK_REQUIRED');
  return out;
 };
 // Invalid, missing, truncated or nonmonotonic history is never "caught up".
 if(reconciliation.status!=='CHECKPOINT_OVERLAP_VERIFIED'||
    reconciliation.checkpointOverlapFound!==true||
    reconciliation.sourceOrderViolations!==0||
    !Array.isArray(reconciliation.candidates))
  return finish('HISTORY_GAP_UNRESOLVED');
 const candidates=reconciliation.candidates;
 if(candidates.length>300)return finish('HISTORY_CANDIDATES_EXCEED_CAP');
 const signatures=new Set();
 let incomplete=false;
 for(const c of candidates){
  if(!validSig(c?.signature)||!validSlot(c?.slot)||signatures.has(c.signature)){
   out.unresolved.push({signature:validSig(c?.signature)?c.signature:null,
    status:'INVALID_OR_DUPLICATE_HISTORY_CANDIDATE'});
   incomplete=true;continue;
  }
  signatures.add(c.signature);
  if(c.status==='FAILED_TRANSACTION'){
   out.failedHistoryTransactions++;
   out.nonBirths.push({signature:c.signature,slot:c.slot,status:'FAILED_TRANSACTION',
    evidence:'RPC_HISTORY_FAILED_TX',buyQualified:false});
   continue;
  }
  if(liveSeen.has(c.signature)){
   out.liveDuplicateSuppressed++;
   out.unresolved.push({signature:c.signature,slot:c.slot,status:'LIVE_SEEN_BUT_NOT_REVERIFIED'});
   incomplete=true;continue;
  }
  if(out.transactionLookups>=maxTx){
   out.unresolved.push({signature:c.signature,slot:c.slot,status:'TRANSACTION_LOOKUP_BUDGET_EXHAUSTED'});
   incomplete=true;continue;
  }
  out.transactionLookups++;
  let tx;
  try{tx=await transactionLoader(rpcUrl,c.signature,fetcher)}
  catch{
   out.unresolved.push({signature:c.signature,slot:c.slot,status:'RPC_TRANSACTION_LOOKUP_FAILED'});
   incomplete=true;continue;
  }
  if(!tx||!validSlot(tx.slot)||tx.slot!==c.slot||!tx.meta||
     !Object.hasOwn(tx.meta,'err')||
     (tx.meta.err!==null&&(typeof tx.meta.err!=='object'||Array.isArray(tx.meta.err)))){
   out.unresolved.push({signature:c.signature,slot:c.slot,
    status:!tx?'TRANSACTION_UNAVAILABLE':
     !validSlot(tx.slot)?'TRANSACTION_SLOT_UNKNOWN':
     tx.slot!==c.slot?'TRANSACTION_SLOT_MISMATCH':'TRANSACTION_RESULT_UNKNOWN'});
   incomplete=true;continue;
  }
  const classification=classifyLaunchlabBirth(tx,{signature:c.signature,slot:c.slot});
  if(classification.status==='LAUNCH_INSTRUCTION_OBSERVED'){
   out.births.push({
    signature:c.signature,slot:c.slot,protocol:'RAYDIUM_LAUNCHLAB',
    mint:classification.mint,curve:classification.curve,
    quoteMint:classification.quoteMint,kind:classification.kind,
    chainTime:classification.chainTime,
    observedVia:'HISTORICAL_RPC_REPLAY',liveObservedAt:null,
    backfillClassifiedAt:now(),actualLiveAlertLatencyMs:null,
    marketCapUsd:null,liquidityUsd:null,independentBuyers:null,
    tradabilityVerified:false,buyQualified:false
   });
  }else if(['TRANSACTION_FAILED','NO_SUPPORTED_LAUNCH_INSTRUCTION'].includes(classification.status)){
   out.nonBirths.push({signature:c.signature,slot:c.slot,
    status:classification.status,evidence:classification.evidence,buyQualified:false});
  }else{
   out.unresolved.push({signature:c.signature,slot:c.slot,status:classification.status});
   incomplete=true;
  }
 }
 if(incomplete)return finish('REPLAY_INCOMPLETE');
 out.replayCoverage='BOUNDED_SIGNATURE_HISTORY_OVERLAP_AND_CLASSIFICATION_ONLY';
 // Candidate for manual review; never automatically advance persistent checkpoints.
 const newest=candidates.at(-1);
 out.watermarkCandidate=newest?{signature:newest.signature,slot:newest.slot,
  status:'UNPERSISTED_RESEARCH_CANDIDATE'}:
  {signature:checkpointSignature,slot:checkpointSlot,status:'UNCHANGED_NO_NEW_SIGNATURES'};
 return finish('BOUNDED_REPLAY_CLASSIFIED');
}
