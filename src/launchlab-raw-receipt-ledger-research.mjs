// GOGET / WHAT'S GOOD: causal receipt ledger for RAW LaunchLab swaps.
// No network, provider calls, D1, production imports, alerts or trades.
// Window completeness remains caller-attested, NOT independently verified.
import {decodeLaunchlabSwapTransaction} from './launchlab-raw-swap-research.mjs';
import {LAUNCHLAB_PROGRAM} from './launchlab-birth-research.mjs';
import {MICRO_RULE} from './micro-acceleration-research.mjs';

const addr=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const sig=/^[1-9A-HJ-NP-Za-km-z]{80,90}$/;
const utc=x=>typeof x==='string'&&
 /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(x)&&
 Number.isFinite(Date.parse(x));
const ms=x=>Date.parse(x);
const empty=status=>({
 mode:'OFFLINE_RAW_LAUNCHLAB_RECEIPT_LEDGER',status,
 episodes:[],episodeCount:0,windowSummaries:[],
 decodedTransactions:0,rawTransactionsConsidered:0,
 coverage:'UNKNOWN',coverageIndependentlyVerified:false,
 sourceIdentityIndependentlyVerified:false,independentBuyersVerified:null,
 executedQuoteSol:null,marketCapUsd:null,liquidityUsd:null,
 executableExitVerified:false,actualLiveAlertLatencyMs:null,
 deviceDeliveredAt:null,buyQualified:false
});

/**
 * Caller supplies actual getTransaction-shaped raw records, each with
 * receipt time, plus explicitly attested 30-second source coverage windows.
 * No lookahead: a later receipt is never backdated into an earlier asOf.
 * A positive episode is a *research hypothesis*, never a buy signal.
 */
