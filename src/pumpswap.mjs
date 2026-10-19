// PumpSwap AMM exact-program pool verifier. Based on pump-fun/pump-public-docs
// idl/pump_amm.json account Pool (discriminator and initial 211-byte layout).
// Verifies pool program ownership, mint pair, LP mint and reserve token accounts.
// It NEVER asserts permanent LP burns/locks, admin safety or beneficial holder identity.
import {SPL_TOKEN,TOKEN_2022} from './token-risk.mjs';
import {toBase58} from './raydium-cpmm.mjs';
export const PUMPSWAP='pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA';
export const PUMP_BONDING_CURVE='6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';
export const PUMPSWAP_POOL_DISCRIMINATOR=[241,154,109,4,17,177,109,188];
const pubkey=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
function binary(value){
 if(typeof value!=='string'||value.length>8192||!/^[A-Za-z0-9+/]+={0,2}$/.test(value))return null;
 try{return Uint8Array.from(atob(value),ch=>ch.charCodeAt(0))}catch{return null}
}
function raw64(bytes,offset){
 let result=0n;
 for(let i=7;i>=0;i--)result=result*256n+BigInt(bytes[offset+i]);
 return result.toString();
}
export function decodePumpSwapPool(pool,account){
 const result={pool,protocol:'PUMPSWAP',status:'UNVERIFIED',vaultsVerified:false,
   lpLockVerified:false,lpSupplyGapBps:null,flags:[]};
 if(!pubkey.test(pool||'')||!account||account.executable===true){
   return {...result,flags:['INVALID_POOL_ACCOUNT']};
 }
 if(account.owner===PUMP_BONDING_CURVE){
   return {...result,protocol:'PUMP_BONDING_CURVE',status:'BONDING_CURVE_NO_LP_POOL',
     flags:['BONDING_CURVE_IS_NOT_AN_LP_POOL']};
 }
 if(account.owner!==PUMPSWAP){
   return {...result,status:'UNSUPPORTED_PROTOCOL',observedProgram:account.owner||null,
      flags:['UNSUPPORTED_POOL_PROTOCOL']};
 }
 const bytes=binary(Array.isArray(account.data)?account.data[0]:null);
 if(!bytes||bytes.length<211||bytes.length>4096)
   return {...result,flags:['POOL_LAYOUT_UNKNOWN']};
 if(!PUMPSWAP_POOL_DISCRIMINATOR.every((v,i)=>bytes[i]===v))
   return {...result,flags:['POOL_DISCRIMINATOR_MISMATCH']};
 const get=pos=>toBase58(bytes.slice(pos,pos+32));
 const index=bytes[9]|(bytes[10]<<8);
 const fields={
   poolBump:bytes[8],poolIndex:index,
   poolCreator:get(11),baseMint:get(43),quoteMint:get(75),lpMint:get(107),
   baseVault:get(139),quoteVault:get(171),lpSupplyRaw:raw64(bytes,203)};
 if(fields.baseMint===fields.quoteMint||fields.baseVault===fields.quoteVault||
   fields.baseMint==='11111111111111111111111111111111')
   return {...result,flags:['DUPLICATE_OR_DEFAULT_POOL_MINT']};
 return {...result,...fields,status:'PUMPSWAP_LAYOUT_VERIFIED'};
}
export function verifyPumpSwapVaults(poolInfo,accounts,targetMint){
 const result={...poolInfo,status:'VAULTS_UNVERIFIED',vaultsVerified:false,
   verifiedVaults:[],lpLockVerified:false,lpSupplyGapBps:null,
   flags:[...(poolInfo?.flags||[])]};
 if(poolInfo?.status!=='PUMPSWAP_LAYOUT_VERIFIED'||
   ![poolInfo.baseMint,poolInfo.quoteMint].includes(targetMint)||
   !Array.isArray(accounts)||accounts.length!==3){
   result.flags.push('POOL_MINT_OR_ACCOUNT_LIST_MISMATCH');return result;
 }
 for(const [idx,mint,vault] of [[0,poolInfo.baseMint,poolInfo.baseVault],
   [1,poolInfo.quoteMint,poolInfo.quoteVault]]){
   const account=accounts[idx],info=account?.data?.parsed?.info;
   if(![SPL_TOKEN,TOKEN_2022].includes(account?.owner)||
     account?.data?.parsed?.type!=='account'||info?.mint!==mint||
     info?.owner!==poolInfo.pool||!/^\d+$/.test(info?.tokenAmount?.amount||'')){
     result.flags.push('UNVERIFIED_POOL_VAULT');return result;
   }
   result.verifiedVaults.push(vault);
 }
 const lp=accounts[2];
 const state=lp?.data?.parsed;
 if(lp?.owner!==SPL_TOKEN||state?.type!=='mint'||
   state.info?.isInitialized!==true||!/^\d+$/.test(state.info.supply||'')){
   result.flags.push('LP_MINT_UNVERIFIED');return result;
 }
 const supplied=BigInt(poolInfo.lpSupplyRaw),minted=BigInt(state.info.supply);
 result.lpMintSupplyRaw=minted.toString();
 // The pool's recorded lp_supply can differ from current minted supply because
 // of burns/locks. This difference is NOT a verified lock percentage.
 if(supplied>0n&&supplied>=minted)
    result.lpSupplyGapBps=Number(((supplied-minted)*10000n)/supplied);
 return {...result,status:'POOL_VAULTS_VERIFIED',vaultsVerified:true,
   flags:[],caveat:'Official PumpSwap pool and both token vaults verified against on-chain mint addresses. '+
     'The recorded vs current LP supply difference is NOT evidence of lock duration or who controls outstanding LP tokens.'};
}
async function queryRpc(endpoint,method,params,fetcher){
 if(typeof endpoint!=='string'||!endpoint.startsWith('https://'))throw Error('Private Helius RPC unavailable');
 const response=await fetcher(endpoint,{method:'POST',headers:{'content-type':'application/json'},
   body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});
 if(!response.ok)throw Error('Helius PumpSwap pool HTTP '+response.status);
 const payload=await response.json();
 if(payload?.error||!payload?.result)throw Error('Helius PumpSwap RPC unavailable');
 return payload.result;
}
export async function inspectPumpSwapPool(pool,mint,rpcEndpoint,fetcher=fetch,{prefetchedAccount=null}={}){
 if(!pubkey.test(pool||'')||!pubkey.test(mint||''))throw Error('Exact Solana mint and pool required');
 const result=prefetchedAccount?{value:prefetchedAccount}:await queryRpc(rpcEndpoint,'getAccountInfo',
   [pool,{encoding:'base64',commitment:'confirmed'}],fetcher);
 const info=decodePumpSwapPool(pool,result.value);
 if(info.status!=='PUMPSWAP_LAYOUT_VERIFIED')return info;
 if(![info.baseMint,info.quoteMint].includes(mint))
   return {...info,status:'MINT_NOT_IN_PUMPSWAP_POOL',flags:['EXACT_TOKEN_POOL_MISMATCH']};
 const accounts=await queryRpc(rpcEndpoint,'getMultipleAccounts',[
   [info.baseVault,info.quoteVault,info.lpMint],
   {encoding:'jsonParsed',commitment:'confirmed'}],fetcher);
 return verifyPumpSwapVaults(info,accounts?.value,mint);
}
