// GOGET immutable-cohort offline research. No production, D1, keys or trading.
export const REPLAY_RULE=Object.freeze({
  periodSeconds:900,minimumThirtyMinuteGainPct:12,minimumVolumeRatio:1.5,
  emaFast:9,emaSlow:21,volumePreviousBars:8,
  cooldownSeconds:5400,forwardSeconds:10800,targetPct:20,stopPct:15
});
const number=n=>typeof n==='number'&&Number.isFinite(n);
const pct=(a,b)=>(a/b-1)*100;
export function validateOhlcv(rows,periodSeconds,from,to){
 if(!Array.isArray(rows))throw Error('OHLCV_ROWS_REQUIRED');
 const found=new Map();
 for(const x of rows){
  if(!Array.isArray(x)||x.length!==6||!Number.isInteger(x[0])||
    x.slice(1).some(n=>!number(n))||Math.min(x[1],x[2],x[3],x[4])<=0||
    x[2]<Math.max(x[1],x[4])||x[3]>Math.min(x[1],x[4])||x[5]<0)
    throw Error('INVALID_OHLCV_BAR');
  if(x[0]>=from&&x[0]+periodSeconds<=to){
   if(found.has(x[0])&&JSON.stringify(found.get(x[0]))!==JSON.stringify(x))
    throw Error('CONFLICTING_BAR');
   found.set(x[0],x);
  }
 }
 return [...found.values()].sort((a,b)=>a[0]-b[0])
  .map(([t,o,h,l,c,v])=>({t,o,h,l,c,v}));
}
function ema(bars,n){
 const result=Array(bars.length).fill(null),alpha=2/(n+1);
 for(let i=n-1;i<bars.length;i++){
  if(i===n-1)result[i]=bars.slice(0,n).reduce((s,x)=>s+x.c,0)/n;
  else result[i]=alpha*bars[i].c+(1-alpha)*result[i-1];
 }
 return result;
}
export function replayCohortPool(bars,fiveMinuteBars=[],rule=REPLAY_RULE){
 const signals=[],raw=[],candidates=[];
 const fast=ema(bars,rule.emaFast),slow=ema(bars,rule.emaSlow);
 for(let i=rule.emaSlow;i<bars.length;i++){
  const b=bars[i],prev=bars[i-1],prior=bars[i-2];
  const continuous=bars.slice(i-9,i+1).every((x,j,a)=>j===0||x.t-a[j-1].t===900);
  if(!continuous)continue;
  const gain=pct(b.c,prior.c);
  const recent=(prev.v+b.v)/2;
  const preceding=bars.slice(i-9,i-1);
  const baseline=preceding.reduce((n,x)=>n+x.v,0)/preceding.length;
  const ratio=baseline>0?recent/baseline:null;
  const trend=b.c>prev.c&&prev.c>prior.c&&b.c>fast[i]&&fast[i]>slow[i];
  const isSignal=trend&&gain>=rule.minimumThirtyMinuteGainPct&&
    ratio!==null&&ratio>=rule.minimumVolumeRatio;
  if(isSignal)raw.push({i,availableAt:b.t+900,signalClose:b.c,gainPct:gain,volumeRatio:ratio});
 }
 for(const a of raw){
  if(signals.length&&a.availableAt-signals.at(-1).availableAt<rule.cooldownSeconds)continue;
  const entryAt=a.availableAt,opening=bars[a.i+1];
  const entry=opening?.t===entryAt?opening.o:null;
  const future=bars.slice(a.i+1).filter(b=>b.t>=entryAt&&b.t<entryAt+rule.forwardSeconds);
  const full= future.length===rule.forwardSeconds/900&&future.every((b,i)=>
    b.t===entryAt+i*900);
  const five=fiveMinuteBars.filter(b=>b.t>=entryAt&&b.t<entryAt+rule.forwardSeconds);
  const fiveFull=five.length===rule.forwardSeconds/300&&
    five.every((b,i)=>b.t===entryAt+i*300);
  const candleSet=fiveFull?five:future;
  const row={availableAt:entryAt,signalClose:a.signalClose,
    thirtyMinGainPct:a.gainPct,volumeRatio:a.volumeRatio,
    entryProxy:entry,forwardBars15m:future.length,full3h15m:full,
    full3h5m:fiveFull,barrierResolution:fiveFull?'5m':'15m',
    maxHighPct:null,minLowPct:null,firstBarrier:null,barrierAt:null,
    outcome:'CENSORED_MISSING_FUTURE_BARS',buyQualified:false};
  if(entry!==null&&candleSet.length){
   row.maxHighPct=pct(Math.max(...candleSet.map(x=>x.h)),entry);
   row.minLowPct=pct(Math.min(...candleSet.map(x=>x.l)),entry);
   for(const b of candleSet){
    const target=b.h>=entry*(1+rule.targetPct/100);
    const stop=b.l<=entry*(1-rule.stopPct/100);
    if(target||stop){
     row.firstBarrier=target&&stop?'BOTH_WITHIN_BAR':target?'TARGET_FIRST':'STOP_FIRST';
     row.barrierAt=b.t;
     row.outcome=row.firstBarrier;
     break;
    }
   }
   if(!row.firstBarrier&&full)row.outcome='NEITHER_IN_3H';
  }else row.outcome='NO_CONTIGUOUS_ENTRY';
  signals.push(row);
 }
 return {bars15m:bars.length,bars5m:fiveMinuteBars.length,
  eligibleRawSignals:raw.length,signalEpisodes:signals,
  eligibleBars:bars.length>=21?bars.slice(21).filter((b,i)=>
    bars.slice(i+12,i+22).length===10&&
    bars.slice(i+12,i+22).every((x,j,a)=>j===0||x.t-a[j-1].t===900)).length:0,
  caveat:'Selection is frozen from existing Night Lab cohort. 5m/15m OHLCV cannot prove swap execution, independent buyers, or GOGET historical discovery.'};
}
