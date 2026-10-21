// GOGET Trader Radar: pure, bounded interpretation of Helius *enhanced*
// transaction responses. Not an RPC client or production signal feed.
// Transaction tokenTransfers are not proof of beneficial ownership or a fill.
import {isSolanaAddress} from './trader-radar.mjs';
const STABLE=new Set(['EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkM1SNEtP9qjn4Ms']);
const SIGNATURE=/^[1-9A-HJ-NP-Za-km-z]{80,90}$/;
const ms=x=>typeof x==='string'&&Number.isFinite(Date.parse(x))?Date.parse(x):null;
const round=x=>Math.round(x*1000000)/1000000;
export function interpretEnhancedTokenFlow(wallet,tx){
 const rejected=status=>({status,provisionalFlow:null});
 if(!isSolanaAddress(wallet)||!tx||tx.transactionError)return rejected('INVALID_OR_FAILED_TRANSACTION');
 if(!SIGNATURE.test(tx.signature||'')||!Number.isInteger(tx.timestamp)||tx.timestamp<1500000000)
  return rejected('MISSING_SIGNATURE_OR_TIMESTAMP');
 if(!Array.isArray(tx.tokenTransfers))return rejected('MISSING_TOKEN_TRANSFERS');
 const net=new Map();
 for(const leg of tx.tokenTransfers){
  if(!isSolanaAddress(leg?.mint)||typeof leg?.tokenAmount!=='number'||
    !Number.isFinite(leg.tokenAmount)||leg.tokenAmount<=0)return rejected('MALFORMED_TRANSFER_LEG');
  if(leg.fromUserAccount===wallet)net.set(leg.mint,(net.get(leg.mint)||0)-leg.tokenAmount);
  if(leg.toUserAccount===wallet)net.set(leg.mint,(net.get(leg.mint)||0)+leg.tokenAmount);
 }
 const changes=[...net].filter(([,qty])=>Math.abs(qty)>1e-8).map(([mint,delta])=>({mint,delta}));
 if(changes.length!==2)return rejected('NOT_TWO_TOKEN_SIDES');
 const quote=changes.filter(row=>STABLE.has(row.mint));
 if(quote.length!==1)return rejected('NO_SINGLE_STABLE_QUOTE');
 const base=changes.find(row=>row.mint!==quote[0].mint);
 if(quote[0].delta*base.delta>=0)return rejected('NOT_OPPOSING_TOKEN_SIDES');
 return {status:'UNVERIFIED_TWO_SIDED_FLOW',provisionalFlow:{
  wallet,mint:base.mint,signature:tx.signature,at:new Date(tx.timestamp*1000).toISOString(),
  side:base.delta>0?'BUY_LIKE':'SELL_LIKE',
  quoteMint:quote[0].mint,quoteUnits:Math.abs(quote[0].delta),
  baseUnits:Math.abs(base.delta),source:tx.source||'UNKNOWN',transactionType:tx.type||'UNKNOWN',
  evidence:'NET_ENHANCED_TOKEN_TRANSFERS',confirmed:false,independenceVerified:false,
  realizedPnlUsd:null,tradeExecutionVerified:false},
  caveat:'Enhanced token transfers may represent aggregated routing, transfers, rebates, or complex actions. They are not independently verified trades.'};
}
export function summarizeEnhancedWalletSamples(walletSamples=[],{maxWallets=20,maxPerWallet=100}={}){
 const flows=[],reports=[],seenWallets=new Set(),seenTx=new Set();
 for(const row of (Array.isArray(walletSamples)?walletSamples:[]).slice(0,Math.min(20,Math.max(1,maxWallets)))){
  const wallet=row?.wallet;
  if(!isSolanaAddress(wallet)||seenWallets.has(wallet))continue;
  seenWallets.add(wallet);
  const txs=(Array.isArray(row.transactions)?row.transactions:[]).slice(0,Math.min(100,Math.max(1,maxPerWallet)));
  const counts={sampled:0,provisional:0,rejected:0};
  for(const tx of txs){
   if(!SIGNATURE.test(tx?.signature||''))continue;
   const key=wallet+':'+tx.signature;
   if(seenTx.has(key))continue;seenTx.add(key);counts.sampled++;
   const value=interpretEnhancedTokenFlow(wallet,tx);
   if(value.provisionalFlow){flows.push(value.provisionalFlow);counts.provisional++;}
   else counts.rejected++;
  }
  reports.push({wallet,...counts,identityVerified:false,realizedPnlVerified:false});
 }
 return {status:'RESEARCH_ONLY',wallets:reports,flows,tradeExecutionsVerified:0,
  caveat:'No inferred flow is automatically a swap or countable as an independent confirmed trader.'};
}
export function analyzeProvisionalCrowding(flows=[],{asOf,windowMinutes=15}={}){
 const end=ms(asOf);if(end===null)throw Error('Explicit asOf is required');
 const windowMs=Math.max(1,Math.min(60,Math.floor(windowMinutes||15)))*60000;
 const seen=new Set(),group=new Map();
 for(const f of (Array.isArray(flows)?flows:[]).slice(0,5000)){
  if(!isSolanaAddress(f?.wallet)||!isSolanaAddress(f?.mint)||!SIGNATURE.test(f.signature||'')||
    !['BUY_LIKE','SELL_LIKE'].includes(f.side)||f.confirmed!==false||
    !(typeof f.quoteUnits==='number'&&Number.isFinite(f.quoteUnits)&&f.quoteUnits>0))continue;
  const t=ms(f.at);if(t===null||t>end||t<end-windowMs)continue;
  const key=f.wallet+':'+f.signature+':'+f.mint;
  if(seen.has(key))continue;seen.add(key);
  const wallets=group.get(f.mint)||new Map();group.set(f.mint,wallets);
  wallets.set(f.wallet,(wallets.get(f.wallet)||0)+(f.side==='BUY_LIKE'?1:-1)*f.quoteUnits);
 }
 const rows=[];
 for(const [mint,wallets] of group){
  const buyers=[...wallets].filter(([,net])=>net>0);
  const sellers=[...wallets].filter(([,net])=>net<0);
  rows.push({mint,provisionalNetBuyWallets:buyers.length,provisionalNetSellWallets:sellers.length,
   signedQuoteUnits:round([...wallets.values()].reduce((a,b)=>a+b,0)),
   status:buyers.length>=2?'UNVERIFIED_MULTI_WALLET_BUY_LIKE_FLOW':'NO_MULTI_WALLET_BUY_LIKE_FLOW',
   verifiedIndependentBuyerGroups:0,eligibleResearchSignal:false,automaticTradeAllowed:false});
 }
 rows.sort((a,b)=>b.provisionalNetBuyWallets-a.provisionalNetBuyWallets||b.signedQuoteUnits-a.signedQuoteUnits);
 return {status:'RESEARCH_ONLY',asOf,windowMinutes:windowMs/60000,rows,
  confirmedTraderConvergences:0,
  caveat:'Potential coincidence of quote/token movements only. Wallet mappings, trade origin, controller independence, liquidity and venue execution not verified.'};
}
