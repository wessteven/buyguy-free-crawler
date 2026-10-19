// Conservative historical Pump migrate/migrate_v2 transaction proof.
// Read-only Helius RPC, at most one small signature page and six TX reads.
// NEVER infer an instruction from a pool's LP supply or ticker.
import {base58Pubkey,findPda} from './pump-migration.mjs';
import {PUMP_BONDING_CURVE} from './pumpswap.mjs';
const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const enc=new TextEncoder();
export function decodeB58(value){
 if(typeof value!=='string'||!value.length||value.length>512)return null;
 let n=0n,z=0;
 for(const c of value){const index=alphabet.indexOf(c);if(index<0)return null;n=58n*n+BigInt(index)}
 for(const c of value){if(c!=='1')break;z++}
 const body=[];
 while(n){body.unshift(Number(n%256n));n>>=8n}
 return Uint8Array.from([...Array(z).fill(0),...body]);
}
const eq=(a,b)=>a?.length===b?.length&&a.every((x,i)=>x===b[i]);
export async function migrationDiscriminators(){
 const out=[];
 for(const name of ['migrate','migrate_v2']){
   const hashed=new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode('global:'+name)));
   out.push({name,bytes:hashed.slice(0,8)});
 }
 return out;
}
export async function deriveBondingCurve(mint){
 const key=base58Pubkey(mint);
 if(!key)throw Error('Invalid Solana mint');
 return findPda([enc.encode('bonding-curve'),key],PUMP_BONDING_CURVE);
}
export function matchMigrationTx(transaction,{pool,mint,bondingCurve,discriminators}){
 const m=transaction?.transaction?.message,meta=transaction?.meta;
 if(!m||!meta||meta.err!==null||!Array.isArray(m.instructions))return null;
 const keys=[...(m.accountKeys||[]),...(meta.loadedAddresses?.writable||[]),
   ...(meta.loadedAddresses?.readonly||[])].map(x=>typeof x==='string'?x:x?.pubkey);
 if(!keys.includes(pool)||!keys.includes(mint)||!keys.includes(bondingCurve))return null;
 for(const ix of m.instructions){
   if(keys[ix?.programIdIndex]!==PUMP_BONDING_CURVE)continue;
   const txAccounts=(ix.accounts||[]).map(index=>keys[index]);
   if(![pool,mint,bondingCurve].every(x=>txAccounts.includes(x)))continue;
   const data=decodeB58(ix.data);
   if(!data||data.length<8)continue;
   const result=discriminators.find(x=>eq(data.slice(0,8),x.bytes));
   if(result)return {kind:result.name,slot:transaction.slot??null,
     blockTime:transaction.blockTime??null};
 }
 return null;
}
async function rpc(endpoint,method,params,fetcher){
 if(typeof endpoint!=='string'||!endpoint.startsWith('https://'))throw Error('Private RPC required');
 const response=await fetcher(endpoint,{method:'POST',
   headers:{'content-type':'application/json'},
   body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});
 if(!response.ok)throw Error('Historical RPC HTTP '+response.status);
 const body=await response.json();
 if(body?.error)throw Error('Historical RPC error');
 return body?.result;
}
export async function probeMigrationTransaction(mint,pool,endpoint,{
 fetcher=fetch,limit=24,maxReads=6}={}){
 const report={verifier:'buyguy-pump-migration-tx-v1',mint,pool,
   status:'MIGRATION_TRANSACTION_NOT_FOUND_IN_WINDOW',migrationTxVerified:false,
   examinedSignatures:0,verifiedSignature:null,kind:null,flags:[],
   caveat:'Bounded history search; not found does not disprove migration. This evidence is separate from liquidity custody and token safety.'};
 if(!base58Pubkey(mint)||!base58Pubkey(pool)){
   return {...report,status:'INVALID_MINT_OR_POOL',flags:['INVALID_ADDRESS']};
 }
 const curve=(await deriveBondingCurve(mint)).address;
 const signatures=await rpc(endpoint,'getSignaturesForAddress',[curve,
   {limit:Math.max(1,Math.min(30,limit)),commitment:'finalized'}],fetcher);
 if(!Array.isArray(signatures))return {...report,status:'SIGNATURE_HISTORY_UNAVAILABLE'};
 const sigs=signatures.filter(x=>x?.err===null&&
   typeof x.signature==='string'&&/^[1-9A-HJ-NP-Za-km-z]{64,90}$/.test(x.signature))
   .slice(0,Math.max(1,Math.min(8,maxReads)));
 const kinds=await migrationDiscriminators();
 let checked=0;
 for(const item of sigs){
   let tx;
   try{tx=await rpc(endpoint,'getTransaction',[item.signature,
     {encoding:'json',commitment:'finalized',maxSupportedTransactionVersion:0}],fetcher);}
   catch{checked++;continue}
   checked++;
   const match=matchMigrationTx(tx,{pool,mint,bondingCurve:curve,discriminators:kinds});
   if(match){
     return {...report,status:'MIGRATION_TRANSACTION_VERIFIED',migrationTxVerified:true,
       bondingCurve:curve,examinedSignatures:checked,verifiedSignature:item.signature,
       kind:match.kind,slot:match.slot,blockTime:match.blockTime};
   }
 }
 return {...report,bondingCurve:curve,examinedSignatures:checked,
   status:signatures.length<limit?'MIGRATION_TRANSACTION_NOT_FOUND':'SEARCH_WINDOW_EXHAUSTED'};
}
