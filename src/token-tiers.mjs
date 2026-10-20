// HOT and NOT are reversible evidence-based views of the same token ledger.
// A high research score alone cannot make a token HOT; old prices are never treated as live.
// No database duplication, trades or archive deletion.
const validDate=(s)=>{const n=Date.parse(s||'');return Number.isFinite(n)?n:null};
export function tokenTier(asset,now=Date.now()){
 const age=validDate(asset?.last_seen);
 const ageMinutes=age===null?null:Math.max(0,Math.floor((now-age)/60000));
 const base={tier:'NOT',ageMinutes,reason:'NO_RECENT_PRICE'};
 if(!asset||!['solana','robinhood'].includes(asset.chain))return {...base,reason:'INVALID_CHAIN'};
 if(asset.status==='TRASH')return {...base,reason:'ARCHIVED_INVALID_NO_DATA'};
 if(asset.status==='DEAD')return {...base,reason:'DORMANT_RECHECK_DUE'};
 const risk=String(asset.risk_status||'UNVERIFIED');
 if(['MINT_CONTROL_RISK','HOLDER_CONCENTRATION_RISK'].includes(risk))
   return {...base,reason:'ONCHAIN_RISK_FLAG'};
 if(ageMinutes===null||ageMinutes>30||age>now+60000)
   return {...base,reason:'QUOTE_STALE_OR_MISSING'};
 const score=Number(asset.score),liq=Number(asset.liquidity);
 const buys=Number(asset.buys_m5)||0,sells=Number(asset.sells_m5)||0;
 const price=Number(asset.price),change=Number(asset.change_h1);
 if(!(Number.isFinite(score)&&score>=60&&Number.isFinite(liq)&&liq>=50000&&price>0))
   return {...base,reason:'INSUFFICIENT_LIQUIDITY_OR_MOMENTUM'};
 if(buys+sells<12||buys<8||buys<1.2*Math.max(1,sells))
   return {...base,reason:'BUYER_ACTIVITY_UNCONFIRMED'};
 if(Number.isFinite(change)&&change<=-15)return {...base,reason:'PRICE_CONTRACTION'};
 return {tier:'HOT',ageMinutes,reason:'FRESH_BUYER_ACCELERATION'};
}
export function countCoverage(items,now=Date.now()){
 const rows=Array.isArray(items)?items:[];
 const result={total:rows.length,hot:0,not:0,fresh30:0,stale120:0,
  noQuote:0,dormant:0,pinned:0,percentFresh:0};
 for(const a of rows){
   const tier=tokenTier(a,now);
   if(tier.tier==='HOT')result.hot++;else result.not++;
   if(tier.ageMinutes!==null&&tier.ageMinutes<=30)result.fresh30++;
   if(tier.ageMinutes===null)result.noQuote++;
   if(tier.ageMinutes===null||tier.ageMinutes>120)result.stale120++;
   if(a.status==='DEAD')result.dormant++;
   if(a.pinned===1)result.pinned++;
 }
 result.percentFresh=rows.length?Math.round(100*result.fresh30/rows.length):0;
 return result;
}
function roundRobin(rows,slots,tick){
 if(!slots||!rows.length)return [];
 const sorted=[...rows].sort((a,b)=>String(a.asset_key).localeCompare(String(b.asset_key)));
 const offset=((tick*slots)%sorted.length+sorted.length)%sorted.length;
 return Array.from({length:Math.min(slots,sorted.length)},(_,i)=>sorted[(offset+i)%sorted.length]);
}
// 20-slot default: up to ~8 HOT, ~6 pinned, ~6 NOT checks per 10m.
// Quotas are not hard caps if another queue is empty. Each queue rotates
// even when providers return no quotes, avoiding permanent score starvation.
export function selectRefreshTargets(rows,{now=new Date().toISOString(),limit=20}={}){
 const cap=Math.max(1,Math.min(25,limit)),stamp=Date.parse(now);
 const tick=Number.isFinite(stamp)?Math.floor(stamp/600000):0;
 const eligible=(Array.isArray(rows)?rows:[]).filter(x=>x&&x.status!=='TRASH'&&
   (['ALIVE','STATIC','DEAD'].includes(x.status)||x.pinned===1||Number(x.has_position)===1));
 const seen=new Set(),out=[];
 const append=(list,ceiling=cap)=>{for(const x of list){
   if(!x||seen.has(x.asset_key)||out.length>=ceiling)continue;
   seen.add(x.asset_key);out.push(x);
 }};
 append(eligible.filter(x=>Number(x.has_position)===1));
 if(out.length>=cap)return out;
 const watched=eligible.filter(x=>x.pinned===1&&!seen.has(x.asset_key));
 const archive=eligible.filter(x=>x.status==='DEAD'&&x.pinned!==1&&!seen.has(x.asset_key));
 const hot=eligible.filter(x=>x.status!=='DEAD'&&x.pinned!==1&&!seen.has(x.asset_key)&&tokenTier(x,stamp).tier==='HOT');
 const not=eligible.filter(x=>x.status!=='DEAD'&&x.pinned!==1&&!seen.has(x.asset_key)&&tokenTier(x,stamp).tier==='NOT');
 const remaining=cap-out.length;
 // Reserve approximately 15% for background revival checks; preserve held/pinned priority.
 const reserved=archive.length?Math.min(remaining,Math.max(1,Math.ceil(remaining*.15))):0;
 const activeLimit=cap-reserved,activeSlots=activeLimit-out.length;
 append(roundRobin(hot,Math.ceil(activeSlots*.45),tick),activeLimit);
 append(roundRobin(watched,Math.ceil(activeSlots*.35),tick),activeLimit);
 append(roundRobin(not,activeSlots,tick),activeLimit);
 for(const pool of [hot,watched,not])append(roundRobin(pool,cap,tick),activeLimit);
 append(roundRobin(archive,reserved,tick));
 // Active opportunities get all unused slots. Archive uses surplus only.
 for(const pool of [hot,watched,not,archive])append(roundRobin(pool,cap,tick));
 return out;
}
