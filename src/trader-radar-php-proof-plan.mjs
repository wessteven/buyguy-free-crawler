// PHP token evidence assembled from the dated research journal (not live orders).
// Every row remains provisional until independently audited; no PnL claims.
import {isSolanaAddress} from './trader-radar.mjs';
const SIG=/^[1-9A-HJ-NP-Za-km-z]{80,90}$/;
export const SOLANA_USDC='EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
export function buildPhpRawAuditPlan(journal,{maxEvents=7}={}){
 const s=journal?.walletClaims?.php;
 if(!s||!isSolanaAddress(s.wallet)||!isSolanaAddress(s.mint))throw Error('INVALID_PHP_JOURNAL_IDENTITY');
 const buys=s.acquisitionEvents,sells=s.disposalEvents;
 if(!Array.isArray(buys)||buys.length!==5||!Array.isArray(sells)||sells.length!==2)
  throw Error('INCOMPLETE_OR_DUPLICATE_PHP_JOURNAL');
 const seen=new Set();
 const rows=[...buys.map(x=>({...x,side:'BUY_LIKE'})),...sells.map(x=>({...x,side:'SELL_LIKE'}))];
 for(const row of rows){
  if(!SIG.test(row.signature||'')||seen.has(row.signature)||
   !Number.isFinite(Date.parse(row.at||''))||typeof row.tokenUnits!=='number'||!(row.tokenUnits>0)||
   typeof row.usdcUnits!=='number'||!(row.usdcUnits>0))throw Error('INVALID_PHP_PROOF_EVENT');
  seen.add(row.signature);
 }
 rows.sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));
 const events=rows.slice(0,Math.max(1,Math.min(7,Math.floor(maxEvents)||7))).map((e,i)=>({
  label:'PHP_'+(e.side==='BUY_LIKE'?'BUY':'SELL')+'_'+String(i+1).padStart(2,'0'),
  wallet:s.wallet,mint:s.mint,quoteMint:SOLANA_USDC,signature:e.signature,
  at:e.at,side:e.side,baseUnits:e.tokenUnits,quoteUnits:e.usdcUnits
 }));
 return {source:'DATED_RESEARCH_JOURNAL',events,expectedTotal:7,
  complete:events.length===7,verifiedRealizedPnlUsd:null,independentOwnerVerified:false,
  caveat:'Journal entries are candidate balance movements; raw matching does not establish costs, beneficial owner or trader profit.'};
}
