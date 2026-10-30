// Live Solana WATCH-ONLY research sensor. No executable trade signal, no credentials, no orders.
// A referenced program/deployer is not automatically the signer/trader.
// All labels are observational; never forward this output as VERIFIED_SWAP.
import {PUMPSWAP,PUMP_BONDING_CURVE} from './pumpswap.mjs';

export const WATCH_LIMITS=Object.freeze({maxWallets:3, signaturesPerWallet:16,
  decodePerWallet:2, maxDecodesPerRun:6, maxAgeSeconds:1800});
export const WSOL='So11111111111111111111111111111111111111112';
const address=s=>typeof s==='string'&&/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s);
const signature=s=>typeof s==='string'&&/^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(s);
const num=x=>typeof x==='number'&&Number.isFinite(x);
function rawOf(v) {
  if(!v||typeof v.uiTokenAmount?.amount!=='string'||!/^\d+$/.test(v.uiTokenAmount.amount)||
    !Number.isInteger(v.uiTokenAmount.decimals)||v.uiTokenAmount.decimals<0||v.uiTokenAmount.decimals>18)return null;
  return {raw:BigInt(v.uiTokenAmount.amount),decimals:v.uiTokenAmount.decimals};
}
function tokenMap(balances,wallet) {
  const map=new Map(),unknown=[];
  for(const b of Array.isArray(balances)?balances:[]){
    if(b?.owner===undefined||b?.owner===null) {unknown.push('TOKEN_OWNER_MISSING');continue;}
    if(b.owner!==wallet)continue;
    const val=rawOf(b);
    if(!address(b.mint)||!val){unknown.push('TOKEN_AMOUNT_INVALID');continue;}
    const old=map.get(b.mint)||{raw:0n,decimals:val.decimals};
    if(old.decimals!==val.decimals){unknown.push('MINT_DECIMALS_CONFLICT');continue;}
    map.set(b.mint,{raw:old.raw+val.raw,decimals:val.decimals});
  }
  return {map,partial:unknown.length>0};
}

function programIds(tx) {
  const keys=(tx?.transaction?.message?.accountKeys||[]).map(a=>typeof a==='string'?a:a?.pubkey);
  const set=new Set();
  const collect=ins=>{
    for(const i of ins||[]) {
      const p=typeof i?.programId==='string'?i.programId:keys[i?.programIdIndex];
      if(address(p))set.add(p);
    }
  };
  collect(tx?.transaction?.message?.instructions);
  for(const group of tx?.meta?.innerInstructions||[])collect(group?.instructions);
  return set;
}

// Select a bounded, descending signature window; report gaps rather than implying completeness.
export function selectWindow(raw,lastSignature,{limit=WATCH_LIMITS.decodePerWallet,baseline=false}={}) {
  if(!Array.isArray(raw))throw Error('SIGNATURES_RESPONSE_INVALID');
  const list=raw.filter(x=>signature(x?.signature)&&x.err===null);
  const head=raw.find(x=>signature(x?.signature))?.signature??null;
  const ix=lastSignature?raw.findIndex(x=>x?.signature===lastSignature):-1;
  const allNew=lastSignature?(ix>=0?raw.slice(0,ix):raw):raw;
  const count=allNew.length;
  const selected=allNew.filter(x=>signature(x?.signature)&&x.err===null)
    .slice(0,Math.max(0,limit));
  return {head,selected,observedCount:count,
    gap:!!lastSignature&&ix<0&&raw.length>=WATCH_LIMITS.signaturesPerWallet,
    truncated:count>selected.length,baseline:baseline||!lastSignature};
}

export function classifyObservedTransaction({wallet,signature:txsig,tx,observedAt,baseline=false}) {
  const base={wallet,signature:txsig,observedAt,source:'SOLANA_CONFIRMED_RPC',
    classification:'UNVERIFIED',tradeEligible:false,paperEligible:false,
    baseline,slot:null,blockTime:null,delayMs:null,tokenIncreases:[],programs:[],
    notes:['NOT_A_VERIFIED_WALLET_SWAP','NO_EXECUTABLE_QUOTE_OR_TRADE_PNL']};
  if(!address(wallet)||!signature(txsig)||!tx||tx?.meta?.err!==null||
    !Array.isArray(tx?.transaction?.signatures)||!tx.transaction.signatures.includes(txsig))
    return {...base,classification:'TRANSACTION_UNAVAILABLE_OR_FAILED'};
  const slot=tx.slot,blockTime=tx.blockTime;
  if(!Number.isSafeInteger(slot)||slot<=0||!Number.isSafeInteger(blockTime)||blockTime<=0)
    return {...base,classification:'SLOT_OR_TIME_UNVERIFIED'};
  const keys=tx.transaction?.message?.accountKeys;
  if(!Array.isArray(keys))return {...base,classification:'ACCOUNT_KEYS_UNVERIFIED'};
  const signer=keys.some(x=>typeof x==='object'&&x.pubkey===wallet&&x.signer===true);
  const referenced=keys.some(x=>typeof x==='string'?x===wallet:x?.pubkey===wallet);
  const dt=Date.parse(observedAt),delayMs=num(dt)?Math.max(0,dt-blockTime*1000):null;
  const base2={...base,slot,blockTime:new Date(blockTime*1000).toISOString(),delayMs};
  if(!referenced)return {...base2,classification:'WALLET_NOT_IN_TRANSACTION'};
  if(!signer)return {...base2,classification:'WALLET_REFERENCED_NOT_SIGNER'};
  const pre=tokenMap(tx.meta?.preTokenBalances,wallet),
    post=tokenMap(tx.meta?.postTokenBalances,wallet);
  const mints=new Set([...pre.map.keys(),...post.map.keys()]);
  const deltas=[];
  let partial=pre.partial||post.partial;
  for(const mint of mints){
    const before=pre.map.get(mint),after=post.map.get(mint);
    if(before&&after&&before.decimals!==after.decimals){partial=true;continue;}
    const delta=(after?.raw||0n)-(before?.raw||0n);
    if(delta>0n&&mint!==WSOL)deltas.push({mint,changeRaw:delta.toString(),decimals:(after||before).decimals});
  }
  // Only program invocation + positive owner token delta is observed. It may be
  // a compound transaction/transfer/airdrop; do NOT label it an executed buy.
  const invoked=programIds(tx);
  const protocols=[PUMPSWAP,PUMP_BONDING_CURVE].filter(x=>invoked.has(x));
  const common={...base2,tokenIncreases:deltas.slice(0,8),programs:protocols,
    notes:[...base2.notes,...(partial?['PARTIAL_TOKEN_OWNER_MAPPING']:[])]};
  if(!deltas.length)return {...common,classification:'SIGNED_TX_NO_TOKEN_INCREASE'};
  if(partial)return {...common,classification:'TOKEN_INCREASE_OWNER_MAPPING_PARTIAL'};
  if(!protocols.length)return {...common,classification:'TOKEN_INCREASE_NO_VERIFIED_AMM'};
  return {...common,classification:'AMM_INVOCATION_WITH_TOKEN_INCREASE_UNPRICED',
    notes:[...common.notes,'AMM_PROGRAM_INVOKED_BUT_EXACT_SWAP_ROUTE_UNVERIFIED']};
}
