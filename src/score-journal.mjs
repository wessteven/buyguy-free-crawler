// Decision-time OUR SCORE snapshot experiment. Quotes only; no trades or P&L.
// v1 weights are immutable and the recorded price is a quote, not an executable fill.
import {scoreForJournal} from './our-score-core.mjs';
import {tokenTier} from './token-tiers.mjs';

export const JOURNAL_HORIZONS=[15,60,360,1440];
const sol=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const evm=/^0x[0-9a-fA-F]{40}$/;
const num=v=>v===null||v===undefined?null:(Number.isFinite(Number(v))?Number(v):null);
const stamp=ms=>new Date(ms).toISOString();

export function rankableJournalUniverse(rows,routes=[],now=Date.now()){
 const latestRoute=new Map();
 for(const r of routes)if(r&&typeof r.asset_key==='string'&&!latestRoute.has(r.asset_key))
  latestRoute.set(r.asset_key,r);
 return (Array.isArray(rows)?rows:[]).filter(row=>{
  if(!['ALIVE','STATIC'].includes(row?.status))return false;
  const address=String(row.address||'');
  if(row.chain==='solana'?!sol.test(address):row.chain==='robinhood'?!evm.test(address):true)return false;
  if(row.asset_key!==row.chain+':'+(row.chain==='robinhood'?address.toLowerCase():address))return false;
  if(!row.pool||!(num(row.price)>0)||!(num(row.market_cap)>0)||
    !(num(row.liquidity)>=15000))return false;
  const seen=Date.parse(row.last_seen||'');
  if(!Number.isFinite(seen)||now-seen<0||now-seen>1800000)return false;
  if((num(row.buys_m5)||0)+(num(row.sells_m5)||0)<5)return false;
  if(['MINT_CONTROL_RISK','HOLDER_CONCENTRATION_RISK'].includes(row.risk_status))return false;
  return true;
 }).map(row=>{
  const tier=tokenTier(row,now).tier;
  const assessment=scoreForJournal(row,latestRoute.get(row.asset_key),now);
  return {row,tier,assessment};
 }).filter(x=>x.assessment.score!==null&&x.assessment.score>=35)
   .sort((a,b)=>b.assessment.score-a.assessment.score||
    (num(b.row.liquidity)||0)-(num(a.row.liquidity)||0)||
    a.row.asset_key.localeCompare(b.row.asset_key));
}

export function chooseJournalCandidates(rows,routes=[],now=Date.now()){
 return rankableJournalUniverse(rows,routes,now).slice(0,5);
}
// Rotating, deterministic comparison group from the same eligible population;
// never cherry-picked using subsequent returns or marked as buy candidates.
function comparisonHash(input){
 let hash=2166136261;
 for(const ch of input){hash^=ch.charCodeAt(0);hash=Math.imul(hash,16777619);}
 return hash>>>0;
}
export function chooseJournalComparators(rows,routes=[],now=Date.now()){
 const eligible=rankableJournalUniverse(rows,routes,now).slice(5),hour=Math.floor(now/3600000);
 return eligible.sort((a,b)=>comparisonHash(a.row.asset_key+':'+hour)-
   comparisonHash(b.row.asset_key+':'+hour)||a.row.asset_key.localeCompare(b.row.asset_key)).slice(0,3);
}

