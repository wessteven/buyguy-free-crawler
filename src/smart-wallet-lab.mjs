// GOGET Smart Wallet Lab v0.1. ISOLATED RESEARCH: no wallet keys, RPC orders, or real trades.
// Input is a *normalized and independently enriched* event, not a raw Helius webhook.
// Never turn unknown risk/route/holder data into an approval.
export const LAB_RULES = Object.freeze({
  minLiquidityUsd: 25000, maxTop10OwnerPct: 35, maxDevOwnerPct: 5,
  minClosedWalletTrades: 20, minProfitFactor: 1.2, minNetWalletPnlUsd: 0,
  maxAlreadyUpPct: 80, maxEventAgeMs: 20000, maxQuoteAgeMs: 10000,
  copyFraction: 0.05, maxTradeUsd: 100, minTradeUsd: 1,
  maxOpenExposureUsd: 250, maxOpenPositions: 4, maxDailyLossUsd: 100,
  stopPct: 0.09, targetPct: 0.35, adverseSlipPct: 0.02, feePct: 0.003,
  latencyTargetMs: 1000
});
const address = s => typeof s === 'string' && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s);
const positive = x => typeof x === 'number' && Number.isFinite(x) && x > 0;
const number = x => typeof x === 'number' && Number.isFinite(x);
const stamp = x => typeof x === 'string' ? Date.parse(x) : NaN;
const same = (a,b) => a === b;
const record = (stage,ok,reasons=[]) => ({stage,ok,reasons});

function quoteCheck(market, event, now, side) {
  const reasons=[];
  if (!market || !same(market.mint,event.mint) || !same(market.pool,event.pool)) reasons.push('QUOTE_POOL_IDENTITY_UNVERIFIED');
  const t=stamp(market?.quotedAt);
  if (!Number.isFinite(t) || t>now || now-t>LAB_RULES.maxQuoteAgeMs) reasons.push('QUOTE_STALE_OR_MISSING');
  if (market?.routeSource !== 'INDEPENDENT_EXECUTABLE_QUOTE' || market?.routeVerified !== true) reasons.push('EXECUTABLE_ROUTE_UNVERIFIED');
  if (!positive(side==='BUY'?market?.askUsd:market?.bidUsd)) reasons.push('SIDE_QUOTE_UNAVAILABLE');
  return reasons;
}

