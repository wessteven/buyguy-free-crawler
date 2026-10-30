export const NIGHT_START='2026-10-30T14:20:00.000Z';
export const NIGHT_END='2026-10-30T18:00:00.000Z';
export function quantile(data,p){
 const v=data.filter(n=>typeof n==='number'&&Number.isFinite(n)&&n>=0).sort((a,b)=>a-b);
 if(!v.length||p<0||p>1)return null;
 const pos=(v.length-1)*p,i=Math.floor(pos),j=Math.ceil(pos);
 return Math.round(v[i]*(1-(pos-i))+v[j]*(pos-i));
}
export function summarizeNight({webhooks=[],polls=[],cursors=[],budget=[],now,from=NIGHT_START,to=NIGHT_END,webhookCount,pollCount}){
 const start=Date.parse(from),end=Math.min(Date.parse(now),Date.parse(to));
 if(!Number.isFinite(start)||!Number.isFinite(end))throw Error('INVALID_TIME');
 const select=rows=>rows.filter(r=>Number.isFinite(Date.parse(r.observed_at))&&Date.parse(r.observed_at)>=start&&Date.parse(r.observed_at)<=end);
 const w=select(webhooks),p=select(polls),id=r=>r.wallet+':'+r.signature;
 const keys=new Set(w.map(id)),polled=new Set(p.map(id));
 const overlap=[...polled].filter(k=>keys.has(k)).length;
 const distribution=arr=>arr.reduce((acc,r)=>(acc[r.classification]=(acc[r.classification]||0)+1,acc),{});
 const times=w.map(r=>Date.parse(r.observed_at)).filter(Number.isFinite);
 const delay=w.map(r=>r.delay_ms).filter(x=>typeof x==='number'&&Number.isFinite(x)&&x>=0&&x<=120000);
 return {
   scope:{from,to:new Date(end).toISOString(),asOf:now,final:Date.parse(now)>=Date.parse(to)},
   webhook:{rows:Number.isSafeInteger(webhookCount)?webhookCount:null,sampled:w.length,
    sampleLimited:Number.isSafeInteger(webhookCount)&&webhookCount>w.length,
    uniqueWallets:new Set(w.map(r=>r.wallet)).size,firstAt:times.length?new Date(Math.min(...times)).toISOString():null,
    lastAt:times.length?new Date(Math.max(...times)).toISOString():null,
    classifications:distribution(w),delayObservations:delay.length,
    roughP50Ms:delay.length>=10?quantile(delay,0.5):null,
    roughP95Ms:delay.length>=20?quantile(delay,0.95):null,
    latencyCaveat:'Seconds-resolution chain block timestamps; not an independent subsecond SLA.'},
   polling:{rows:Number.isSafeInteger(pollCount)?pollCount:null,sampled:p.length,
    uniqueWallets:new Set(p.map(r=>r.wallet)).size,classifications:distribution(p),
    baseline:p.filter(r=>r.baseline===1).length,
    cursors:cursors.map(c=>({wallet:c.wallet,status:c.status,gaps:c.gaps,lastPolledAt:c.last_polled_at}))},
   comparison:{sampleMatchedSignatures:overlap,sampleUnmatchedPolling:polled.size-overlap,
    matchedPctOfPollingSample:polled.size?Math.round(1000*overlap/polled.size)/10:null,
    caveat:'NOT a comprehensive webhook miss rate: polling is bounded and event types differ.'},
   budget:budget.map(x=>({day:x.day,attemptedReservations:x.reserved})),
   efficacy:{verifiedBuys:0,verifiedCopyProfitsUsd:null,realTrades:0,
    note:'Webhook records are unverified, cannot certify entry/exits or profitable signals.'}
 };
}
