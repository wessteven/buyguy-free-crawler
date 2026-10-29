// Manual/PR-only GOGET cohort research; no D1, no deployment, no credentials.
import {mkdir,writeFile} from 'node:fs/promises';
import {REPLAY_RULE,validateOhlcv,replayCohortPool} from '../src/cohort-replay-research.mjs';

export const FROZEN_COHORT=Object.freeze([
 {symbol:'BORLY',mint:'ECFmFaHyJ8krXErN1QAxqUq97xCFUWYv9Ax5j2Aspump',pool:'3pUeKCLPfocGPGYo6MvbfkZSuqTUkQ3EAPZ99aDhSj8r'},
 {symbol:'FORKIUS',mint:'7xTMgacureYyKpaQZwP6LHR1tywEaBjAYfj9zidipump',pool:'8uzUfQhxmTSGCunXB6ndTtZHxexyshEKbgsZjVAXh2tT'},
 {symbol:'PIKA',mint:'7XBdVqzZFYwpBz7VshzWZWd7ms1sG9f9UQ8YiHqapump',pool:'46gTBAw39NQops2miKGoMVhSmDj6yf9Z5Fk9xtpCqfu3'},
 {symbol:'SATOSHI',mint:'SAtoZGJkh4Eid9EQZYXWnCNVn5asZrWZLouBMX1SHi1',pool:'7jTCpYho9RJhCn9ZyrLPjwGWkacGhJVdzL2cZni3UdUh'},
 {symbol:'SUPERCORE',mint:'3ZAnpeVBHAvZsySNMXp4g9nYaE1jsx6khgh29VYKpump',pool:'6aXb1e6uTMsz77zhncRYFe7AugzBxxcUnhCodhd3odag'},
 {symbol:'WISP',mint:'USEu5qroduzuvrSZfvs3xM1MwyU83joapQF5LMyWiSP',pool:'3jB5P1dycatrbHUBZ4xuKEciBiXYUsrsGF83fViM2aCc'},
 {symbol:'XMRS',mint:'8tJtD1aM9KJHjKEC1huQXc8QrMciDee4zYzibxb5fRsU',pool:'9oGSKunPifiCjgnhnt2bjKnMR2udU9EE8hi2AZsnWwUC'}
]);
const FROM=Date.parse('2026-10-19T00:00:00Z')/1000;
const TO=Date.parse('2026-10-21T00:00:00Z')/1000;
const DEST='cohort-replay-artifact';
// Explicit subset for rate-limit-safe manual follow-up: only previously frozen cohort IDs.
const subset=String(process.env.COHORT_SYMBOLS||'').trim().toUpperCase();
const selected=subset?subset.split(',').map(s=>s.trim()).filter(Boolean):FROZEN_COHORT.map(x=>x.symbol);
if(new Set(selected).size!==selected.length||selected.length<1||
   selected.some(symbol=>!FROZEN_COHORT.some(x=>x.symbol===symbol)))
 throw Error('COHORT_SUBSET_INVALID');
const requested=FROZEN_COHORT.filter(x=>selected.includes(x.symbol));
const date=t=>new Date(t*1000).toISOString();
await mkdir(DEST,{recursive:true});
const details=[],raw=[],requestLog=[];
let attempts=0,networkLimited=false;
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function fetchBars(target,timeframe,aggregate,seconds){
 if(networkLimited)return {status:'PROVIDER_RATE_LIMIT',bars:[]};
 if(attempts)await pause(12000); // 5 calls/min at most, provider 429 fails closed
 const u=new URL('https://api.geckoterminal.com/api/v2/networks/solana/pools/'+target.pool+'/ohlcv/'+timeframe);
 for(const [k,v] of Object.entries({aggregate,limit:1000,before_timestamp:TO,currency:'usd',token:target.mint}))
  u.searchParams.set(k,String(v));
 const requestedAt=new Date().toISOString();attempts++;
 let response;
 try{response=await fetch(u,{headers:{Accept:'application/json;version=20230203'},signal:AbortSignal.timeout(12000)})}
 catch(e){
  requestLog.push({symbol:target.symbol,timeframe,requestedAt,status:'NETWORK_UNAVAILABLE'});
  return {status:'NETWORK_UNAVAILABLE',bars:[]};
 }
 if(response.status===429){networkLimited=true}
 if(!response.ok){
  requestLog.push({symbol:target.symbol,timeframe,requestedAt,status:'HTTP_'+response.status});
  return {status:'HTTP_'+response.status,bars:[]};
 }
 try{
  const json=await response.json(),rows=json?.data?.attributes?.ohlcv_list;
  if(!Array.isArray(rows))throw Error('BAD_PROVIDER_DATA');
  const meta=[json?.meta?.base?.address,json?.meta?.quote?.address].filter(Boolean)
    .map(x=>String(x).replace(/^solana_/,''));
  if(meta.length&&!meta.includes(target.mint))throw Error('MINT_NOT_IN_PROVIDER_METADATA');
  raw.push({symbol:target.symbol,mint:target.mint,pool:target.pool,
    requestedAt,response:json,timeframe,aggregate});
  const bars=validateOhlcv(rows,seconds,FROM,TO);
  requestLog.push({symbol:target.symbol,timeframe,requestedAt,status:'OK',
    returnedRows:rows.length,retainedRows:bars.length});
  return {status:bars.length?'OK':'NO_CANDLES_IN_WINDOW',bars,
    returnedRows:rows.length};
 }catch{
  requestLog.push({symbol:target.symbol,timeframe,requestedAt,status:'MALFORMED_DATA'});
  return {status:'MALFORMED_DATA',bars:[]};
 }
}
for(const c of requested){
 const fifteen=await fetchBars(c,'minute',15,900);
 const five=await fetchBars(c,'minute',5,300);
 const valid=fifteen.status==='OK'&&fifteen.bars.length>=22;
 const replay=valid?replayCohortPool(fifteen.bars,five.bars):null;
 details.push({...c,fifteenStatus:fifteen.status,fiveStatus:five.status,
  candleCount15m:fifteen.bars.length,candleCount5m:five.bars.length,
  complete48h15m:fifteen.bars.length===192,
  replayStatus:valid?'EVALUATED':'INCONCLUSIVE_NOT_ENOUGH_HISTORY',
  ...replay});
 console.log('COHORT_CASE',JSON.stringify({symbol:c.symbol,status:fifteen.status,
  candles15m:fifteen.bars.length,alerts:replay?.signalEpisodes?.length??null}));
}
const signals=details.flatMap(d=>(d.signalEpisodes||[]).map(x=>({symbol:d.symbol,mint:d.mint,
 pool:d.pool,...x})));
