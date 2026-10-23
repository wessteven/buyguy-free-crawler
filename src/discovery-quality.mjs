// Fixed-budget, read-only quality sample; provider name is NOT ingest-path provenance.
export const DISCOVERY_OBSERVATION_LIMIT=120,DISCOVERY_RUN_LIMIT=45,DISCOVERY_DISPLAY_LIMIT=40;
const numeric=x=>x===null||x===undefined||x===''?null:Number.isFinite(Number(x))?Number(x):null;
function signature(raw){
 let values;try{values=JSON.parse(raw||'[]')}catch{return null}
 if(!Array.isArray(values))return null;
 const s=values.filter(x=>typeof x==='string').join('|');
 const light=/GeckoTerminal cooldown |DEX Screener cooldown |DISCOVERY_PROVIDERS_COOLDOWN|DEX Screener (?:profiles|quotes) HTTP 429/.test(s);
 const broad=/GeckoTerminal new pools:|\/token-(?:boosts|profiles)\/|\/community-takeovers\//.test(s);
 return light!==broad?(light?'lightweight':'broader'):null;
}
export async function discoveryQuality(db,{now=Date.now()}={}){
 // Both ORDER BY clauses use integer PKs. Assets join uses asset_key primary key.
 const obs=(await db.prepare("SELECT o.id,o.asset_key,o.pool,o.provider,o.seen_at,o.score,o.liquidity,o.buys_m5,o.sells_m5,a.first_seen,a.pool_created FROM observations o LEFT JOIN assets a ON a.asset_key=o.asset_key ORDER BY o.id DESC LIMIT 120").all()).results||[];
 const runs=(await db.prepare("SELECT id,started_at,state,observed,provider_errors FROM runs ORDER BY id DESC LIMIT 45").all()).results||[];
 const byTime=new Map();for(const r of runs){if(!byTime.has(r.started_at))byTime.set(r.started_at,[]);byTime.get(r.started_at).push(r)}
 const counts={lightweight:0,broader:0,unknown:0,uniqueMints:0,uniqueAssets:0,repeats:0,
  repeatSamePool:0,multiPoolAssets:0,highScoreLiquid:0,zeroBuyRows:0,verifiedBuyerRows:0};
 const seen=new Set(),seenPairs=new Set(),allPools=new Map(),mints=new Set();
 const rows=obs.map(o=>{
  const key=typeof o.asset_key==='string'?o.asset_key:'';
  const pool=typeof o.pool==='string'&&o.pool.trim()?o.pool:null;
  const first=!seen.has(key);if(!first)counts.repeats++;seen.add(key);
  if(key.startsWith('solana:')&&key.length>7)mints.add(key);
  const pair=JSON.stringify([key,pool]),samePool=seenPairs.has(pair);
  if(samePool)counts.repeatSamePool++;seenPairs.add(pair);
  if(!allPools.has(key))allPools.set(key,new Set());
  if(pool)allPools.get(key).add(pool);
  if(numeric(o.score)>=60&&numeric(o.liquidity)>=50000)counts.highScoreLiquid++;
  if(numeric(o.buys_m5)===0)counts.zeroBuyRows++;
  const matched=byTime.get(o.seen_at)||[];
  const run=matched.length===1?matched[0]:null;
  const path=run&&['SUCCESS','PARTIAL'].includes(run.state)&&numeric(run.observed)>0?
   signature(run.provider_errors)||'unknown':'unknown';
  counts[path]++;
  const when=Date.parse(o.seen_at||'');
  return {assetKey:key,pool,provider:o.provider||null,seenAt:o.seen_at||null,
   score:numeric(o.score),liquidity:numeric(o.liquidity),
   buysM5:numeric(o.buys_m5),sellsM5:numeric(o.sells_m5),
   firstSeen:o.first_seen||null,poolCreated:o.pool_created||null,
   uniqueInSample:first,repeatedSamePoolInSample:samePool,
   poolIdentity:pool?'recorded_unverified':'unknown',
   path,pathConfidence:path==='unknown'?'unverified':'inferred_run_marker_not_confirmed',
   observationAgeMinutes:Number.isFinite(when)&&when<=now?Math.round((now-when)/60000):null,
   quoteFreshness:'unverified',buyerEvidence:'transaction_counts_only',
   verifiedIndependentBuyers:null};
 });
 counts.uniqueMints=mints.size;counts.uniqueAssets=seen.size;
 counts.multiPoolAssets=[...allPools.values()].filter(p=>p.size>1).length;
 return {sampleSize:rows.length,sampledObservationLimit:DISCOVERY_OBSERVATION_LIMIT,
  sampledRunLimit:DISCOVERY_RUN_LIMIT,displayLimit:DISCOVERY_DISPLAY_LIMIT,counts,
  rows:rows.slice(0,DISCOVERY_DISPLAY_LIMIT),limitations:[
   'Attribution requires a uniquely matched run with a writer-specific error marker; even then inference is not row-level proof. Other paths remain UNKNOWN.',
   'Latest 120 observation rows and 45 runs only; uniqueness and repeated pools are sample statistics, not lifetime totals.',
   'Pool addresses are stored identifiers, not independently chain-certified pools.',
   'Observation age is recording age; provider quote freshness is unverified.',
   '5m buys/sells are transactions, not distinct verified wallets. Independent buyer evidence is unavailable.',
   'Cooldown misses cannot be identified without independent historical observations.'
  ]};
}
