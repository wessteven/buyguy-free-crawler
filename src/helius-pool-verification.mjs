// Opt-in, bounded Solana pool-account verification. No D1 writes or trading.
// Pool state verification is not proof of new creation, locked liquidity or safety.
import {PUMPSWAP,decodePumpSwapPool,inspectPumpSwapPool} from './pumpswap.mjs';
import {RAYDIUM_CPMM,decodeRaydiumCpmmPool,inspectRaydiumCpmmPool} from './raydium-cpmm.mjs';
const addressRE=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const protocols={PUMPSWAP:{program:PUMPSWAP,decode:decodePumpSwapPool,inspect:inspectPumpSwapPool},
 RAYDIUM_CPMM:{program:RAYDIUM_CPMM,decode:decodeRaydiumCpmmPool,inspect:inspectRaydiumCpmmPool}};
export async function verifyHeliusPoolLeads(env,{leads=[],targetMint=null,fetcher=fetch}={}){
 if(!env?.HELIUS_RPC_URL)return {enabled:false,reason:'RPC_NOT_CONFIGURED',results:[]};
 if(targetMint!==null&&!addressRE.test(targetMint))throw Error('Invalid target mint');
 const unique=new Map();
 for(const lead of leads){
  if(!protocols[lead?.protocol]||!addressRE.test(lead?.pool||''))continue;
  unique.set(lead.protocol+':'+lead.pool,{protocol:lead.protocol,pool:lead.pool});
  if(unique.size>=3)break;
 }
 const results=[];
 for(const lead of unique.values()){
  const p=protocols[lead.protocol];
  try{
   const response=await fetcher(env.HELIUS_RPC_URL,{method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({jsonrpc:'2.0',id:1,method:'getAccountInfo',
     params:[lead.pool,{encoding:'base64',commitment:'confirmed'}]})});
   if(!response.ok){results.push({...lead,status:'RPC_HTTP_ERROR',httpStatus:response.status,verified:false});continue;}
   const payload=await response.json();
   if(payload?.error||!payload?.result?.value){
    results.push({...lead,status:'ACCOUNT_UNAVAILABLE',verified:false});continue;
   }
   const account=payload.result.value;
   if(account.owner!==p.program){
    results.push({...lead,status:'PROGRAM_OWNER_MISMATCH',verified:false,
     ownerMatchesExpected:false,layoutVerified:false});continue;
   }
   const decoded=p.decode(lead.pool,account);
   const layoutOk=decoded.status===(lead.protocol==='PUMPSWAP'?'PUMPSWAP_LAYOUT_VERIFIED':'CPMM_LAYOUT_VERIFIED');
   if(!layoutOk){results.push({...lead,status:decoded.status,verified:false,
    ownerMatchesExpected:true,layoutVerified:false});continue;}
   if(targetMint){
    const checked=await p.inspect(lead.pool,targetMint,env.HELIUS_RPC_URL,fetcher,{prefetchedAccount:account});
    results.push({...lead,status:checked.status,verified:checked.status==='POOL_VAULTS_VERIFIED',
     poolAccountVerified:true,ownerMatchesExpected:true,layoutVerified:true,mintMatched:!['TOKEN_NOT_IN_POOL','MINT_NOT_IN_PUMPSWAP_POOL'].includes(checked.status)});
   }else{
    results.push({...lead,status:'POOL_ACCOUNT_LAYOUT_VERIFIED',verified:false,
     poolAccountVerified:true,ownerMatchesExpected:true,layoutVerified:true,mintMatched:null});
   }
  }catch(error){results.push({...lead,status:'VERIFICATION_ERROR',verified:false,
    errorType:error?.name||'Error'});}
 }
 return {enabled:true,source:'Helius Solana RPC',checked:results.length,results,
  caveat:'Account layout does not prove a new launch or safety. Full verification requires exact mint and reserve checks.'};
}
