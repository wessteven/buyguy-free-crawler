// Identify the exact on-chain AMM owner before selecting a protocol decoder.
// Explicit unsupported states are preferred over fake LP-lock or token-owner verdicts.
import {PUMPSWAP,PUMP_BONDING_CURVE,inspectPumpSwapPool} from './pumpswap.mjs';
import {RAYDIUM_CPMM,inspectRaydiumCpmmPool} from './raydium-cpmm.mjs';
export async function inspectPoolProtocol(pool,mint,rpcEndpoint,fetcher=fetch){
 if(!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(pool||'')||
    !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint||''))
   return {pool,status:'INVALID_POOL_OR_TOKEN_ADDRESS',vaultsVerified:false,
     lpLockVerified:false,flags:['INVALID_POOL_OR_TOKEN_ADDRESS']};
 if(typeof rpcEndpoint!=='string'||!rpcEndpoint.startsWith('https://'))
   throw Error('Private Helius RPC unavailable');
 const res=await fetcher(rpcEndpoint,{method:'POST',headers:{'content-type':'application/json'},
   body:JSON.stringify({jsonrpc:'2.0',id:1,method:'getAccountInfo',
     params:[pool,{encoding:'base64',commitment:'confirmed'}]})});
 if(!res.ok)throw Error('Pool account RPC HTTP '+res.status);
 const reply=await res.json();
 if(reply?.error)throw Error('Pool account RPC error');
 const account=reply?.result?.value;
 const program=account?.owner;
 if(program===PUMPSWAP)return inspectPumpSwapPool(pool,mint,rpcEndpoint,fetcher,
   {prefetchedAccount:account});
 if(program===RAYDIUM_CPMM)return inspectRaydiumCpmmPool(pool,mint,rpcEndpoint,fetcher,
   {prefetchedAccount:account});
 if(program===PUMP_BONDING_CURVE)return {pool,program,
   protocol:'PUMP_BONDING_CURVE',status:'BONDING_CURVE_NO_LP_POOL',
   vaultsVerified:false,lpLockVerified:false,flags:['NOT_A_GRADUATED_LP_POOL'],
   caveat:'Pump.fun bonding curve accounts have no LP mint or lock. Verify trading reserves, migration state and later PumpSwap pool separately.'};
 return {pool,program:program||null,protocol:'UNSUPPORTED',
   status:program?'UNSUPPORTED_PROTOCOL':'POOL_ACCOUNT_NOT_FOUND',
   vaultsVerified:false,lpLockVerified:false,
   flags:['UNSUPPORTED_POOL_PROTOCOL'],
   caveat:'No trusted vault decoder for this program yet; never inherit PumpSwap or Raydium LP evidence.'};
}
