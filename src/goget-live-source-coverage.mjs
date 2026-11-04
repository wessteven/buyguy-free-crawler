// Independent read-only GOGET source ledger. It cannot certify trade profits or zero-activity wallets.
export const LIVE_COVERAGE_BOUNDS=Object.freeze({webhookWallets:12,rpcPilotWallets:3,
  lookbackHours:24,maxD1Queries:6,maxRows:32,freshnessMinutes:90});
const address=x=>typeof x==='string'&&/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(x);
export function expectedWebhookWallets(cohort,workerConfig){
 if(!Array.isArray(cohort)||cohort.length!==14||
   !cohort.every(x=>address(x?.wallet)&&x.vetted===false&&typeof x.webhookEnabled==='boolean'))
   throw Error('WEBHOOK_COHORT_INVALID');
 const all=cohort.map(x=>x.wallet);
 if(new Set(all).size!==all.length)throw Error('WEBHOOK_COHORT_DUPLICATES');
 const wanted=cohort.filter(x=>x.webhookEnabled===true).map(x=>x.wallet);
 if(wanted.length!==LIVE_COVERAGE_BOUNDS.webhookWallets)
   throw Error('WEBHOOK_ROSTER_NOT_12');
 const configured=workerConfig.match(/WALLET_WATCHED_ADDRESSES\s*=\s*"([^"]+)"/)?.[1]?.split(',');
 if(!Array.isArray(configured)||configured.length!==wanted.length||
   new Set(configured).size!==configured.length||!wanted.every(x=>configured.includes(x)))
   throw Error('WORKER_WEBHOOK_ROSTER_MISMATCH');
 return wanted;
}
const parseTime=x=>typeof x==='string'&&Number.isFinite(Date.parse(x))?Date.parse(x):null;
export function assessLiveCoverage({wanted,recentWalletRows,deliveries,cursors,control,rawHealth,budget,asOf}){
 const now=parseTime(asOf);
 if(now===null||!Array.isArray(wanted)||wanted.length!==LIVE_COVERAGE_BOUNDS.webhookWallets||
   new Set(wanted).size!==wanted.length||!Array.isArray(recentWalletRows)||
   !Array.isArray(deliveries)||!Array.isArray(cursors)||!Array.isArray(control)||
   !Array.isArray(rawHealth)||!Array.isArray(budget))
   throw Error('SOURCE_AUDIT_INPUT_INVALID');
 const rowMap=new Map();
 for(const r of recentWalletRows){
   if(!address(r?.wallet)||rowMap.has(r.wallet)||!Number.isSafeInteger(Number(r.n))||
     Number(r.n)<0)throw Error('SOURCE_AUDIT_WALLET_ROW_INVALID');
   rowMap.set(r.wallet,r);
 }
 const unexpectedWalletRows=[...rowMap.keys()].filter(x=>!wanted.includes(x));
 const wallets=wanted.map(wallet=>{
   const r=rowMap.get(wallet),n=r?Number(r.n):0;
   return {wallet,observedWebhookRows24h:n,lastNormalizedAt:r?.last_at??null,
     coverage:n>0?'EVENTS_OBSERVED_NOT_EXHAUSTIVE':'NO_OBSERVED_EVENTS_ACTIVITY_UNKNOWN'};
 });
 const expectedCursors=cursors.length===LIVE_COVERAGE_BOUNDS.rpcPilotWallets&&
   new Set(cursors.map(x=>x.wallet)).size===LIVE_COVERAGE_BOUNDS.rpcPilotWallets;
 const pollers=cursors.map(r=>({wallet:r.wallet,status:r.status,
   historicalGapCount:Number(r.gaps),lastPolledAt:r.last_polled_at,
   // A pending window is *not* a gap-free, live-complete stream.
   liveContinuityCertified:false}));
 const lastDelivery=deliveries.map(x=>parseTime(x.last_at)).filter(x=>x!==null).sort((a,b)=>b-a)[0]??null;
 const age=lastDelivery===null?null:Math.max(0,Math.round((now-lastDelivery)/60000));
 const state=control[0]?.state??'UNKNOWN';
 const freshness=age===null?'NO_DELIVERY_TIME_EVIDENCE':
   age>LIVE_COVERAGE_BOUNDS.freshnessMinutes?'STALE_OR_IDLE_NOT_PROOF_OF_OUTAGE':'RECENT_PROVIDER_DELIVERY_OBSERVED';
 const status=unexpectedWalletRows.length||!expectedCursors||state!=='ARMED'?'SCOPE_OR_CONTROL_UNVERIFIED':
  freshness==='RECENT_PROVIDER_DELIVERY_OBSERVED'?'ROSTER_MATCHED_DELIVERY_SEEN_NOT_EXHAUSTIVE':
  'ROSTER_MATCHED_DELIVERY_STALE_OR_UNKNOWN';
 return {status,asOf,walletsExpected:wanted.length,walletsWithObservedEvents24h:wallets.filter(x=>x.observedWebhookRows24h>0).length,
   wallets,walletRowsUnexpected:unexpectedWalletRows,sourceProviderListingCheckedSeparately:true,
   providerDelivery:{lastAt:lastDelivery===null?null:new Date(lastDelivery).toISOString(),ageMinutes:age,freshness},
   persistentWebhookControl:{state},rpcPilot:{expected:LIVE_COVERAGE_BOUNDS.rpcPilotWallets,
    found:cursors.length,pollers},dailyAttemptedReservations:budget.slice(0,2),
   deliveredWebhookCreditEstimates:deliveries.slice(0,2),
   rawArchiveHealth:rawHealth.slice(0,2),
   limitations:['Zero events does not prove a missing webhook subscription or inactive wallet.',
    'Provider subscription configuration must be checked separately through Helius read-only verification.',
    'D1 received events do not prove exhaustive original-chain activity, low latency, valid buys or trades.',
    'Historical restored data cannot be relabeled as live-forward evidence.',
    'GitHub cron is best effort and must not be assumed to run each five-minute slot.']};
}
