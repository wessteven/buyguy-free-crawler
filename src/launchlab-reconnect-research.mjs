// GOGET read-only LaunchLab stream reconnect continuity probe.
// One bounded signature-history reconciliation. No cron, D1, trades, retry loops,
// buy qualification, or invented continuity when history/cursors are incomplete.
import {LAUNCHLAB_PROGRAM} from './launchlab-birth-research.mjs';

const SIGNATURE=/^[1-9A-HJ-NP-Za-km-z]{80,90}$/;
const validSig=s=>typeof s==='string'&&SIGNATURE.test(s);
const integer=n=>Number.isSafeInteger(n)&&n>0;
const rpc=(method,params)=>({jsonrpc:'2.0',id:1,method,params});

/**
 * Reconstruct *signature-list overlap*, not complete detection or verified
 * launch creation. getSignaturesForAddress is newest-first. Pages do not
 * identify protocol initialization instructions, thus every newly discovered
 * signature still needs separate capped getTransaction classification.
 */
export async function reconcileLaunchlabCheckpoint({
 rpcUrl,checkpointSignature,checkpointSlot=null,
 fetcher=fetch,pageLimit=80,maxPages=3,requestedAt=()=>new Date().toISOString(),signal=null
}={}){
 if(typeof rpcUrl!=='string'||!rpcUrl.startsWith('https://')||
    !validSig(checkpointSignature)||typeof fetcher!=='function'||
    (signal!==null&&(typeof signal!=='object'||typeof signal.aborted!=='boolean')))
  throw Error('VALID_RPC_AND_CHECKPOINT_REQUIRED');
 const limit=Math.max(1,Math.min(100,Math.floor(Number(pageLimit)||80)));
 const pagesCap=Math.max(1,Math.min(3,Math.floor(Number(maxPages)||3)));
 if(checkpointSlot!==null&&!integer(checkpointSlot))
  throw Error('VALID_CHECKPOINT_SLOT_REQUIRED');

 const result={
  mode:'READ_ONLY_BOUNDED_RECONNECT_RECONCILIATION',
  program:LAUNCHLAB_PROGRAM,checkpointSignature,checkpointSlot,
  beganAt:requestedAt(),finishedAt:null,
  pages:0,requestedPageLimit:limit,maxPages:pagesCap,
  signaturesFetched:0,duplicateSignatures:0,failedTxSignatures:0,
  checkpointOverlapFound:false,sourceOrderViolations:0,
  candidates:[],status:'UNKNOWN',notifiedBirthsVerified:0,
  launchInitializationEvidence:null,buyQualified:false,
  dataLimitations:[
   'Continuity of program signature history is not proof the live stream saw every log notification.',
   'A Solana program-signature query includes non-launch activity. Every candidate needs an exact transaction instruction check.',
   'A bounded cutoff or RPC error leaves coverage unknown; do not label missing intervals clear.',
   'No on-chain buyers, liquidity, trade entry, trading safety or actual device alert is verified.'
  ]
 };
 const seen=new Set();let cursor=null,previousSlot=null,reason='GAP_UNRESOLVED_PAGE_CAP';
 try{
  for(let page=0;page<pagesCap;page++){
   if(signal?.aborted){reason='RPC_ABORTED';break}
   const options={limit,commitment:'confirmed'};
   if(cursor)options.before=cursor;
   const response=await fetcher(rpcUrl,{method:'POST',signal:signal??undefined,headers:{'content-type':'application/json'},
    body:JSON.stringify(rpc('getSignaturesForAddress',[LAUNCHLAB_PROGRAM,options]))});
   result.pages++;
   if(signal?.aborted){reason='RPC_ABORTED';break}
   if(!response?.ok){reason=response?.status===429?'RATE_LIMITED':'RPC_HTTP_ERROR';break}
   const data=await response.json();
   if(signal?.aborted){reason='RPC_ABORTED';break}
   if(data?.error||!Array.isArray(data?.result)){reason='RPC_INVALID_RESPONSE';break}
   const rows=data.result;
   if(!rows.length){reason='HISTORY_EXHAUSTED_BEFORE_CHECKPOINT';break}
   let invalid=false,oldestSignature=null;
   for(const row of rows){
    const s=row?.signature;
    if(!validSig(s)||!integer(row?.slot)||
       !Object.hasOwn(row,'err')||
       (row.err!==null&&(typeof row.err!=='object'||Array.isArray(row.err)))){
     invalid=true;break;
    }
    oldestSignature=s;
    if(previousSlot!==null&&row.slot>previousSlot)result.sourceOrderViolations++;
    previousSlot=row.slot;
    if(seen.has(s)){
     result.duplicateSignatures++;invalid=true;break;
    }
    seen.add(s);result.signaturesFetched++;
    if(s===checkpointSignature){
     if(checkpointSlot!==null&&row.slot!==checkpointSlot){
      reason='CHECKPOINT_SLOT_MISMATCH';break;
     }
     if(row.err!==null&&row.err!==undefined){
      reason='CHECKPOINT_FAILED_TRANSACTION';break;
     }
     result.checkpointOverlapFound=true;
     reason='CHECKPOINT_OVERLAP_VERIFIED';
     break;
    }
    if(row.err!==null&&row.err!==undefined)result.failedTxSignatures++;
    result.candidates.push({
     signature:s,slot:row.slot,
     blockTime:integer(row.blockTime)?row.blockTime:null,
     status:row.err===null?'UNCLASSIFIED_TRANSACTION':
      row.err===undefined?'TX_RESULT_UNKNOWN':'FAILED_TRANSACTION'
    });
   }
   if(invalid){reason='INVALID_RPC_HISTORY';break}
   if(result.checkpointOverlapFound||
      reason==='CHECKPOINT_SLOT_MISMATCH'||
      reason==='CHECKPOINT_FAILED_TRANSACTION')break;
   if(rows.length<limit){reason='HISTORY_EXHAUSTED_BEFORE_CHECKPOINT';break}
   if(!oldestSignature||oldestSignature===cursor){
    reason='NONADVANCING_CURSOR';break;
   }
   cursor=oldestSignature;
  }
 }catch{
  reason=signal?.aborted?'RPC_ABORTED':'RPC_UNAVAILABLE';
 }
 if(signal?.aborted){reason='RPC_ABORTED';result.checkpointOverlapFound=false}
 result.finishedAt=requestedAt();
 result.status=reason==='CHECKPOINT_OVERLAP_VERIFIED'&&result.sourceOrderViolations?
  'CHECKPOINT_OVERLAP_WITH_ORDER_VIOLATION':reason;
 result.candidates.reverse(); // old -> new, explicitly requiring later independent classification
 result.notifiedBirthsVerified=0;
 result.launchInitializationEvidence=null;
 return result;
}