export function buildLaunchlabRawReceiptLedger({
 birth,rawTransactions=[],windows=[],asOf
}={}){
 if(!utc(asOf))throw Error('VALID_UTC_AS_OF_REQUIRED');
 if(!Array.isArray(rawTransactions)||rawTransactions.length>300||
    !Array.isArray(windows)||windows.length>100)
  throw Error('BOUNDED_LEDGER_INPUT_REQUIRED');
 if(!birth||birth.classification!=='LAUNCH_INSTRUCTION_VERIFIED'||
    birth.evidence!=='SUCCESSFUL_ANCHOR_INITIALIZE_DISCRIMINATOR_AND_IDL_ACCOUNTS'||
    birth.origin!=='POST_ACK_LIVE_LOG_HINT'||birth.buyQualified!==false||
    !sig.test(birth.signature||'')||
    !Number.isSafeInteger(birth.slot)||birth.slot<=0||
    !addr.test(birth.mint||'')||!addr.test(birth.curve||'')||
    !addr.test(birth.quoteMint||'')||
    new Set([birth.mint,birth.curve,birth.quoteMint]).size!==3||
    !utc(birth.streamReceivedAt)||!utc(birth.verifiedAt)||
    ms(birth.verifiedAt)<ms(birth.streamReceivedAt))
  return empty('UNVERIFIED_OR_INCOMPLETE_BIRTH');
 const cutoff=ms(asOf);
 if(ms(birth.verifiedAt)>cutoff)return empty('BIRTH_NOT_YET_VERIFIED');
 const firstEligibleStart=Math.ceil(ms(birth.streamReceivedAt)/30000)*30000;
 const coverage=new Map();
 for(const w of windows){
  const start=ms(w?.start),end=ms(w?.end),receipt=ms(w?.receivedAt);
  if(!utc(w?.start)||!utc(w?.end)||!utc(w?.receivedAt)||
     !Number.isFinite(start)||!Number.isFinite(end)||
     start%30000!==0||end-start!==30000||receipt<end||
     w?.complete!==true||
     w?.sourceProof!=='CALLER_ATTESTED_BOUNDED_FULL_PAGINATION'||
     w?.mint!==birth.mint||w?.curve!==birth.curve||
     w?.programId!==LAUNCHLAB_PROGRAM)
   return empty('INVALID_OR_UNATTESTED_COVERAGE_WINDOW');
  if(start<firstEligibleStart||end>cutoff||receipt>cutoff)continue;
  const prior=coverage.get(start);
  if(prior&&prior.end!==end)return empty('CONFLICTING_COVERAGE_WINDOWS');
  if(!prior||receipt>prior.receipt)coverage.set(start,{start,end,receipt});
 }
 if(coverage.size>0){
  const bounds=[...coverage.keys()];
  if(Math.max(...bounds)-Math.min(...bounds)>86400000)
   return empty('WINDOW_SPAN_EXCEEDS_RESEARCH_BUDGET');
 }
 if(!coverage.size)return empty('NO_CAUSALLY_ATTESTED_WINDOWS');
 const seen=new Map();const events=[];
 for(const entry of rawTransactions){
  if(!utc(entry?.receivedAt))return empty('RAW_TRANSACTION_RECEIPT_MISSING');
  if(ms(entry.receivedAt)>cutoff)continue; // future source receipt never counts
  const decoded=decodeLaunchlabSwapTransaction({
   transaction:entry.transaction,signature:entry.signature,receivedAt:entry.receivedAt
  });
  if(decoded.status!=='DECODED_SUCCESSFUL_SWAP_INSTRUCTION')
   return {...empty('RAW_SWAP_UNRESOLVED'),unresolvedStatus:decoded.status};
  if(decoded.count!==1)return empty('MULTI_SWAP_SIGNATURE_AMBIGUOUS');
  const swap=decoded.swaps[0];
  if(swap.mint!==birth.mint||swap.curve!==birth.curve||
     swap.quoteMint!==birth.quoteMint||swap.programId!==LAUNCHLAB_PROGRAM)
   return empty('MIXED_OR_MISMATCHED_POOL_IDENTITY');
  if(swap.blockTime*1000>cutoff)return empty('FUTURE_CHAIN_EVENT_AT_AS_OF');
  const previous=seen.get(swap.signature);
  if(previous){
   if(previous.slot!==swap.slot||previous.side!==swap.side||
      previous.traderSigner!==swap.traderSigner||
      previous.receivedAt!==swap.receivedAt)
    return empty('CONFLICTING_DUPLICATE_SIGNATURE');
   continue;
  }
  seen.set(swap.signature,swap);
  events.push(swap);
 }
 const windowSummaries=[...coverage.values()].sort((a,b)=>a.start-b.start)
  .map(w=>{
   const inWindow=events.filter(e=>e.blockTime*1000>=w.start&&e.blockTime*1000<w.end);
   const buys=inWindow.filter(e=>e.side==='buy');
   const sells=inWindow.filter(e=>e.side==='sell');
   return {
    start:w.start,end:w.end,sourceReceiptAt:new Date(w.receipt).toISOString(),
    buys:buys.length,sells:sells.length,distinctBuyFeePayers:new Set(buys.map(e=>e.feePayer)).size,
    token2022Unassessed:inWindow.some(e=>e.token2022),
    signatures:inWindow.map(e=>e.signature),
    maxSwapReceiptAt:inWindow.length?
     new Date(Math.max(...inWindow.map(e=>ms(e.receivedAt)))).toISOString():null,
    quoteVolumeSol:null,independentBuyers:null,
    completeness:'CALLER_ATTESTED_NOT_INDEPENDENTLY_VERIFIED'
   };
  });
 const episodes=[];let lastEmitted=-Infinity;
 for(let i=1;i<windowSummaries.length;i++){
  const a=windowSummaries[i-1],b=windowSummaries[i];
  if(a.end!==b.start)continue;
  const buyers=events.filter(e=>e.side==='buy'&&
   e.blockTime*1000>=a.start&&e.blockTime*1000<b.end);
  const payerCounts=new Map();
  for(const e of buyers)payerCounts.set(e.feePayer,(payerCounts.get(e.feePayer)||0)+1);
  const distinct=payerCounts.size;
  const dominant=buyers.length?Math.max(...payerCounts.values())/buyers.length:null;
  const acceleration=a.buys?b.buys/a.buys:null;
  const ratio=b.buys/Math.max(1,b.sells);
  if(a.buys<MICRO_RULE.firstWindowMinBuys||
     b.buys<MICRO_RULE.secondWindowMinBuys||
     acceleration<MICRO_RULE.minSecondToFirstBuyRatio||
     ratio<MICRO_RULE.minRecentBuySellRatio||
     distinct<MICRO_RULE.minDistinctFeePayers||
     b.end-lastEmitted<MICRO_RULE.dedupeSeconds*1000)continue;
  const ready=Math.max(ms(birth.verifiedAt),b.end,
   ms(a.sourceReceiptAt),ms(b.sourceReceiptAt),
   ...buyers.map(e=>ms(e.receivedAt)));
  episodes.push({
   candidateClass:'OFFLINE_RAW_INSTRUCTION_FLOW_HYPOTHESIS',
   windowFrom:new Date(a.start).toISOString(),windowEnd:new Date(b.end).toISOString(),
   firstWindowBuys:a.buys,secondWindowBuys:b.buys,
   lastWindowSells:b.sells,buyAccelerationRatio:acceleration,
   lastWindowBuySellRatio:ratio,distinctBuyFeePayers:distinct,
   largestFeePayerBuyShare:dominant,
   warnings:[
    ...(dominant>MICRO_RULE.maxSingleFeePayerBuyShare?['FEE_PAYER_CONCENTRATION']:[]),
    ...(a.token2022Unassessed||b.token2022Unassessed?['TOKEN_2022_EXTENSIONS_UNASSESSED']:[]),
    'SOURCE_WINDOW_COMPLETENESS_NOT_INDEPENDENTLY_VERIFIED'
   ],
   earliestEvidenceReadyAt:new Date(ready).toISOString(),
   evidenceReadyAfterWindowEndMs:ready-b.end,
   actualCollectorAlertEmittedAt:null,actualLiveAlertLatencyMs:null,
   independentBuyers:null,executedQuoteSol:null,marketCapUsd:null,
   liquidityUsd:null,executableExitVerified:false,buyQualified:false
  });
  lastEmitted=b.end;
 }
 return {...empty(episodes.length?'OFFLINE_RAW_SWAP_HYPOTHESES':'NO_RAW_SWAP_HYPOTHESIS'),
  birthSignature:birth.signature,mint:birth.mint,curve:birth.curve,
  asOf,firstEligibleStart:new Date(firstEligibleStart).toISOString(),
  rawTransactionsConsidered:rawTransactions.length,
  decodedTransactions:events.length,
  windowSummaries:windowSummaries.map(w=>({
   ...w,start:new Date(w.start).toISOString(),end:new Date(w.end).toISOString()
  })),
  coverage:'CALLER_ATTESTED_BOUNDED_WINDOWS_NOT_INDEPENDENTLY_VERIFIED',
  coverageIndependentlyVerified:false,
  sourceIdentityIndependentlyVerified:true,
  episodes,episodeCount:episodes.length,
  caveat:'Raw transaction instruction identities and signers were decoded, but source completeness, actual executed quote transfers, buyer independence, valuation, reserves and sellability remain unverified.'
 };
}
