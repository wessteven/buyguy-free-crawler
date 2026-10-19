// Read-only Solana owner clustering and pool-account probe.
// Cannot establish LP locks, beneficial human owners or sellability.
import {SPL_TOKEN,TOKEN_2022} from './token-risk.mjs';
import {inspectPoolProtocol} from './pool-protocol.mjs';
const b58=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
async function rpcCall(url,method,params,fetcher){
 if(!/^https:\/\//.test(url||''))throw Error('Secure Helius RPC absent');
 const res=await fetcher(url,{method:'POST',headers:{'content-type':'application/json'},
   body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});
 if(!res.ok)throw Error('Solana RPC HTTP '+res.status);
 const payload=await res.json();
 if(payload?.error)throw Error('Solana RPC returned JSON error');
 return payload?.result;
}
export function ownerClusterSample(mint,largestResult,accountsResult,{verifiedPool=null}={}){
 const result={verifier:'buyguy-owner-sample-v1',mint,status:'UNAVAILABLE',
    uniqueAuthorityCount:null,largestAuthoritySampleBps:null,sampledTokenAccounts:0,
    flags:[],beneficialOwnersVerified:false,vaultsExcluded:false,
    excludedVaultAccounts:0,nonVaultAuthorityCount:null,
    largestNonVaultAuthoritySampleBps:null,
    caveat:'Only largest token accounts sampled. AMM vaults, custodians and multisig groups may masquerade as holders.'};
 const largest=largestResult?.value,accounts=accountsResult?.value;
 if(!b58.test(mint)||!Array.isArray(largest)||!Array.isArray(accounts)||
    !largest.length||largest.length>20||largest.length!==accounts.length){
   result.flags.push('MISSING_OR_MISMATCHED_TOKEN_ACCOUNTS');return result;
 }
 const grouped=new Map();let total=0n;
 const approved=verifiedPool?.status==='POOL_VAULTS_VERIFIED'&&verifiedPool.vaultsVerified===true&&
   [verifiedPool.token0Mint,verifiedPool.token1Mint].includes(mint)&&
   Array.isArray(verifiedPool.verifiedVaults)&&verifiedPool.verifiedVaults.length===2?
   new Set(verifiedPool.verifiedVaults):null;
 for(let i=0;i<largest.length;i++){
   const token=largest[i],state=accounts[i],info=state?.data?.parsed?.info;
   if(!b58.test(token?.address||'')||!b58.test(info?.owner||'')||
     info?.mint!==mint||state?.data?.parsed?.type!=='account'||
     ![SPL_TOKEN,TOKEN_2022].includes(state?.owner)){
      result.flags.push('UNRESOLVED_TOKEN_ACCOUNT_OWNER');return result;
   }
   let amount;try{if(!/^\d+$/.test(token.amount||''))throw Error('invalid');
     amount=BigInt(token.amount);
   }catch{result.flags.push('INVALID_TOKEN_ACCOUNT_BALANCE');return result}
   if(amount<0n){result.flags.push('NEGATIVE_TOKEN_ACCOUNT_BALANCE');return result}
   const fromRpc=info?.tokenAmount?.amount;
   if(typeof fromRpc==='string'&&fromRpc!==token.amount){
     result.flags.push('ACCOUNT_BALANCE_MISMATCH');return result;
   }
   if(approved?.has(token.address)){
     result.excludedVaultAccounts++;
   }else{
     grouped.set(info.owner,(grouped.get(info.owner)||0n)+amount);
     total+=amount;
   }
 }
 if(total<=0n){result.flags.push('NO_NONVAULT_ACCOUNT_BALANCE');return result}
 const amounts=[...grouped.values()].sort((a,b)=>a>b?-1:a<b?1:0);
 result.uniqueAuthorityCount=amounts.length;
 result.nonVaultAuthorityCount=amounts.length;
 result.sampledTokenAccounts=largest.length;
 result.largestAuthoritySampleBps=Number((amounts[0]*10000n)/total);
 result.largestNonVaultAuthoritySampleBps=result.largestAuthoritySampleBps;
 result.vaultsExcluded=Boolean(approved)&&result.excludedVaultAccounts>0;
 result.status=result.vaultsExcluded?'OWNER_SAMPLE_VAULTS_EXCLUDED':'OWNER_SAMPLE_OBSERVED';
 result.caveat='Sample of largest token accounts, NOT all circulating supply or known ultimate owners; '+
   (result.vaultsExcluded?result.excludedVaultAccounts+' pool token vault(s) were identified using official Raydium CPMM state and excluded. ':'')+
   'Multiple accounts may share one controller; no green approval.';
 return result;
}
export async function probeLargestOwnerAccounts(mint,rpcEndpoint,fetcher=fetch,{verifiedPool=null}={}){
 if(!b58.test(mint))throw Error('Invalid Solana mint');
 const largest=await rpcCall(rpcEndpoint,'getTokenLargestAccounts',[mint,{commitment:'confirmed'}],fetcher);
 const addresses=largest?.value?.map(x=>x.address)||[];
 if(!addresses.length||addresses.length>20)throw Error('Largest token accounts unavailable');
 const states=await rpcCall(rpcEndpoint,'getMultipleAccounts',[addresses,
   {encoding:'jsonParsed',commitment:'confirmed'}],fetcher);
 return ownerClusterSample(mint,largest,states,{verifiedPool});
}
export async function probePoolProgram(pool,rpcEndpoint,fetcher=fetch){
 if(!b58.test(pool||''))return {status:'NO_SOLANA_POOL_ACCOUNT',pool,
   controlsVerified:false,lpLockVerified:false};
 const state=await rpcCall(rpcEndpoint,'getAccountInfo',[pool,
   {encoding:'base64',commitment:'confirmed'}],fetcher);
 const data=state?.value;
 return {status:data?.owner?'POOL_ACCOUNT_OBSERVED':'POOL_ACCOUNT_NOT_FOUND',
  pool,program:data?.owner||null,executable:data?.executable===true,
  controlsVerified:false,lpLockVerified:false,
  caveat:'Pool account program alone does not verify reserves, LP custody, admin controls or unlock time.'};
}
export async function runGreenProbes(env,{now=new Date().toISOString(),limit=1,fetcher=fetch}={}){
 if(!env?.DB)throw Error('D1 binding unavailable');
 if(!env.HELIUS_RPC_URL)return {enabled:false,checked:0};
 const cutoff=new Date(Date.parse(now)-6*3600000).toISOString();
 const query="SELECT a.asset_key,a.address,a.pool FROM assets a "+
   "WHERE a.chain='solana' AND a.status IN ('ALIVE','STATIC') "+
   "AND a.risk_status='PARTIAL_ONCHAIN_REVIEW' AND a.liquidity>=50000 "+
   "AND a.pool IS NOT NULL "+
   "AND NOT EXISTS(SELECT 1 FROM research_events e WHERE e.asset_key=a.asset_key "+
   "AND e.kind='OWNER_CLUSTER_PROBE' AND e.at>?) "+
   "ORDER BY a.pinned DESC,a.score DESC LIMIT ?";
 const list=(await env.DB.prepare(query)
   .bind(cutoff,Math.max(1,Math.min(2,limit))).all()).results||[];
 let checked=0,failed=0;
 for(const asset of list){
   let owner={status:'OWNER_RPC_UNAVAILABLE',beneficialOwnersVerified:false,vaultsExcluded:false};
   let pool={status:'POOL_RPC_UNAVAILABLE',controlsVerified:false,lpLockVerified:false};
   try{pool=await inspectPoolProtocol(asset.pool,asset.address,env.HELIUS_RPC_URL,fetcher)}
   catch{failed++}
   try{owner=await probeLargestOwnerAccounts(asset.address,env.HELIUS_RPC_URL,fetcher,
      {verifiedPool:pool?.vaultsVerified?pool:null})}
   catch{failed++}
   // Persist compact, complete JSON. Never truncate a JSON string mid-field.
   const proof={
     assetKey:asset.asset_key,checkedAt:now,verifier:owner.verifier||null,
     status:owner.status,uniqueAuthorityCount:owner.uniqueAuthorityCount??null,
     nonVaultAuthorityCount:owner.nonVaultAuthorityCount??null,
     largestNonVaultAuthoritySampleBps:owner.largestNonVaultAuthoritySampleBps??null,
     sampledTokenAccounts:owner.sampledTokenAccounts??0,
     excludedVaultAccounts:owner.excludedVaultAccounts??0,
     vaultsExcluded:owner.vaultsExcluded===true,
     beneficialOwnersVerified:false,flags:owner.flags||[],
     caveat:'Top token-account sample only; wallet-owner identities and other LP/custodial vaults unverified.'
   };
   const poolProof={
     assetKey:asset.asset_key,chain:'solana',checkedAt:now,
     verifier:'buyguy-pool-program-v2',
     status:pool.status,protocol:pool.protocol||null,
     program:pool.program||null,observedProgram:pool.observedProgram||null,
     lpMint:pool.lpMint||null,lpSupplyRaw:pool.lpSupplyRaw||null,
     lpSupplyGapBps:pool.lpSupplyGapBps??null,
     pool:asset.pool,token0Mint:pool.token0Mint||null,token1Mint:pool.token1Mint||null,
     verifiedVaults:pool.vaultsVerified===true?pool.verifiedVaults:[],
     vaultsVerified:pool.vaultsVerified===true,lpLockVerified:false,
     swapsEnabled:pool.swapsEnabled===true,
     flags:pool.flags||[],
     caveat:'Verifies identity of Raydium CPMM pool/vaults where supported. LP lock, ownership and admin safety NOT verified.'
   };
   await env.DB.batch([
     env.DB.prepare("INSERT INTO research_events(at,asset_key,kind,note) VALUES(?,?,'OWNER_CLUSTER_PROBE',?)")
       .bind(now,asset.asset_key,JSON.stringify(proof)),
     env.DB.prepare("INSERT INTO research_events(at,asset_key,kind,note) VALUES(?,?,'POOL_IDENTITY_PROBE',?)")
       .bind(now,asset.asset_key,JSON.stringify(poolProof))
   ]);
   checked++;
 }
 return {enabled:true,checked,failed,fullGreenApprovals:0,lpLocksVerified:0};
}