export function assessCopyBuy(event, data={}, account={}, now=Date.now()) {
  const stages=[];
  const fail=(stage,reasons)=>{stages.push(record(stage,false,reasons));return {ok:false,decision:'KILL',stage,reasons,stages,observedAt:new Date(now).toISOString()}};
  const pass=stage=>stages.push(record(stage,true));
  const s=[];
  if (event?.chain!=='solana' || event?.side!=='BUY') s.push('NOT_VERIFIED_SOLANA_BUY');
  if (!address(event?.wallet) || !address(event?.mint) || !address(event?.pool) ||
      typeof event?.signature!=='string' || !/^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(event.signature)) s.push('INVALID_EVENT_IDENTITY');
  if (event?.confirmed!==true || event?.swapVerified!==true || event?.source!=='VERIFIED_SWAP') s.push('ONCHAIN_SWAP_NOT_VERIFIED');
  if (!data.monitoredWallets?.has(event?.wallet)) s.push('WALLET_NOT_IN_VETTED_COHORT');
  const t=stamp(event?.blockTime),seen=stamp(event?.seenAt);
  if (!Number.isFinite(t)||!Number.isFinite(seen)||seen<t||now<seen||now-t>LAB_RULES.maxEventAgeMs) s.push('EVENT_STALE_OR_TIME_UNKNOWN');
  if (!positive(event?.walletTradeUsd)||!positive(event?.walletBuyPriceUsd)) s.push('WALLET_ENTRY_PRICE_OR_SIZE_UNVERIFIED');
  if(s.length) return fail('SCOUT',s);
  pass('SCOUT');

  const market=data.market;
  const f=[];
  if (market?.riskVerified!==true || market?.holderOwnerMappingVerified!==true) f.push('RISK_OR_OWNER_MAPPING_UNVERIFIED');
  if (market?.mintAuthorityRevoked!==true || market?.freezeAuthorityRevoked!==true ||
      market?.extensionsReviewed!==true) f.push('MINT_CONTROL_UNVERIFIED');
  if (!positive(market?.liquidityUsd) || market.liquidityUsd<LAB_RULES.minLiquidityUsd) f.push('LOW_OR_UNKNOWN_LIQUIDITY');
  if (!number(market?.top10OwnerPct) || market.top10OwnerPct<0 || market.top10OwnerPct>LAB_RULES.maxTop10OwnerPct) f.push('TOP10_CONCENTRATION_UNSAFE_OR_UNKNOWN');
  if (!number(market?.devOwnerPct) || market.devOwnerPct<0 || market.devOwnerPct>LAB_RULES.maxDevOwnerPct) f.push('DEV_CONCENTRATION_UNSAFE_OR_UNKNOWN');
  if (market?.lpCustodyVerified!==true || !['BURNED','LOCKED','PROTOCOL_IMMUTABLE'].includes(market?.lpStatus)) f.push('LP_CUSTODY_UNVERIFIED');
  f.push(...quoteCheck(market,event,now,'BUY'));
  if(f.length) return fail('FILTER',f);
  pass('FILTER');

  const w=data.walletEvidence, a=[];
  if (w?.audited!==true || !number(w?.closedTrades)||w.closedTrades<LAB_RULES.minClosedWalletTrades ||
      !positive(w?.profitFactor) || w.profitFactor<LAB_RULES.minProfitFactor ||
      !number(w?.netRealizedPnlUsd) || w.netRealizedPnlUsd<=LAB_RULES.minNetWalletPnlUsd ||
      w?.washRiskReviewed!==true || w?.washRiskDetected===true) a.push('WALLET_EDGE_NOT_PROVEN');
  if (data?.soldSinceBuy !== false || data?.tradeFeedComplete !== true) a.push('WALLET_SELL_STATUS_UNVERIFIED_OR_SOLD');
  if (!positive(market?.midUsd)|| (market.midUsd/event.walletBuyPriceUsd-1)*100>LAB_RULES.maxAlreadyUpPct) a.push('ALREADY_UP_80_PCT_OR_PRICE_UNKNOWN');
  if (account?.openMints?.has(event.mint)) a.push('POSITION_ALREADY_OPEN');
  if(a.length)return fail('ANALYST',a);
  pass('ANALYST');

  const g=[];
  const size=Math.min(LAB_RULES.maxTradeUsd,event.walletTradeUsd*LAB_RULES.copyFraction);
  const exposure=number(account.openExposureUsd)?account.openExposureUsd:NaN;
  const cash=account.cashUsd, positions=account.openPositions, today=account.dailyRealizedUsd;
  if (!(size>=LAB_RULES.minTradeUsd)) g.push('POSITION_TOO_SMALL');
  if (!number(cash)||cash<size) g.push('INSUFFICIENT_PAPER_CASH');
  if (!number(exposure)||exposure+size>LAB_RULES.maxOpenExposureUsd) g.push('PAPER_EXPOSURE_LIMIT');
  if (!number(positions)||positions>=LAB_RULES.maxOpenPositions) g.push('PAPER_POSITION_LIMIT');
  if (!number(today)||today<=-LAB_RULES.maxDailyLossUsd) g.push('DAILY_PAPER_LOSS_LIMIT');
  if(g.length)return fail('GUARD',g);
  pass('GUARD');

  const entryUsd=market.askUsd*(1+LAB_RULES.adverseSlipPct);
  const feeUsd=size*LAB_RULES.feePct;
  const units=(size-feeUsd)/entryUsd;
  if(!positive(units)||!positive(entryUsd))return fail('PAPER_SNIPER',['PAPER_FILL_MODEL_INVALID']);
  pass('PAPER_SNIPER');
  return {ok:true,decision:'PAPER_BUY',stages,observedAt:new Date(now).toISOString(),
    delayMs:seen-t,latencyTargetMet:seen-t<=LAB_RULES.latencyTargetMs,
    note:'Block timestamps may be second-granular: subsecond latency is NOT independently established.',
    proposal:{wallet:event.wallet,mint:event.mint,pool:event.pool,signature:event.signature,
      spendUsd:size,units,entryUsd,feeUsd,stopUsd:entryUsd*(1-LAB_RULES.stopPct),
      targetUsd:entryUsd*(1+LAB_RULES.targetPct),openedAt:new Date(now).toISOString(),
      quoteSource:market.routeSource,fillEvidence:'SIMULATED_WORSE_THAN_EXECUTABLE_QUOTE_NOT_REAL_FILL'}};
}

