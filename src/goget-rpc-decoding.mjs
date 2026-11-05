// GOGET raw transaction decoding is DERIVED historical/forensic enrichment.
// The separate 5-minute signature collector remains the only forward source.
// Never infer a purchase, successful trade, as-of signal, or wallet signer from
// the existence of an RPC address reference.
import {GAP_WALLETS} from './goget-wallet-gap-wave.mjs';
export const DECODE_BOUNDS=Object.freeze({
 originalWallets:3,costPerArchivalTransaction:10,runCalls:3,
 perUtcDayCredits:300,sharedRpcCredits:9000,localCombinedCredits:20000,
 forwardFiveMinuteCredits:30,maxRawResponseBytes:350000,maxAccounts:256,
 maxTokenChanges:18,stopUtc:'2026-11-08T00:00:00Z',
 maxD1Queries:48,maxAttempts:3,backoffMinutes:120,trades:0
});
export const validSig=s=>typeof s==='string'&&/^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(s);
export const validWallet=w=>GAP_WALLETS.includes(w);
export function reservedForRemainingForwardCycles(now){
 if(!Number.isSafeInteger(now)||now<0)throw Error('DECODE_TIME_INVALID');
 const end=Date.parse(new Date(now).toISOString().slice(0,10)+'T00:00:00Z')+86400000;
 return Math.ceil((end-now)/300000)*DECODE_BOUNDS.forwardFiveMinuteCredits;
}
export function allowedDecoderReservation({now,rpcReserved,webhookEstimated,decodedReserved,armed}){
 const l=DECODE_BOUNDS,vars=[now,rpcReserved,webhookEstimated,decodedReserved];
 if(vars.some(x=>!Number.isSafeInteger(x)||x<0))throw Error('DECODE_BUDGET_INVALID');
 const future=reservedForRemainingForwardCycles(now);
 return armed===true&&now<Date.parse(l.stopUtc)&&
  decodedReserved+l.costPerArchivalTransaction<=l.perUtcDayCredits&&
  rpcReserved+l.costPerArchivalTransaction+future<=l.sharedRpcCredits&&
  rpcReserved+webhookEstimated+l.costPerArchivalTransaction<=l.localCombinedCredits;
}
const cleanPubkey=x=>{
 const s=typeof x==='string'?x:x?.pubkey;
 return typeof s==='string'&&/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s)?s:null;
};
export function inspectExactTransaction(value,source,{retrievedAt}){
 if(!validWallet(source?.wallet)||!validSig(source?.signature)||
  !Number.isSafeInteger(source?.slot)||source.slot<=0||![0,1].includes(source?.failed)||
  !Number.isFinite(Date.parse(retrievedAt)))throw Error('DECODE_SOURCE_IDENTITY_INVALID');
 if(!value||typeof value!=='object')throw Error('DECODE_PROVIDER_NOT_FOUND');
 if(value.slot!==source.slot)throw Error('DECODE_SLOT_MISMATCH');
 if(!Array.isArray(value.transaction?.signatures)||
  value.transaction.signatures[0]!==source.signature)
  throw Error('DECODE_SIGNATURE_MISMATCH');
 if(!value.meta||typeof value.meta!=='object'||
  Number(value.meta.err!==null)!==source.failed)throw Error('DECODE_CHAIN_STATUS_MISMATCH');
 const keys=value.transaction?.message?.accountKeys;
 if(!Array.isArray(keys)||keys.length<1||keys.length>DECODE_BOUNDS.maxAccounts)
  throw Error('DECODE_ACCOUNT_KEYS_INVALID');
 const accounts=keys.map(cleanPubkey);
 if(accounts.some(x=>!x)||new Set(accounts).size!==accounts.length)
  throw Error('DECODE_ACCOUNTS_UNVERIFIED');
 const signerIndex=keys.findIndex(x=>cleanPubkey(x)===source.wallet&&x?.signer===true);
 const walletListed=accounts.includes(source.wallet);
 const feePayer=accounts[0];
 const programs=new Set(),addProgram=(p)=>{const value=cleanPubkey(p);if(value)programs.add(value);};
 for(const ix of value.transaction.message.instructions||[]){
  if(ix?.programId)addProgram(ix.programId);
  else if(Number.isSafeInteger(ix?.programIdIndex))addProgram(accounts[ix.programIdIndex]);
 }
 for(const entry of value.meta.innerInstructions||[]){
  for(const ix of entry?.instructions||[]){
   if(ix?.programId)addProgram(ix.programId);
   else if(Number.isSafeInteger(ix?.programIdIndex))addProgram(accounts[ix.programIdIndex]);
  }
 }
 const balances=value.meta?.postTokenBalances||[],pre=value.meta?.preTokenBalances||[];
 const changed=[];
 // This is balance accounting, not attribution of a swap or buyer identity.
 for(const row of balances.slice(0,DECODE_BOUNDS.maxTokenChanges)){
  if(row?.owner!==source.wallet||typeof row?.mint!=='string')continue;
  const match=pre.find(x=>x?.accountIndex===row.accountIndex&&x?.mint===row.mint);
  const after=Number(row.uiTokenAmount?.uiAmount),before=Number(match?.uiTokenAmount?.uiAmount??0);
  if(Number.isFinite(after)&&Number.isFinite(before))
   changed.push({mint:row.mint,delta:after-before,accountIndex:row.accountIndex,
    evidence:'PARSED_OWNER_BALANCE_DELTA_NOT_TRADE'});
 }
 return {
  wallet:source.wallet,signature:source.signature,slot:source.slot,
  sourceRecordedAt:source.observed_at??null,retrievedAt,
  chainFailed:source.failed===1,
  status:source.failed===1?'DECODED_CHAIN_FAILED':'DECODED_RAW_UNCLASSIFIED',
  walletAccountReferenced:walletListed,walletSignerConfirmed:signerIndex>=0,
  feePayer,feePayerIsWatchedWallet:feePayer===source.wallet,
  accountCount:accounts.length,uniqueProgramIds:[...programs].slice(0,20),
  tokenBalancesChanged:changed,
  independentlyVerifiedBuy:false,executionPriceUsd:null,
  rawSource:'HELIUS_GET_TRANSACTION_RPC_ARCHIVAL',historicalRetrospective:true,
  tradeEligible:false
 };
}
export function assertExactSourceRoster(rows){
 if(!Array.isArray(rows)||rows.length!==3||new Set(rows.map(x=>x.wallet)).size!==3||
  rows.some(x=>!validWallet(x.wallet)))throw Error('DECODE_ALL_THREE_SOURCES_REQUIRED');
 return rows;
}
