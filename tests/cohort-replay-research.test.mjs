import test from 'node:test';
import assert from 'node:assert/strict';
import {REPLAY_RULE,validateOhlcv,replayCohortPool} from '../src/cohort-replay-research.mjs';
const start=Date.parse('2026-10-20T00:00:00Z')/1000;
function fakeBars(){
 const b=Array.from({length:49},(_,i)=>({t:start+i*900,o:1,h:1.01,l:0.99,c:1,v:10}));
 b[30]={...b[30],o:1,h:1.08,l:1,c:1.07,v:20};
 b[31]={...b[31],o:1.07,h:1.16,l:1.07,c:1.15,v:20};
 b[32]={...b[32],o:1.16,h:1.45,l:1.15,c:1.25,v:30};
 return b;
}
test('frozen MIHAO research rule values unchanged',()=>{
 assert.equal(REPLAY_RULE.minimumThirtyMinuteGainPct,12);
 assert.equal(REPLAY_RULE.minimumVolumeRatio,1.5);
 assert.equal(REPLAY_RULE.cooldownSeconds,5400);
 assert.equal(REPLAY_RULE.forwardSeconds,10800);
});
test('recorded test signal never relies on future bars to qualify',()=>{
 const bars=fakeBars(),r=replayCohortPool(bars);
 assert.equal(r.signalEpisodes.length,1);
 assert.equal(r.signalEpisodes[0].availableAt,bars[31].t+900);
 assert.equal(r.signalEpisodes[0].entryProxy,1.16);
 assert.equal(r.signalEpisodes[0].outcome,'TARGET_FIRST');
 const damaged=structuredClone(bars);
 damaged[32].h=1.17;damaged[32].c=1;damaged[32].v=0;
 const newer=replayCohortPool(damaged);
 assert.equal(newer.signalEpisodes[0].availableAt,r.signalEpisodes[0].availableAt);
 assert.equal(newer.signalEpisodes[0].thirtyMinGainPct,r.signalEpisodes[0].thirtyMinGainPct);
});
test('5m barrier ambiguity is explicit, not an invented winner',()=>{
 const bars=fakeBars();
 const five=Array.from({length:36},(_,i)=>({t:bars[32].t+i*300,o:1.16,
  h:i===0?1.5:1.2,l:i===0?0.95:1.1,c:1.16,v:1}));
 const r=replayCohortPool(bars,five);
 assert.equal(r.signalEpisodes[0].barrierResolution,'5m');
 assert.equal(r.signalEpisodes[0].outcome,'BOTH_WITHIN_BAR');
});
test('gaps invalidate signal windows instead of being filled',()=>{
 const bars=fakeBars();bars[25].t+=1;
 const r=replayCohortPool(bars);
 assert.equal(r.signalEpisodes.length,0);
});
test('OHLCV rejects impossible candle and conflicting duplicate',()=>{
 const t=start;
 assert.throws(()=>validateOhlcv([[t,1,0.9,0.7,1,4]],900,t,t+900));
 assert.throws(()=>validateOhlcv([[t,1,1.1,0.9,1,4],[t,1,1.2,0.9,1,4]],900,t,t+900));
 const x=validateOhlcv([[t,1,1.1,0.9,1,4],[t+900,1,1.1,0.9,1,4]],900,t,t+900);
 assert.equal(x.length,1);
});
test('if the next bar is missing do not infer a fill',()=>{
 const bars=fakeBars().filter((_,i)=>i!==32);
 const r=replayCohortPool(bars);
 assert.equal(r.signalEpisodes.length,1);
 assert.equal(r.signalEpisodes[0].outcome,'NO_CONTIGUOUS_ENTRY');
 assert.equal(r.signalEpisodes[0].buyQualified,false);
});
