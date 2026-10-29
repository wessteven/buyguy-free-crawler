// GOGET / WHAT'S GOOD: isolated manual live LaunchLab transaction verification.
// A confirmed logsSubscribe notice is a candidate, not a birth. No alerts,
// D1, background retries, automatic lookups, paper trading or buy signals.
import {loadLaunchlabTransaction,classifyLaunchlabBirth} from './launchlab-birth-research.mjs';

const sigRE=/^[1-9A-HJ-NP-Za-km-z]{80,90}$/;
const validSig=s=>typeof s==='string'&&sigRE.test(s);
const validSlot=n=>Number.isSafeInteger(n)&&n>0;
const validUtc=s=>typeof s==='string'&&
 /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(s)&&
 Number.isFinite(Date.parse(s));
const round=n=>Math.round(n*100)/100;

/**
 * Verify one previously accepted, post-ACK, live WebSocket hint.
 * The caller owns the global budget and concurrency cap. This helper makes
 * at most ONE RPC getTransaction request, with no retry/fallback.
 * A missing/mismatched transaction.signatures[0] is unresolved, even when
 * the instruction decoder recognizes a birth. No invented alert timestamp.
 */
export async function verifyLaunchlabLiveCandidate({
 rpcUrl,signature,slot,streamReceivedAt,streamReceivedMonotonicMs,
 fetcher=fetch,transactionLoader=loadLaunchlabTransaction,signal=null,
 now=()=>new Date().toISOString(),monotonic=()=>performance.now()
}={}){
 if(typeof rpcUrl!=='string'||!rpcUrl.startsWith('https://')||
    !validSig(signature)||!validSlot(slot)||!validUtc(streamReceivedAt)||
    !Number.isFinite(streamReceivedMonotonicMs)||
    typeof fetcher!=='function'||typeof transactionLoader!=='function'||
    (signal!==null&&(typeof signal!=='object'||typeof signal.aborted!=='boolean'))||
    typeof now!=='function'||typeof monotonic!=='function')
  throw Error('VALID_LIVE_CANDIDATE_VERIFICATION_INPUTS_REQUIRED');
 const out={
  signature,slot,origin:'POST_ACK_LIVE_LOG_HINT',
  streamReceivedAt,streamReceivedMonotonicMs,
  classification:'UNRESOLVED',evidence:'NONE',
  verifiedAt:null,noticeToVerificationMs:null,
  mint:null,curve:null,quoteMint:null,kind:null,
  rpcCalls:1,providerReceiptLagKnown:false,
  actualLiveAlertLatencyMs:null,deviceDeliveredAt:null,
  independentBuyersVerified:null,marketCapUsd:null,liquidityUsd:null,
  tradabilityVerified:false,buyQualified:false
 };
 let tx,lookupFailure=null;
 try{
  if(signal?.aborted)lookupFailure='RPC_ABORTED';
  else{
   tx=await transactionLoader(rpcUrl,signature,fetcher,{signal:signal??undefined});
   if(signal?.aborted)lookupFailure='RPC_ABORTED';
  }
 }catch(error){
  lookupFailure=signal?.aborted||error?.name==='AbortError'?'RPC_ABORTED':
   error?.message==='RPC_HTTP_429'?'RPC_RATE_LIMITED':
   'RPC_TRANSACTION_LOOKUP_FAILED';
 }
 const finish=()=>{
  const t=now(),elapsed=monotonic()-streamReceivedMonotonicMs;
  if(!validUtc(t)||Date.parse(t)<Date.parse(streamReceivedAt)||
      !Number.isFinite(elapsed)||elapsed<0){
   out.classification='VERIFICATION_CLOCK_INVALID';
   out.evidence='CLOCK_INVALID';
   out.mint=null;out.curve=null;out.quoteMint=null;out.kind=null;
   return out;
  }
  out.verifiedAt=t;out.noticeToVerificationMs=round(elapsed);
  return out;
 };
 if(lookupFailure){out.classification=lookupFailure;return finish()}
 if(!tx){out.classification='TRANSACTION_UNAVAILABLE';return finish()}
 if(!validSlot(tx.slot)||tx.slot!==slot){
  out.classification='TRANSACTION_SLOT_MISMATCH_OR_UNKNOWN';return finish()
 }
 if(!tx.meta||!Object.hasOwn(tx.meta,'err')){
  out.classification='TRANSACTION_RESULT_UNKNOWN';return finish()
 }
 if(tx.meta.err!==null){
  out.classification='TRANSACTION_FAILED';return finish()
 }
 // A normal jsonParsed getTransaction response carries transaction.signatures.
 // Replayed/trimmed fixtures may omit this: never call them verified live births.
 const sigs=tx.transaction?.signatures;
 if(!Array.isArray(sigs)||sigs[0]!==signature){
  out.classification='TRANSACTION_SIGNATURE_MISSING_OR_MISMATCH';return finish()
 }
 const finding=classifyLaunchlabBirth(tx,{signature,slot,receivedAt:streamReceivedAt});
 if(finding.status==='LAUNCH_INSTRUCTION_OBSERVED'&&
    finding.signature===signature&&finding.slot===slot){
  out.classification='LAUNCH_INSTRUCTION_VERIFIED';
  out.evidence=finding.evidence;
  out.mint=finding.mint;out.curve=finding.curve;
  out.quoteMint=finding.quoteMint;out.kind=finding.kind;
 }else{
  out.classification=finding.status||'UNCLASSIFIED_TRANSACTION';
  out.evidence=finding.evidence||'NONE';
 }
 return finish();
}