export function assessPaperExit(position, market, now=Date.now(), reason='MARK') {
  const event={mint:position?.mint,pool:position?.pool};
  const bad=quoteCheck(market,event,now,'SELL');
  if(bad.length)return {ok:false,decision:'EXIT_BLOCKED',reasons:bad};
  if(reason==='MARK'&&market.bidUsd>position.stopUsd && market.bidUsd<position.targetUsd)return {ok:false,decision:'HOLD',reasons:[]};
  const exitReason=reason==='COPIED_WALLET_SELL'?'COPIED_WALLET_SELL':
    market.bidUsd<=position.stopUsd?'STOP':market.bidUsd>=position.targetUsd?'TARGET':'MANUAL';
  const exitUsd=market.bidUsd*(1-LAB_RULES.adverseSlipPct);
  const gross=position.units*exitUsd,feeUsd=gross*LAB_RULES.feePct,proceedsUsd=gross-feeUsd;
  return {ok:true,decision:'PAPER_EXIT',reason:exitReason,exitUsd,feeUsd,
    proceedsUsd,realizedUsd:proceedsUsd-position.spendUsd,at:new Date(now).toISOString(),
    fillEvidence:'SIMULATED_WORSE_THAN_EXECUTABLE_QUOTE_NOT_REAL_FILL'};
}

export class SmartWalletLab {
  constructor({wallets=[],startCashUsd=1000}={}) {
    this.wallets=new Set(wallets.filter(address));this.cashUsd=startCashUsd;this.realizedUsd=0;
    this.positions=new Map();this.seen=new Set();this.journal=[];
  }
  // Each record is self-contained: caller must supply fresh, independently checked market/wallet evidence.
  ingest(event, context={}, now=Date.now()) {
    const id=[event?.signature,event?.wallet,event?.mint,event?.side].join(':');
    if(this.seen.has(id))return this.log(event,{ok:false,decision:'KILL',stage:'SCOUT',reasons:['DUPLICATE_EVENT']},now);
    this.seen.add(id);
    const key=event?.mint;
    if(event?.side==='SELL') {
      const p=this.positions.get(key);
      if(!p || p.wallet!==event.wallet || p.pool!==event.pool) return this.log(event,{ok:false,decision:'NO_MATCHING_PAPER_POSITION',reasons:['NO_MATCHING_PAPER_POSITION']},now);
      if(event.confirmed!==true || event.swapVerified!==true || event.source!=='VERIFIED_SWAP')
        return this.log(event,{ok:false,decision:'KILL',stage:'SCOUT',reasons:['UNVERIFIED_WALLET_SELL']},now);
      const elapsed=now-Date.parse(p.openedAt);
      const res=assessPaperExit(p,context.market,now,'COPIED_WALLET_SELL');
      if(res.ok) {this.cashUsd+=res.proceedsUsd;this.realizedUsd+=res.realizedUsd;this.positions.delete(key);}
      return this.log(event,{...res,withinTenMinutes:elapsed>=0&&elapsed<600000},now);
    }
    const open=[...this.positions.values()];
    const result=assessCopyBuy(event,{...context,monitoredWallets:this.wallets},
      {cashUsd:this.cashUsd,openExposureUsd:open.reduce((s,p)=>s+p.spendUsd,0),
       openPositions:open.length,openMints:new Set(this.positions.keys()),
       dailyRealizedUsd:context.dailyRealizedUsd??this.realizedUsd},now);
    if(result.ok) {this.cashUsd-=result.proposal.spendUsd;this.positions.set(key,result.proposal);}
    return this.log(event,result,now);
  }
  mark(mint,market,now=Date.now()) {
    const p=this.positions.get(mint);
    if(!p)return {ok:false,decision:'NOT_HELD'};
    const res=assessPaperExit(p,market,now);
    if(res.ok){this.cashUsd+=res.proceedsUsd;this.realizedUsd+=res.realizedUsd;this.positions.delete(mint);}
    this.log({mint,side:'MARK',wallet:p.wallet},res,now);
    return res;
  }
  log(event,decision,now) {
    const entry={at:new Date(now).toISOString(),wallet:event?.wallet??null,mint:event?.mint??null,
      signature:event?.signature??null,side:event?.side??null,decision:decision.decision,
      stage:decision.stage??null,reasons:decision.reasons??[],delayMs:decision.delayMs??null,
      spendUsd:decision.proposal?.spendUsd??null,realizedUsd:decision.realizedUsd??null,
      withinTenMinutes:decision.withinTenMinutes??null};
    this.journal.push(entry);return decision;
  }
  summary() {
    const reasons={};for(const item of this.journal)for(const r of item.reasons)reasons[r]=(reasons[r]||0)+1;
    return {mode:'PAPER_ONLY_NO_EXECUTION',wallets:this.wallets.size,cashUsd:this.cashUsd,
      realizedUsd:this.realizedUsd,openPositions:this.positions.size,
      events:this.journal.length,paperBuys:this.journal.filter(e=>e.decision==='PAPER_BUY').length,
      paperExits:this.journal.filter(e=>e.decision==='PAPER_EXIT').length,rejectedByReason:reasons,
      journal:this.journal};
  }
}
