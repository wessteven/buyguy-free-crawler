// GOGET LaunchLab early-flow identity join: offline, read-only, no providers.
// The supplied decoded swap identity is a research assertion, NOT an independent
// on-chain verification of the swap or its fee payer's beneficial owner.
// No production imports, D1, network, alerts, automatic trades or buy signals.
import {LAUNCHLAB_PROGRAM} from './launchlab-birth-research.mjs';
import {analyzeMicroAcceleration} from './micro-acceleration-research.mjs';

const address=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const signature=/^[1-9A-HJ-NP-Za-km-z]{80,90}$/;
const proof='DECODED_SWAP_PROGRAM_ACCOUNTS';
const birthProof='SUCCESSFUL_ANCHOR_INITIALIZE_DISCRIMINATOR_AND_IDL_ACCOUNTS';
const utc=x=>typeof x==='string'&&
 /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(x)&&
 Number.isFinite(Date.parse(x));
const empty=(status,detail=null)=>({
 mode:'OFFLINE_LAUNCHLAB_EXACT_CURVE_FLOW_JOIN',status,detail,
 episodes:[],episodeCount:0,identityScope:'CALLER_SUPPLIED_EXACT_DECODER_ACCOUNTS',
 sourceIdentityIndependentlyVerified:false,
 independentBuyersVerified:null,marketCapUsd:null,liquidityUsd:null,
 executableExitVerified:false,actualLiveAlertLatencyMs:null,
 buyQualified:false,coverage:'UNKNOWN'
});

/**
 * Inputs are caller-supplied, individually decoded swap records and complete
 * source windows, all explicitly scoped to the same LaunchLab mint/curve.
 * Every event and coverage window must carry an actual source receipt time.
 * Historical receipt AFTER a hypothetical signal time cannot be backdated.
 * This pure join never upgrades a fee-payer count to independent buyers.
 */
export function joinVerifiedLaunchlabTo30sFlow({
 birth,observations=[],windows=[],asOf,source='RESEARCH_DECODED_SWAPS'
}={}){
 if(!utc(asOf))throw Error('VALID_UTC_AS_OF_REQUIRED');
 if(!Array.isArray(observations)||observations.length>5000||
    !Array.isArray(windows)||windows.length>100)
  throw Error('BOUNDED_FLOW_INPUT_REQUIRED');
 if(!birth||birth.classification!=='LAUNCH_INSTRUCTION_VERIFIED'||
    birth.evidence!==birthProof||birth.origin!=='POST_ACK_LIVE_LOG_HINT'||
    birth.buyQualified!==false||!signature.test(birth.signature||'')||
    !Number.isSafeInteger(birth.slot)||birth.slot<=0||
    !address.test(birth.mint||'')||!address.test(birth.curve||'')||
    !address.test(birth.quoteMint||'')||
    new Set([birth.mint,birth.curve,birth.quoteMint]).size!==3||
    !utc(birth.streamReceivedAt)||!utc(birth.verifiedAt)||
    Date.parse(birth.verifiedAt)<Date.parse(birth.streamReceivedAt))
  return empty('UNVERIFIED_OR_INCOMPLETE_BIRTH');
 if(Date.parse(birth.verifiedAt)>Date.parse(asOf))
  return empty('BIRTH_VERIFICATION_NOT_YET_AVAILABLE');
 const identity=x=>x?.mint===birth.mint&&x?.curve===birth.curve&&
  x?.programId===LAUNCHLAB_PROGRAM&&x?.sourceProof===proof;
 if(!observations.every(identity)||!windows.every(identity))
  return empty('MIXED_OR_UNVERIFIED_SOURCE_IDENTITY');
 if(!observations.every(x=>utc(x.receivedAt))||
    !windows.every(x=>utc(x.receivedAt)))
  return empty('SOURCE_RECEIPT_PROVENANCE_MISSING');
 // A source receipt preceding its event time is inconsistent. A future
 // observation may exist in the input but MUST NOT influence this as-of replay.
 if(observations.some(x=>!Number.isSafeInteger(x.t)||x.t<=0||
    Date.parse(x.receivedAt)<x.t*1000))
  return empty('INVALID_EVENT_OR_RECEIPT_TIME');
 const cutoff=Date.parse(asOf);
 const eventCutoff=observations.filter(x=>x.t*1000<=cutoff);
 if(eventCutoff.some(x=>Date.parse(x.receivedAt)>cutoff))
  return empty('FUTURE_EVENT_RECEIPT_AT_CAUSAL_CUTOFF');
 const firstEligibleStart=Math.ceil(Date.parse(birth.streamReceivedAt)/30000)*30000;
 const eligibleWindows=windows.filter(w=>
  (w.complete===true||w.fully_covered_by_pagination===true)&&
  Date.parse(w.start??w.start_utc??'')>=firstEligibleStart&&
  Date.parse(w.end??w.end_utc??'')<=cutoff&&
  Date.parse(w.receivedAt)<=cutoff
 );
 if(!eligibleWindows.length)return empty('NO_CAUSALLY_COMPLETE_IDENTITY_WINDOWS');
 const report=analyzeMicroAcceleration(eventCutoff,eligibleWindows,{asOf,source});
 const episodes=report.episodes.map(hit=>{
  const from=Date.parse(hit.windowFrom),end=Date.parse(hit.windowEnd);
  const events=eventCutoff.filter(x=>x.t*1000>=from&&x.t*1000<end);
  const supporting=eligibleWindows.filter(w=>
   Date.parse(w.start??w.start_utc??'')<=from&&
   Date.parse(w.end??w.end_utc??'')>=end);
  const ready=Math.max(Date.parse(birth.verifiedAt),end,
   ...events.map(x=>Date.parse(x.receivedAt)),
   ...supporting.map(w=>Date.parse(w.receivedAt)));
  return {...hit,sourceIdentityIndependentlyVerified:false,
   earliestEvidenceReadyAt:new Date(ready).toISOString(),
   evidenceReadyAfterWindowEndMs:ready-end,
   actualCollectorReceiptAt:null,actualLiveAlertLatencyMs:null,
   independentBuyers:null,knownLiquidityUsd:null,marketCapUsd:null,
   executableExitVerified:false,buyQualified:false,
   identityEvidence:'CALLER_SUPPLIED_EXACT_MINT_CURVE_PROGRAM_DECODER',
   caveat:'Offline, receipt-gated and identity-scoped hypothesis. No independent on-chain verification of swaps, beneficial buyers, reserves, valuation or executable exit.'};
 });
 return {...empty(episodes.length?'OFFLINE_IDENTITY_SCOPED_HYPOTHESES':'NO_ACCELERATION_HYPOTHESIS'),
  source,asOf,birthSignature:birth.signature,birthSlot:birth.slot,
  mint:birth.mint,curve:birth.curve,programId:LAUNCHLAB_PROGRAM,
  scopedEvents:eventCutoff.length,eligibleCoverageWindows:eligibleWindows.length,
  episodeCount:episodes.length,episodes,
  firstEligibleStart:new Date(firstEligibleStart).toISOString()};
}
