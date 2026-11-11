// Manual bounded GOGET Trader Radar historical replay. No D1 or trades.
import {readFileSync} from 'node:fs';
import {importFomoCandidates} from '../src/trader-radar.mjs';
import {replayHistoricalWallet} from '../src/trader-radar-replay.mjs';
const clamp=(value,fallback,maximum)=>Math.min(maximum,Math.max(1,Math.floor(Number(value)||fallback)));
const key=process.env.HELIUS_API_KEY;
if(!key){console.error('TRADER_RADAR_HELIUS_SECRET_MISSING');process.exitCode=1;}
else{
 const snapshot=JSON.parse(readFileSync(new URL('../data/trader-radar/fomo-candidates-2026-10-18.json',import.meta.url),'utf8'));
 const candidates=importFomoCandidates(snapshot).candidates;
 const count=clamp(process.env.WALLET_COUNT,2,4);
 const txLimit=clamp(process.env.TX_LIMIT,8,12);
 const pageLimit=clamp(process.env.PAGE_LIMIT,1,2);
 const controller=new AbortController();
 const timeout=setTimeout(()=>controller.abort(),95000);
 const url='https://mainnet.helius-rpc.com/?api-key='+encodeURIComponent(key);
 try{
  const wallets=[];
  for(const candidate of candidates.slice(0,count)){
   const result=await replayHistoricalWallet({HELIUS_RPC_URL:url},
    {wallet:candidate.wallet,pages:pageLimit,perPage:Math.min(8,txLimit),
      maxTransactions:txLimit,fetcher:(u,opt)=>fetch(u,{...opt,signal:controller.signal})});
   const examples=(result.observations||[]).filter(x=>x.candidate).slice(0,3)
    .map(x=>({signature:x.signature,mint:x.candidate.mint,side:x.candidate.side,
      quoteMint:x.candidate.quoteMint,quoteUnits:x.candidate.quoteUnits,
      confirmed:false,basisKnown:false}));
   wallets.push({wallet:candidate.wallet,handleClaim:candidate.handle,
    status:result.enabled?'BOUNDED_SAMPLE_COMPLETE':result.reason,
    signaturesObserved:result.signaturesObserved??0,
    inspected:result.transactionsInspected??0,tradeCandidates:result.candidateTrades??0,
    sourceExhausted:result.sourceExhausted??false,listingError:result.listingError??false,
    fetchFailures:result.fetchFailures??0,coverageComplete:false,realizedPnlUsd:null,examples});
  }
  console.log('TRADER_RADAR_HISTORICAL_RESEARCH',JSON.stringify({
   snapshotDate:snapshot.observedAt,mode:'MANUAL_READ_ONLY_RESEARCH',wallets,
   verifiedTraderProfiles:0,verifiedRealizedPnlWallets:0,
   qualifiedConvergenceSignals:0,productionAffected:false,
   caveat:'Potential USDC/USDT opposing deltas are preliminary, not certified fills; sample is incomplete, no PnL or predictive alpha established.'}));
 }catch(e){console.error('TRADER_RADAR_HISTORICAL_FAILED',e?.name||'Error');process.exitCode=1;}
 finally{clearTimeout(timeout);}
}
