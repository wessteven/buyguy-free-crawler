// GOGET Trader Radar v0: standalone, deterministic research primitives.
// No DB, scanner, ranking, trade execution or network imports.
const ADDRESS=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const QUOTE=new Set(['EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
 'So11111111111111111111111111111111111111112',
 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkM1SNEtP9qjn4Ms']);
const num=x=>typeof x==='number'&&Number.isFinite(x)?x:null;
const time=x=>typeof x==='string'&&Number.isFinite(Date.parse(x))?Date.parse(x):null;
const round=n=>Math.round(n*100)/100;
export const isSolanaAddress=x=>typeof x==='string'&&ADDRESS.test(x);

// Source claims NEVER establish wallet control, independence, or realized PnL.
export function importFomoCandidates(snapshot,{max=200}={}){
 if(!snapshot||!Array.isArray(snapshot.traders)||!time(snapshot.observedAt)||!/^https:\/\//.test(snapshot.sourceUrl||''))
  throw Error('Dated, attributable candidate snapshot required');
 const seen=new Map(),rejected=[];
 for(const [index,row] of snapshot.traders.slice(0,Math.min(200,Math.max(1,Math.floor(max)))).entries()){
  const wallet=row?.solanaWallet,handle=row?.handle;
  if(!isSolanaAddress(wallet)||typeof handle!=='string'||!/^@?[A-Za-z0-9_]{1,40}$/.test(handle)){
   rejected.push({index,reason:'INVALID_HANDLE_OR_WALLET'});continue;
  }
  const normalizedHandle=handle.replace(/^@/,'');
  const previous=seen.get(wallet);
  if(previous){
   previous.identityStatus='CONFLICTING_OR_DUPLICATE_CLAIMS';
   previous.claimedHandles=[...new Set([...previous.claimedHandles,normalizedHandle])];
   continue;
  }
  seen.set(wallet,{wallet,handle:normalizedHandle,claimedHandles:[normalizedHandle],
   observedAt:snapshot.observedAt,sourceUrl:snapshot.sourceUrl,
   identityStatus:'THIRD_PARTY_UNVERIFIED',verifiedOwner:false,
   reportedPnlUsd:num(row.reportedPnlUsd),reportedPnlWindow:row.reportedPnlWindow||null,
   realizedPnlUsd:null,independenceVerified:false});
 }
 return {source:'FOMO_THIRD_PARTY_SNAPSHOT',observedAt:snapshot.observedAt,
  candidates:[...seen.values()],rejected,
  caveat:'Candidate attribution and reported PnL are not on-chain proof, independently audited profit or copy-trading eligibility.'};
}

// FIFO realized-PnL requires exact confirmed execution prices, full prior
// inventory history and fees. A transfer or missing basis blocks attribution.
export function scoreRealizedPerformance(wallet,events=[]){
 if(!isSolanaAddress(wallet))throw Error('Invalid wallet');
 const sorted=Array.isArray(events)?events.filter(x=>x?.wallet===wallet).sort((a,b)=>(time(a.at)??Infinity)-(time(b.at)??Infinity)):[];
 const lots=new Map();let realized=0,matchedCost=0,closed=0,wins=0,unknown=false;
 const issues=[];const seen=new Set();
 for(const e of sorted){
  const mint=e.mint,ts=time(e.at);
  if(!isSolanaAddress(mint)||ts===null||!['BUY','SELL','TRANSFER_IN','TRANSFER_OUT'].includes(e.side)){
   issues.push('INVALID_EVENT');unknown=true;continue;
  }
  const id=e.signature+':'+e.side+':'+mint+':'+(e.legIndex??0);
  if(!e.signature||seen.has(id)){issues.push('MISSING_OR_DUPLICATE_SIGNATURE');unknown=true;continue;}
  seen.add(id);
  const q=num(e.quantity),usd=num(e.usd),fee=num(e.feesUsd);
  if(e.side.startsWith('TRANSFER')){unknown=true;issues.push('TRANSFER_BASIS_UNKNOWN');continue;}
  if(e.confirmed!==true||e.basisKnown!==true||!(q>0)||!(usd>0)||fee===null||fee<0){
   unknown=true;issues.push('MISSING_CONFIRMED_COST_BASIS');continue;
  }
  const inventory=lots.get(mint)||[];lots.set(mint,inventory);
  if(e.side==='BUY'){inventory.push({remaining:q,costPerUnit:(usd+fee)/q});continue;}
  const available=inventory.reduce((n,l)=>n+l.remaining,0);
  if(available+1e-8<q){unknown=true;issues.push('SALE_EXCEEDS_PROVEN_INVENTORY');continue;}
  let left=q,cost=0;
  for(const lot of inventory){
   if(left<=1e-8)break;
   const used=Math.min(left,lot.remaining);cost+=used*lot.costPerUnit;
   lot.remaining-=used;left-=used;
  }
  const pnl=usd-fee-cost;realized+=pnl;matchedCost+=cost;
  closed++;if(pnl>0)wins++;
 }
 if(!closed||unknown)return {eligible:false,reason:unknown?'INCOMPLETE_BASIS':'NO_VERIFIED_CLOSED_TRADES',
  realizedPnlUsd:null,roiPct:null,winRatePct:null,score:null,closedTrades:closed,issues:[...new Set(issues)]};
 const roi=matchedCost>0?100*realized/matchedCost:null;
 // Conservative research score: >=5 independent closes before high confidence.
 const strength=Math.max(0,Math.min(1,closed/5));
 const base=Math.max(0,Math.min(100,50+(roi??0)/2))*0.6+100*(wins/closed)*0.4;
 return {eligible:closed>=5,reason:closed>=5?'VERIFIED_FIFO_SAMPLE':'SMALL_CLOSED_TRADE_SAMPLE',
  realizedPnlUsd:round(realized),roiPct:roi===null?null:round(roi),winRatePct:round(100*wins/closed),
  score:round(base*strength),closedTrades:closed,issues:[],
  caveat:'FIFO results cover only the supplied complete on-chain trade ledger; they are not total wallet returns.'};
}

// Inputs must be validated true buys/sells externally; raw transfers or FOMO
// fee-payer matches are deliberately not promoted to confirmation.
export function detectTraderConvergence(events=[],candidates=[],{
 now=new Date().toISOString(),windowMinutes=15,minIndependent=3,maxEvents=5000
}={}){
 const stamp=time(now);if(stamp===null)throw Error('Invalid observation time');
 const period=Math.max(1,Math.min(60,Math.floor(windowMinutes)))*60000;
 const known=new Map(candidates.filter(x=>isSolanaAddress(x?.wallet)).map(x=>[x.wallet,x]));
 const seen=new Set(),grouped=new Map();
 for(const e of (Array.isArray(events)?events:[]).slice(0,Math.max(0,Math.min(5000,maxEvents)))){
  if(!isSolanaAddress(e?.wallet)||!isSolanaAddress(e?.mint)||QUOTE.has(e.mint)||!['BUY','SELL'].includes(e.side)||
    e.confirmed!==true||!e.signature||!num(e.notionalUsd)||e.notionalUsd<=0)continue;
  const ts=time(e.at);if(ts===null||ts>stamp||stamp-ts>period)continue;
  const dedup=e.signature+':'+e.wallet+':'+e.mint+':'+e.side+':'+(e.legIndex??0);
  if(seen.has(dedup))continue;seen.add(dedup);
  const candidate=known.get(e.wallet);if(!candidate)continue;
  const mintRows=grouped.get(e.mint)||new Map();grouped.set(e.mint,mintRows);
  const walletRows=mintRows.get(e.wallet)||{wallet:e.wallet,netUsd:0,buyCount:0,independenceVerified:candidate.independenceVerified===true,
   group:candidate.independenceGroup||e.wallet};mintRows.set(e.wallet,walletRows);
  walletRows.netUsd+=(e.side==='BUY'?1:-1)*e.notionalUsd;
  if(e.side==='BUY')walletRows.buyCount++;
 }
 const rows=[];
 for(const [mint,wallets] of grouped){
  const active=[...wallets.values()].filter(x=>x.netUsd>0&&x.buyCount>0);
  const groups=new Map();for(const w of active){const old=groups.get(w.group);if(!old||w.netUsd>old.netUsd)groups.set(w.group,w);}
  const distinct=groups.size;
  const verifiedGroups=[...groups.values()].filter(x=>x.independenceVerified);
  const independent=verifiedGroups.length;
  const qualified=independent>=Math.max(3,Math.floor(minIndependent));
  rows.push({mint,distinctWallets:active.length,distinctGroups:distinct,verifiedIndependentGroups:independent,
   netNotionalUsd:round([...wallets.values()].reduce((n,x)=>n+x.netUsd,0)),
   status:qualified?'RESEARCH_CONVERGENCE':'INDEPENDENCE_NOT_VERIFIED',
   eligibleResearchSignal:qualified,automaticTradeAllowed:false,
   caveat:'A convergence event is a research signal, not proof of liquidity, trader profitability, independence or safety.'});
 }
 return rows.sort((a,b)=>b.verifiedIndependentGroups-a.verifiedIndependentGroups||b.distinctWallets-a.distinctWallets);
}
