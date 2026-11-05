export function checkCronEvidence({cron,start,end,quota,normal,raw,states}){
 if(!Array.isArray(cron)||!Array.isArray(quota)||!Array.isArray(normal)||
   !Array.isArray(raw)||!Array.isArray(states))throw Error('AUDIT_INPUT_INVALID');
 const startMs=Date.parse(start),endMs=Date.parse(end);
 if(!Number.isFinite(startMs)||!Number.isFinite(endMs)||endMs<startMs||
   cron.length>=500)throw Error('AUDIT_WINDOW_TRUNCATED_OR_INVALID');
 const slotMs=5*60*1000;
 const from=Math.ceil(startMs/slotMs)*slotMs,until=Math.floor(endMs/slotMs)*slotMs-slotMs;
 const expected=until>=from?Math.floor((until-from)/slotMs)+1:0;
 const got=new Set();let maxInterval=0,last=null,invalid=0,alignmentOffsets=[];
 let skippedIntervals=0,backwards=0;
 for(const row of cron){
   const at=Date.parse(row.slot_utc);
   if(!Number.isFinite(at)||got.has(at)){invalid++;continue;}
   got.add(at);
   // Cron events can have a consistent nonzero offset; preserve exact
   // scheduled_at timestamps and measure interval differences directly.
   alignmentOffsets.push(Math.round(((at%slotMs)+slotMs)%slotMs/1000));
   if(last!==null){
     const delta=at-last;
     if(delta<=0){backwards++;continue;}
     maxInterval=Math.max(maxInterval,Math.round(delta/60000));
     skippedIntervals+=Math.max(0,Math.round(delta/slotMs)-1);
   }
   last=at;
 }
 const first=got.size?Math.min(...got):null;
 const latest=got.size?Math.max(...got):null;
 const denominator=first===null?0:Math.floor((latest-first)/slotMs)+1;
 const missing=skippedIntervals;
 return {from:new Date(from).toISOString(),through:until>=from?new Date(until).toISOString():null,
    expectedCronSlots:denominator,cronSlotsWithReceipt:got.size,missingCronSlots:missing,
    observationWindowExpectedSlots:expected,
    firstCronSlot:first===null?null:new Date(first).toISOString(),
    lastCronSlot:latest===null?null:new Date(latest).toISOString(),
    extraOrInvalidCronRows:invalid,backwardTimeRows:backwards,
    scheduleOffsetsSeconds:[...new Set(alignmentOffsets)].slice(0,10),
    maxInterReceiptMinutes:maxInterval||null,
    fractionObserved:denominator?Number((got.size/denominator).toFixed(4)):null,
    sampledCronRows:cron.length,statusCounts:cron.reduce((o,x)=>
     (o[x.status]=(o[x.status]||0)+1,o),{}),
    rpcStaleObserved:cron.filter(x=>Number(x.rpc_stale)>0).length,
    rpcPendingObserved:cron.filter(x=>Number(x.rpc_pending)>0).length,
    latestCronReceipt:cron.at(-1)?.observed_at??null,
    providerCreditEstimates:quota,normalizedUniqueWalletRows:normal,
    archivedRawSignatures:raw,pilotWalletStates:states,
    scopeVerified:states.length===3&&denominator>10&&missing>=0&&invalid===0&&backwards===0,
    caveats:[
      'Cloudflare scheduled timestamps and D1 rows show successful cron ingestion only; failures before insert may be absent.',
      'Authenticated provider deliveries count every original payload event, normalized observations are deduplicated wallet/signature rows and are not directly comparable.',
      'Raw archive is optional and capped; not all delivered events must appear in raw or normalized D1.',
      'Normalizing requires an explicitly watched fee payer or listed token transfer participant; rejection counters were not historically persisted.',
      'GitHub RPC cursors are separate from Helius webhook observations; historical replay does not certify them.'
    ]};
}
