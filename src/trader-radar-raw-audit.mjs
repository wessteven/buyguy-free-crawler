// Independent raw Solana RPC audit. Pure validation; no network or production imports.
import {isSolanaAddress} from './trader-radar.mjs';
const SIG=/^[1-9A-HJ-NP-Za-km-z]{80,90}$/;
const safe=x=>typeof x==='number'&&Number.isFinite(x);
const q=x=>Math.round(x*1e6)/1e6;
function rawUnits(row){
 const n=row?.uiTokenAmount?.amount,d=row?.uiTokenAmount?.decimals;
 if(typeof n!=='string'||!/^\d+$/.test(n)||!Number.isInteger(d)||d<0||d>18)return null;
 const v=BigInt(n);if(v>BigInt(Number.MAX_SAFE_INTEGER))return null;
 const amount=Number(v)/10**d;return safe(amount)?amount:null;
}
// Check actual pre/post account owner, mint and indexed account. Partial array
// coverage, contradictory account ownership and malformed quantities reject.
export function rawWalletTokenDeltas(wallet,tx){
 const reject=reason=>({status:reason,deltas:[]});
 if(!isSolanaAddress(wallet)||!tx||tx.meta?.err)return reject('FAILED_OR_MISSING');
 if(!Array.isArray(tx.meta?.preTokenBalances)||!Array.isArray(tx.meta?.postTokenBalances))
  return reject('RAW_TOKEN_BALANCES_MISSING');
 const byIndex=new Map();
 for(const [side,list] of [['pre',tx.meta.preTokenBalances],['post',tx.meta.postTokenBalances]]){
  for(const row of list){
   const v=rawUnits(row);if(!Number.isInteger(row?.accountIndex)||!isSolanaAddress(row?.mint)||
     !isSolanaAddress(row?.owner)||v===null)return reject('INVALID_RAW_TOKEN_BALANCE');
   const r=byIndex.get(row.accountIndex)||{pre:null,post:null};
   if(r[side])return reject('DUPLICATE_TOKEN_ACCOUNT_INDEX');
   r[side]={mint:row.mint,owner:row.owner,units:v};
   byIndex.set(row.accountIndex,r);
  }
 }
 const result=new Map();
 for(const pair of byIndex.values()){
  const x=pair.pre,y=pair.post;
  if(x&&y&&(x.mint!==y.mint||x.owner!==y.owner))return reject('RAW_ACCOUNT_OWNER_OR_MINT_CHANGED');
  const row=x||y;
  if(row.owner!==wallet)continue;
  const delta=(y?.units||0)-(x?.units||0);
  result.set(row.mint,(result.get(row.mint)||0)+delta);
 }
 return {status:'RAW_BALANCES_PARSED',deltas:[...result].filter(([,delta])=>Math.abs(delta)>1e-8)
  .map(([mint,delta])=>({mint,delta:q(delta)}))};
}
export function auditRawSignature(expected,tx,{toleranceRatio=0.000005}={}){
 const reject=status=>({status,corroborated:false,swapVerified:false,
  traderIdentityVerified:false,transferFundedBasisResolved:false,realizedPnlUsd:null});
 if(!isSolanaAddress(expected?.wallet)||!isSolanaAddress(expected?.mint)||
   !isSolanaAddress(expected?.quoteMint)||!SIG.test(expected?.signature||''))
  return reject('BAD_EXPECTATION');
 if(!tx||tx.meta?.err||tx.transaction?.signatures?.[0]!==expected.signature)
  return reject('MISSING_FAILED_OR_MISMATCHED_RAW_TRANSACTION');
 const t=tx.blockTime;
 if(!Number.isInteger(t)||typeof expected.at!=='string'||!Number.isFinite(Date.parse(expected.at))||
   Math.abs(t*1000-Date.parse(expected.at))>120000)return reject('TIMESTAMP_MISMATCH');
 const a=rawWalletTokenDeltas(expected.wallet,tx);
 if(a.status!=='RAW_BALANCES_PARSED')return reject(a.status);
 const observed=new Map(a.deltas.map(x=>[x.mint,x.delta]));
 const mintDelta=observed.get(expected.mint),quoteDelta=observed.get(expected.quoteMint);
 const signs=expected.side==='BUY_LIKE'?mintDelta>0&&quoteDelta<0:
  expected.side==='SELL_LIKE'?mintDelta<0&&quoteDelta>0:false;
 if(!signs||!(expected.baseUnits>0)||!(expected.quoteUnits>0))
  return reject('OPPOSING_WALLET_BALANCES_NOT_REPRODUCED');
 const within=(actual,old)=>Math.abs(Math.abs(actual)-old)<=Math.max(0.000001,old*toleranceRatio);
 if(!within(mintDelta,expected.baseUnits)||!within(quoteDelta,expected.quoteUnits))
  return reject('ENHANCED_RAW_DELTA_DISAGREEMENT');
 const keys=tx.transaction?.message?.accountKeys||[];
 const walletSigner=keys.some(x=>(typeof x==='object'&&x?.pubkey===expected.wallet&&x.signer===true));
 return {status:'RAW_BALANCE_DELTAS_CORROBORATED',corroborated:true,
  quoteMint:expected.quoteMint,mint:expected.mint,signature:expected.signature,
  walletSignerObserved:walletSigner,feeLamports:Number.isSafeInteger(tx.meta.fee)?tx.meta.fee:null,
  swapVerified:false,traderIdentityVerified:false,transferFundedBasisResolved:false,
  realizedPnlUsd:null,
  caveat:'Raw token balance deltas corroborate token movements only; they do not independently prove purpose, fill execution, all-history purchase basis or fees valued in USD.'};
}