export async function runScoreJournal(env,{now=Date.now(),maxOutcomes=12}={}){
 if(!env?.DB)throw Error('Missing score journal database');
 const db=env.DB,nowText=stamp(now);
 // A missing schema while D1 read quota is exhausted is a safe, reversible
 // pause; it must not break the scanner or silently fabricate outcomes.
 let due,last;
 try{
  due=(await db.prepare(`SELECT h.snapshot_id,h.horizon_min,h.due_at,s.asset_key,s.pool,s.entry_price
   FROM score_outcomes h JOIN score_snapshots s ON s.id=h.snapshot_id
   WHERE h.status='PENDING' AND h.due_at<=?
   ORDER BY h.due_at,h.snapshot_id LIMIT ?`)
   .bind(nowText,Math.min(20,Math.max(1,maxOutcomes))).all()).results||[];
  last=await db.prepare('SELECT captured_at FROM score_snapshots ORDER BY captured_at DESC LIMIT 1').first();
 }catch(e){
  if(/no such table/i.test(String(e)))return {state:'SCHEMA_PENDING',saved:0,settled:0,missing:0};
  throw e;
 }
 let settled=0,missing=0;
 for(const d of due){
  const dueMs=Date.parse(d.due_at),cutoff=stamp(dueMs+30*60000);
  const quote=await db.prepare(`SELECT seen_at,price,pool FROM observations
    WHERE asset_key=? AND seen_at>=? AND seen_at<=?
    ORDER BY seen_at ASC,id ASC LIMIT 1`).bind(d.asset_key,d.due_at,cutoff).first();
  if(quote&&num(quote.price)>0){
   const validPool=quote.pool===d.pool;
   const change=validPool?(quote.price/d.entry_price-1)*100:null;
   await db.prepare(`UPDATE score_outcomes
    SET status=?,observed_at=?,observed_price=?,return_pct=?
    WHERE snapshot_id=? AND horizon_min=? AND status='PENDING'`)
    .bind(validPool?'EVALUATED':'POOL_CHANGED',quote.seen_at,
      validPool?quote.price:null,validPool?Math.round(change*10000)/10000:null,
      d.snapshot_id,d.horizon_min).run();
   settled++;
  }else if(now>dueMs+45*60000){
   await db.prepare(`UPDATE score_outcomes SET status='MISSED_DATA'
      WHERE snapshot_id=? AND horizon_min=? AND status='PENDING'`)
    .bind(d.snapshot_id,d.horizon_min).run();
   missing++;
  }
 }
 const latest=Date.parse(last?.captured_at||'');
 // At most five leaders plus three comparison snapshots each clock hour; no D1 asset scans on other runs.
 if(Number.isFinite(latest)&&Math.floor(latest/3600000)===Math.floor(now/3600000))
  return {state:'WAITING_NEXT_HOUR',saved:0,settled,missing};
 const all=(await db.prepare(`SELECT asset_key,chain,address,symbol,pool,status,risk_status,risk_note,
    first_seen,last_seen,price,liquidity,market_cap,buys_m5,sells_m5,change_h1,score
    FROM assets WHERE status IN ('ALIVE','STATIC') AND last_seen>=?
    ORDER BY score DESC LIMIT 120`).bind(stamp(now-30*60000)).all()).results||[];
 // Read a bounded set of route evidence only once per hourly snapshot batch.
 const routes=(await db.prepare(`SELECT at,asset_key,note FROM research_events
     WHERE kind='ROUNDTRIP_QUOTE' ORDER BY id DESC LIMIT 100`).all()).results||[];
 const leaders=chooseJournalCandidates(all,routes,now),controls=chooseJournalComparators(all,routes,now);
 const picks=[...leaders.map(x=>({...x,cohort:'TOP5'})),
  ...controls.map(x=>({...x,cohort:'COMPARATOR'}))];
 let saved=0;
 for(const x of picks){
  const a=x.row;
  const record=await db.prepare(`INSERT OR IGNORE INTO score_snapshots
    (asset_key,chain,address,symbol,cohort,pool,captured_at,version,entry_price,
    our_score,market_score,safety_score,liquidity,market_cap,buys_m5,sells_m5,quote_seen_at)
    VALUES (?,?,?,?,?,?,?,1,?,?,?,?,?,?,?,?,?)`).bind(
    a.asset_key,a.chain,a.address,a.symbol||null,x.cohort,a.pool,nowText,a.price,
    x.assessment.score,a.score,x.assessment.safety,a.liquidity,a.market_cap,
    a.buys_m5,a.sells_m5,a.last_seen).run();
  if((record.meta?.changes||0)!==1)continue;
  const id=record.meta.last_row_id;
  if(!Number.isInteger(id)||id<=0)throw Error('Score journal inserted without snapshot ID');
  await db.batch(JOURNAL_HORIZONS.map(h=>db.prepare(`INSERT OR IGNORE INTO score_outcomes
    (snapshot_id,horizon_min,due_at,status) VALUES (?,?,?,'PENDING')`)
    .bind(id,h,stamp(now+h*60000))));
  saved++;
 }
 return {state:picks.length?'CAPTURED':'NO_QUALIFIED_CANDIDATES',saved,settled,missing};
}
