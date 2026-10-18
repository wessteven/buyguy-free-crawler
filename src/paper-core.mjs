// BuyGuy Paper Experiment: indicative execution modelling only.
// Never interacts with private wallet keys, RPC sendTransaction, exchanges, or real funds.
export const PAPER_CONFIG=Object.freeze({
  startCash:1000,buyUsd:40,maxOpenPositions:8,
  minScore:72,minLiquidityUsd:50000,minMarketCap:50000,maxMarketCap:250000,
  minObservations:3,staleQuoteMinutes:20,cooldownHours:6,maxAgeHours:36,
  adverseSlippage:0.02,feeRate:0.003,stopPct:0.12,targetPct:0.35,
  maxHoldingHours:24,maxRealizedLoss:200
});
const n=x=>{const y=Number(x);return Number.isFinite(y)?y:NaN};
const parse=x=>{const t=Date.parse(x||'');return Number.isFinite(t)?t:NaN};
const fresh=(x,now,minutes=PAPER_CONFIG.staleQuoteMinutes)=>{
  const t=parse(x),age=now-t;return Number.isFinite(t)&&age>=0&&age<=minutes*60000;
};
export function choosePaperEntry(a,{now=Date.now(),cash=1000,openCount=0,lastExit=null,hasOpen=false,realized=0}={}){
  const why=[];
  if(a?.risk_status!=='PAPER_ELIGIBLE')why.push('NO_VERIFIED_PAPER_APPROVAL');
  if(a?.status!=='ALIVE')why.push('NOT_ALIVE');
  if(!a?.pool)why.push('POOL_UNKNOWN');
  if(!fresh(a?.last_seen,now))why.push('QUOTE_STALE');
  if(Number(a?.observations)<PAPER_CONFIG.minObservations)why.push('INSUFFICIENT_HISTORY');
  if(n(a?.score)<PAPER_CONFIG.minScore)why.push('MOMENTUM_TOO_WEAK');
  if(!(n(a?.liquidity)>=PAPER_CONFIG.minLiquidityUsd))why.push('LIQUIDITY_TOO_LOW');
  if(!(n(a?.market_cap)>=PAPER_CONFIG.minMarketCap&&n(a?.market_cap)<=PAPER_CONFIG.maxMarketCap))why.push('CAP_OUTSIDE_EXPERIMENT');
  if(!(n(a?.price)>0))why.push('MISSING_PRICE');
  if(!(n(a?.buys_m5)>=12&&n(a?.buys_m5)>n(a?.sells_m5)*1.2))why.push('BUY_PRESSURE_UNCONFIRMED');
  const age=now-parse(a?.pool_created);
  if(!Number.isFinite(age)||age<0||age>PAPER_CONFIG.maxAgeHours*3600000)why.push('POOL_AGE_UNKNOWN_OR_OLD');
  if(cash<PAPER_CONFIG.buyUsd)why.push('INSUFFICIENT_CASH');
  if(openCount>=PAPER_CONFIG.maxOpenPositions)why.push('MAX_POSITIONS');
  if(realized<=-PAPER_CONFIG.maxRealizedLoss)why.push('LOSS_LIMIT');
  if(hasOpen)why.push('ALREADY_HELD');
  if(lastExit!=null&&now-parse(lastExit)<PAPER_CONFIG.cooldownHours*3600000)why.push('COOLDOWN');
  if(why.length)return {ok:false,reasons:why};
  const quoted=n(a.price),fee=PAPER_CONFIG.buyUsd*PAPER_CONFIG.feeRate;
  const filled=quoted*(1+PAPER_CONFIG.adverseSlippage);
  const units=(PAPER_CONFIG.buyUsd-fee)/filled;
  return {ok:true,reasons:[],asset_key:a.asset_key,pool:a.pool,chain:a.chain,
    quote:quoted,price:filled,units,cost:PAPER_CONFIG.buyUsd,fee,
    stop:filled*(1-PAPER_CONFIG.stopPct),target:filled*(1+PAPER_CONFIG.targetPct),
    fillType:'INDICATIVE_QUOTE_WITH_ADVERSE_SLIPPAGE',time:new Date(now).toISOString()};
}
export function choosePaperExit(p,a,{now=Date.now()}={}){
  if(p?.status!=='OPEN')return {ok:false,reason:'POSITION_NOT_OPEN'};
  if(p?.asset_key!==a?.asset_key||p?.pool!==a?.pool)return {ok:false,reason:'POOL_IDENTITY_UNCERTAIN'};
  if(!fresh(a.last_seen,now))return {ok:false,reason:'PRICE_STALE'};
  const quote=n(a.price),entry=n(p.entry_usd),units=n(p.units),cost=n(p.cost_usd);
  if(!(quote>0&&entry>0&&units>0&&cost>0))return {ok:false,reason:'INVALID_QUOTE_OR_POSITION'};
  const held=now-parse(p.opened_at);
  let reason=null;
  if(quote<=n(p.stop_usd))reason='STOP';
  else if(quote>=n(p.target_usd))reason='TAKE_PROFIT';
  else if(Number.isFinite(held)&&held>=PAPER_CONFIG.maxHoldingHours*3600000)reason='TIME_EXIT';
  else if(n(a.liquidity)<25000)reason='LIQUIDITY_CONTRACTION';
  if(!reason)return {ok:false,reason:'HOLD'};
  const price=quote*(1-PAPER_CONFIG.adverseSlippage);
  const gross=units*price,fee=gross*PAPER_CONFIG.feeRate,proceeds=gross-fee;
  return {ok:true,reason,quote,price,gross,fee,proceeds,realized:proceeds-cost,
    fillType:'INDICATIVE_QUOTE_WITH_ADVERSE_SLIPPAGE',time:new Date(now).toISOString()};
}
export function markPosition(p,a,{now=Date.now()}={}){
  if(p?.asset_key!==a?.asset_key||p?.pool!==a?.pool||!fresh(a?.last_seen,now)||!(n(a?.price)>0))
    return {estimatedValue:null,unrealized:null,stale:true};
  const estimatedValue=n(a.price)*n(p.units)*(1-PAPER_CONFIG.adverseSlippage)*(1-PAPER_CONFIG.feeRate);
  return {estimatedValue,unrealized:estimatedValue-n(p.cost_usd),stale:false};
}