const outcomes={};
for(const s of signals)outcomes[s.outcome]=(outcomes[s.outcome]||0)+1;
const summary={
 version:1,mode:'OFFLINE_PAST_COHORT_REPLAY',selection:'ALL_SEVEN_IMMUTABLE_2026_10_20_NIGHT_LAB_CYCLE11_POOL_RECORDS',
 sourceCommit:'7e201a7fbc88e6bb104a5aca117a91593318aa4a',
 selectionTimeUtc:'2026-10-20T15:14:35Z',
 sourceFilePattern:'data/night-lab/2026-10-20/2026-10-20T1515Z-cycle11-*-helius-pool.json',
 studyStartUtc:date(FROM),studyEndUtcExclusive:date(TO),
 provider:'GeckoTerminal public OHLCV (15m and 5m)',rule:REPLAY_RULE,
 recordedAt:new Date().toISOString(),requestedSymbols:requested.map(x=>x.symbol),
 frozenCohortSize:FROZEN_COHORT.length,requestsAttempted:attempts,
 networkLimited,analysedCases:details.filter(x=>x.replayStatus==='EVALUATED').length,
 inconclusiveCases:details.filter(x=>x.replayStatus!=='EVALUATED').map(x=>x.symbol),
 signalCount:signals.length,outcomes,
 criticalCaveats:[
  'Source candidates were logged before this MIHAO replay but were not an unbiased universe of all launches.',
  'Pre-existing Night Lab case selection may exclude failed pools, so this cannot estimate a universe-wide false-positive rate.',
  'Only completed candles used for signal; next bar open is not an executable fill.',
  'No GOGET production D1 first-seen times, historical provider lag, verified unique buyers, fees or slippage.',
  'If OHLCV data is absent, do not classify a token as a non-runner or a detector miss.',
  '5m barrier ordering may remain ambiguous inside a candle.'
 ]};
await Promise.all([
 writeFile(DEST+'/summary.json',JSON.stringify(summary,null,2)+'\n'),
 writeFile(DEST+'/cases.json',JSON.stringify(details,null,2)+'\n'),
 writeFile(DEST+'/provider_raw.json',JSON.stringify(raw)+'\n'),
 writeFile(DEST+'/requests.json',JSON.stringify(requestLog,null,2)+'\n')
]);
const cols=['symbol','mint','pool','availableAt','signalClose','thirtyMinGainPct',
 'volumeRatio','entryProxy','full3h15m','full3h5m','maxHighPct','minLowPct',
 'barrierResolution','firstBarrier','barrierAt','outcome'];
const esc=s=>'"'+String(s??'').replaceAll('"','""')+'"';
await writeFile(DEST+'/signal_episodes.csv',[cols.join(','),
 ...signals.map(x=>cols.map(k=>esc(k.endsWith('At')&&typeof x[k]==='number'?
 date(x[k]):x[k])).join(','))].join('\n')+'\n');
console.log('COHORT_SUMMARY',JSON.stringify({
 attempted:attempts,analysed:summary.analysedCases,
 inconclusive:summary.inconclusiveCases,signals:signals.length,outcomes
}));
