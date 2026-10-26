// Read-only, bounded GOGET research feed for paired Pocket Radar devices.
// It never starts scanners, audits, transactions, or changes D1.
import {tokenTier} from './token-tiers.mjs';
import {assessGreenLight} from './green-gate.mjs';
import {ourScoreAssessment} from './our-score-core.mjs';
import {CLEAN_SLATE_AT} from './clean-slate.mjs';
export const POCKET_ASSET_LIMIT=80,POCKET_EVENT_LIMIT=360;
const EVENT_KINDS=['MINT_AUTHORITY_REVIEW','ROUNDTRIP_QUOTE','BENEFICIAL_OWNER_AUDIT',
  'POOL_CUSTODY_AUDIT','OWNER_CLUSTER_PROBE','POOL_IDENTITY_PROBE',
  'PROGRAM_UPGRADE_PROBE','PUMP_MIGRATION_PROBE','PUMP_MIGRATION_TX_PROBE'];
const mintOK=s=>typeof s==='string'&&/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s);
const positive=v=>v!==null&&v!==undefined&&Number.isFinite(Number(v))&&Number(v)>0;
function notes(row){try{return JSON.parse(row.risk_note||'{}')||{}}catch{return {}}}
function safety(row,route,green,now){
 const risk=row.risk_status||'UNVERIFIED';
 if(risk==='UNVERIFIED')return null;
 const audit=notes(row);
 const mint=['MINT_CONTROLS_REVOKED','PARTIAL_ONCHAIN_REVIEW','HOLDER_DATA_UNAVAILABLE',
  'TOKEN_2022_METADATA_ONLY','HOLDER_CONCENTRATION_RISK','FULL_REVIEW_PASSED'].includes(risk)?35:0;
 const holders=audit.holderStatus==='TOKEN_ACCOUNT_BALANCES_SCREENED'?20:0;
 const liq=Number(row.liquidity),liquidity=liq>=50000?15:liq>=25000?8:0;
 const matched=route&&route.asset_key===row.asset_key&&Date.parse(route.at)>=now-3600000;
 let label=null;try{label=JSON.parse(route?.note||'{}').label}catch{}
 const routeCredit=matched&&label==='BOTH_DIRECTIONS_QUOTED'?15:0;
 const last=Date.parse(row.last_seen||''),delta=now-last;
 const fresh=Number.isFinite(delta)&&delta>=0&&delta<=1200000?15:
   Number.isFinite(delta)&&delta>=0&&delta<=7200000?7:0;
 let score=mint+holders+liquidity+routeCredit+fresh;
 const flags=Array.isArray(audit.mintFlags)?audit.mintFlags:[];
 if(green.status==='RISK'||['MINT_CONTROL_RISK','HOLDER_CONCENTRATION_RISK'].includes(risk)||
   flags.includes('MINT_AUTHORITY_ACTIVE')||flags.includes('FREEZE_AUTHORITY_ACTIVE'))
  score=Math.min(score,25);
 return score;
}
function qualifies(row,now){
 if(row.chain!=='solana'||!mintOK(row.address)||row.asset_key!=='solana:'+row.address ||
    !['ALIVE','STATIC'].includes(row.status)||!mintOK(row.pool))return false;
 const tier=tokenTier(row,now);
 if(tier.ageMinutes===null||tier.ageMinutes<0||tier.ageMinutes>30)return false;
 const buys=Number(row.buys_m5)||0,sells=Number(row.sells_m5)||0;
 return positive(row.price)&&positive(row.market_cap)&&Number(row.liquidity)>=15000&&
   buys>=0&&sells>=0&&buys+sells>=5&&
   !['MINT_CONTROL_RISK','HOLDER_CONCENTRATION_RISK'].includes(row.risk_status);
}
export function rankPocketCandidates(assets,events,{now=Date.now()}={}){
 const latest=new Map();
 for(const event of events||[]){
  const key=String(event.asset_key||'')+'|'+String(event.kind||'');
  if(!latest.has(key))latest.set(key,event);
 }
 const eligible=[];
 for(const row of assets||[]){
  if(!qualifies(row,now))continue;
  const find=kind=>latest.get(row.asset_key+'|'+kind)||null;
  const green=assessGreenLight(row,{mintEvent:find('MINT_AUTHORITY_REVIEW'),
   routeEvent:find('ROUNDTRIP_QUOTE'),ownerEvent:find('BENEFICIAL_OWNER_AUDIT'),
   poolEvent:find('POOL_CUSTODY_AUDIT'),ownerProbeEvent:find('OWNER_CLUSTER_PROBE'),
   poolProbeEvent:find('POOL_IDENTITY_PROBE'),programUpgradeEvent:find('PROGRAM_UPGRADE_PROBE'),
   migrationEvent:find('PUMP_MIGRATION_PROBE'),migrationTxEvent:find('PUMP_MIGRATION_TX_PROBE'),now});
  if(green.status==='RISK')continue;
  const age=tokenTier(row,now).ageMinutes,ss=safety(row,find('ROUNDTRIP_QUOTE'),green,now);
  const audit=notes(row);
  const topBps=typeof audit.top1Bps==='number'&&Number.isFinite(audit.top1Bps)?audit.top1Bps:null;
  const assessed=ourScoreAssessment({...row,quote_age:age,
   liq_cap_pct:Number(row.liquidity)/Number(row.market_cap)*100,
   buys_m5:Number(row.buys_m5)||0,sells_m5:Number(row.sells_m5)||0,
   safety:ss,topBps,green});
  if(assessed.score===null||assessed.score<35)continue;
  const poolTime=Date.parse(row.pool_created||'');
  const poolAgeMinutes=Number.isFinite(poolTime)&&poolTime>0&&poolTime<=now?
   Math.floor((now-poolTime)/60000):null;
  const tier=tokenTier(row,now).tier;
  eligible.push({
   rank:0,chain:'solana',assetKey:row.asset_key,mint:row.address,pool:row.pool,
   symbol:String(row.symbol||'Unknown').slice(0,24),
   priceUsd:Number(row.price),marketCapUsd:Number(row.market_cap),
   liquidityUsd:Number(row.liquidity),changeH1:Number.isFinite(Number(row.change_h1))?
    Number(row.change_h1):null,buys5:Number(row.buys_m5)||0,sells5:Number(row.sells_m5)||0,
   ourScore:assessed.score,tier,quoteObservedAt:row.last_seen,
   quoteAgeMinutes:age,poolAgeMinutes,safetyEvidenceScore:ss,
   greenStatus:green.status,greenPassed:green.passed,
   lpLockVerified:green.checks.some(c=>c.name==='Pool custody / LP lock'&&c.passed===true),
   verifiedUniqueBuyers:null,buyerEvidence:'reported_transactions_only',
   poolIdentity:'stored_not_independently_verified',
   chartUrl:'https://www.geckoterminal.com/solana/pools/'+row.pool
  });
 }
 eligible.sort((a,b)=>b.ourScore-a.ourScore||b.liquidityUsd-a.liquidityUsd||
  a.assetKey.localeCompare(b.assetKey));
 return eligible.slice(0,5).map((coin,i)=>({...coin,rank:i+1}));
}
export async function pocketFeed(db,{now=Date.now()}={}){
 // Fixed bounded active-asset sample; unlike the full dashboard this is NOT an
 // exhaustive rank across the ledger. Source D1 must stay under free tier budget.
 const cutoff=new Date(Math.max(Date.parse(CLEAN_SLATE_AT),now-30*60000)).toISOString();
 const assets=(await db.prepare(
  "SELECT asset_key,chain,address,symbol,pool,pool_created,status,risk_status,risk_note,"+
  "last_seen,price,market_cap,liquidity,buys_m5,sells_m5,change_h1,score "+
  "FROM assets WHERE chain='solana' AND status IN ('ALIVE','STATIC') "+
  "AND last_seen >= ? AND price>0 AND market_cap>0 AND liquidity>=15000 "+
  "ORDER BY last_seen DESC LIMIT 80").bind(cutoff).all()).results||[];
 let events=[];
 if(assets.length){
  const placeholders=assets.map(()=>'?').join(',');
  // Event index starts at (asset_key,kind,id DESC); fetched events are
  // strictly capped. Missing audits remain unknown, never guessed as passed.
  const sql="SELECT id,at,asset_key,kind,note FROM research_events WHERE asset_key IN ("+
   placeholders+") AND kind IN ("+EVENT_KINDS.map(()=>'?').join(',')+
   ") AND at >= ? ORDER BY id DESC LIMIT 360";
  events=(await db.prepare(sql).bind(...assets.map(a=>a.asset_key),...EVENT_KINDS,
   new Date(now-24*60*60*1000).toISOString()).all()).results||[];
 }
 return {schema:'goget-pocket-v1',source:'GOGET_D1_RESEARCH',generatedAt:new Date(now).toISOString(),
  sample:{assets:assets.length,assetLimit:POCKET_ASSET_LIMIT,events:events.length,
   eventLimit:POCKET_EVENT_LIMIT,scope:'recent_active_solana_only'},
  limitations:['Bounded sample, not guaranteed to equal dashboard global top five.',
   'Observation time is not independently verified provider quote time.',
   'Buy/sell counts are transactions, NOT verified independent buyer wallets.',
   'Pool identity is recorded, NOT independently chain certified by this feed.',
   'OUR SCORE measures research factors; it is NOT a return forecast or buy instruction.'],
  coins:rankPocketCandidates(assets,events,{now})};
}
