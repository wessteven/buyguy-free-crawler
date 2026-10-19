// Protocol-specific Raydium CPMM pool vault verifier (read-only).
// Source: Raydium cp-swap PoolState fields: eight-byte Anchor discriminator,
// 10 consecutive packed pubkeys, beginning with amm_config at offset 8.
// Mainnet program is pinned to its official declare_id.
// This does NOT verify LP-token locks, token economics, owner identity or exit ability.
import {SPL_TOKEN,TOKEN_2022} from './token-risk.mjs';
export const RAYDIUM_CPMM='CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C';
export const RAYDIUM_DISCRIMINATOR=[247,237,227,245,215,195,222,70]; // sha256("account:PoolState")[0..7]
const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const pubkey=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const PUBKEY_LEN=32,POOL_LEN=637;
export function toBase58(bytes){
 if(!(bytes instanceof Uint8Array)||bytes.length!==PUBKEY_LEN)throw Error('Not a public key');
 let num=0n;
 for(const byte of bytes)num=(num<<8n)|BigInt(byte);
 let result='';
 while(num>0n){result=alphabet[Number(num%58n)]+result;num/=58n}
 for(let i=0;i<bytes.length&&bytes[i]===0;i++)result='1'+result;
 return result;
}
function base64Bytes(value){
 if(typeof value!=='string'||value.length>4096||!/^[A-Za-z0-9+/]+={0,2}$/.test(value))return null;
 try{const binary=atob(value);
  return Uint8Array.from(binary,ch=>ch.charCodeAt(0))
 }catch{return null}
}
export function decodeRaydiumCpmmPool(pool,account){
 const result={pool,protocol:'RAYDIUM_CPMM',program:RAYDIUM_CPMM,status:'UNVERIFIED',
  vaultsVerified:false,lpLockVerified:false,flags:[]};
 if(!pubkey.test(pool||'')||account?.owner!==RAYDIUM_CPMM||
    account.executable===true){result.flags.push('POOL_PROGRAM_NOT_RAYDIUM_CPMM');return result}
 const source=account?.data;
 const bytes=base64Bytes(Array.isArray(source)?source[0]:null);
 if(!bytes||bytes.length!==POOL_LEN){result.flags.push('POOL_LAYOUT_UNKNOWN');return result}
 if(!RAYDIUM_DISCRIMINATOR.every((n,i)=>bytes[i]===n)){
   result.flags.push('POOL_DISCRIMINATOR_MISMATCH');return result;
 }
 const read=index=>toBase58(bytes.slice(8+index*32,8+(index+1)*32));
 const fields={
  ammConfig:read(0),poolCreator:read(1),token0Vault:read(2),token1Vault:read(3),
  lpMint:read(4),token0Mint:read(5),token1Mint:read(6),
  token0Program:read(7),token1Program:read(8),observation:read(9)};
 if(fields.token0Mint===fields.token1Mint||fields.token0Vault===fields.token1Vault||
   ![SPL_TOKEN,TOKEN_2022].includes(fields.token0Program)||
   ![SPL_TOKEN,TOKEN_2022].includes(fields.token1Program)){
   result.flags.push('POOL_MINT_OR_PROGRAM_INVALID');return result;
 }
 const status=bytes[329];
 if(status>7){result.flags.push('UNEXPECTED_POOL_STATUS');return result}
 return {...result,...fields,poolStatus:status,status:'CPMM_LAYOUT_VERIFIED',
   swapsEnabled:(status&4)===0,withdrawalsEnabled:(status&2)===0};
}
export function verifyRaydiumVaults(decoded,accounts,targetMint){
 const result={...decoded,status:'VAULTS_UNVERIFIED',vaultsVerified:false,
  lpLockVerified:false,verifiedVaults:[],flags:[...(decoded?.flags||[])]};
 if(decoded?.status!=='CPMM_LAYOUT_VERIFIED'||
   ![decoded.token0Mint,decoded.token1Mint].includes(targetMint)||
   !Array.isArray(accounts)||accounts.length!==3){
   result.flags.push('TARGET_OR_POOL_IDENTITY_MISMATCH');return result;
 }
 const expected=[
  [decoded.token0Vault,decoded.token0Mint,decoded.token0Program],
  [decoded.token1Vault,decoded.token1Mint,decoded.token1Program]
 ];
 let sharedAuthority=null;
 for(let i=0;i<2;i++){
  const [vault,mint,program]=expected[i],acc=accounts[i];
  const info=acc?.data?.parsed?.info;
  if(acc?.owner!==program||acc?.data?.parsed?.type!=='account'||
    info?.mint!==mint||!pubkey.test(info?.owner||'')||
    !/^\d+$/.test(info?.tokenAmount?.amount||'')){
    result.flags.push('VAULT_ACCOUNT_MINT_OR_PROGRAM_MISMATCH');return result;
  }
  if(sharedAuthority!==null&&sharedAuthority!==info.owner){
    result.flags.push('VAULT_AUTHORITY_MISMATCH');return result;
  }
  sharedAuthority=info.owner;
  result.verifiedVaults.push(vault);
 }
 const lp=accounts[2];
 if(lp?.owner!==SPL_TOKEN&&lp?.owner!==TOKEN_2022){
  result.flags.push('LP_MINT_PROGRAM_UNKNOWN');return result;
 }
 const lpInfo=lp?.data?.parsed;
 if(lpInfo?.type!=='mint'||lpInfo?.info?.isInitialized!==true){
  result.flags.push('LP_MINT_NOT_VERIFIED');return result;
 }
 const lpSupply=lpInfo.info.supply;
 if(typeof lpSupply!=='string'||!/^\d+$/.test(lpSupply)){
  result.flags.push('LP_SUPPLY_UNAVAILABLE');return result;
 }
 return {...result,status:'POOL_VAULTS_VERIFIED',vaultsVerified:true,
    lpMint:decoded.lpMint,lpSupplyRaw:lpSupply,
    vaultAuthority:sharedAuthority,
    caveat:'Official Raydium pool account and vault mints/programs verified; LP mint supply does not show who controls or can withdraw liquidity. No lock or custody expiry was established.'};
}
async function rpc(url,method,params,fetcher){
 if(typeof url!=='string'||!url.startsWith('https://'))throw Error('Private Solana RPC missing');
 const response=await fetcher(url,{method:'POST',headers:{'content-type':'application/json'},
   body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});
 if(!response.ok)throw Error('Helius pool RPC status '+response.status);
 const json=await response.json();
 if(json?.error||!json?.result)throw Error('Helius pool RPC unavailable');
 return json.result;
}
export async function inspectRaydiumCpmmPool(pool,targetMint,rpcEndpoint,fetcher=fetch){
 if(!pubkey.test(pool||'')||!pubkey.test(targetMint||''))throw Error('Invalid exact Solana address');
 const state=await rpc(rpcEndpoint,'getAccountInfo',[pool,
  {encoding:'base64',commitment:'confirmed'}],fetcher);
 const decoded=decodeRaydiumCpmmPool(pool,state.value);
 if(decoded.status!=='CPMM_LAYOUT_VERIFIED')return decoded;
 if(![decoded.token0Mint,decoded.token1Mint].includes(targetMint))
   return {...decoded,status:'TOKEN_NOT_IN_POOL',flags:['TARGET_TOKEN_NOT_IN_POOL']};
 const accounts=await rpc(rpcEndpoint,'getMultipleAccounts',[
  [decoded.token0Vault,decoded.token1Vault,decoded.lpMint],
  {encoding:'jsonParsed',commitment:'confirmed'}],fetcher);
 return verifyRaydiumVaults(decoded,accounts?.value,targetMint);
}
