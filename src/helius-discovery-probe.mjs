// Read-only, opt-in Helius discovery experiment. No D1 writes or trades.
// Uses bounded getSignaturesForAddress on a known Solana program; a program
// signature is a candidate transaction, NOT proof of token creation.
const base58=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const signatureRE=/^[1-9A-HJ-NP-Za-km-z]{80,90}$/;
export async function heliusDiscoveryProbe(env,{program,limit=12,fetcher=fetch}={}){
 if(!env?.HELIUS_RPC_URL)return {enabled:false,reason:'RPC_NOT_CONFIGURED',candidates:[]};
 if(!base58.test(program||''))return {enabled:false,reason:'PROGRAM_NOT_CONFIGURED',candidates:[]};
 const count=Math.max(1,Math.min(20,Math.floor(Number(limit)||12)));
 const response=await fetcher(env.HELIUS_RPC_URL,{
  method:'POST',headers:{'content-type':'application/json'},
  body:JSON.stringify({jsonrpc:'2.0',id:1,method:'getSignaturesForAddress',
   params:[program,{limit:count,commitment:'confirmed'}]})
 });
 if(!response.ok)throw Error('Helius discovery RPC HTTP '+response.status);
 const payload=await response.json();
 if(payload?.error||!Array.isArray(payload?.result))throw Error('Invalid Helius discovery response');
 return {enabled:true,source:'Helius Solana RPC',program,
  scanned:payload.result.length,
  candidates:payload.result.filter(x=>typeof x?.signature==='string'&&x.signature.length>=64)
   .map(x=>({signature:x.signature,slot:x.slot,blockTime:x.blockTime,
     status:x.err?'FAILED_TRANSACTION':'UNCLASSIFIED'})),
  caveat:'Signatures are unclassified transactions, not verified new tokens or pools.'};
}

// Optional second-stage classification, bounded and read-only.
// A mint initialization is evidence of token creation, not of a tradable pool.
export function classifyHeliusTransaction(transaction,{program}={}){
 if(!transaction||transaction.meta?.err)return {status:'FAILED_OR_MISSING',mints:[]};
 const instructions=[
  ...(transaction.transaction?.message?.instructions||[]),
  ...(transaction.meta?.innerInstructions||[]).flatMap(x=>x.instructions||[])
 ];
 const tokenPrograms=new Set([
  'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
  'TokenzQdBNbLqP5VEhdkAS6EPF4rEM3LhLQzwkpA3sA'
 ]);
 const mints=new Set();
 for(const ix of instructions){
  const parsed=ix?.parsed;
  if(!tokenPrograms.has(ix?.programId)&&!['spl-token','spl-token-2022'].includes(ix?.program))continue;
  if(!['initializeMint','initializeMint2'].includes(parsed?.type))continue;
  const mint=parsed?.info?.mint;
  if(base58.test(mint||''))mints.add(mint);
 }
 return {status:mints.size?'MINT_INITIALIZATION_OBSERVED':'UNCLASSIFIED',
  mints:[...mints],program:base58.test(program||'')?program:null,
  caveat:'Mint initialization is not pool creation, launch attribution, liquidity or safety certification.'};
}
export async function classifyHeliusSignatures(env,{signatures=[],program,fetcher=fetch}={}){
 if(!env?.HELIUS_RPC_URL)return {enabled:false,reason:'RPC_NOT_CONFIGURED',results:[]};
 const unique=[...new Set(signatures.filter(x=>typeof x==='string'&&signatureRE.test(x)))].slice(0,5);
 const results=[];
 for(const signature of unique){
  const response=await fetcher(env.HELIUS_RPC_URL,{method:'POST',
   headers:{'content-type':'application/json'},
   body:JSON.stringify({jsonrpc:'2.0',id:1,method:'getTransaction',
    params:[signature,{encoding:'jsonParsed',maxSupportedTransactionVersion:0,commitment:'confirmed'}]})});
  if(!response.ok){results.push({signature,status:'RPC_HTTP_ERROR',httpStatus:response.status,mints:[]});continue;}
  const data=await response.json();
  if(data?.error){
   const code=Number(data.error.code);
   const reason=code===-32015?'UNSUPPORTED_TRANSACTION_VERSION':
    code===-32004?'TRANSACTION_HISTORY_UNAVAILABLE':
    code===-32602?'INVALID_RPC_PARAMS':'OTHER_RPC_ERROR';
   results.push({signature,status:'RPC_ERROR',rpcErrorCode:Number.isInteger(code)?code:null,
    rpcErrorReason:reason,mints:[]});continue;
  }
  if(!data?.result){results.push({signature,status:'TRANSACTION_UNAVAILABLE',mints:[]});continue;}
  results.push({signature,...classifyHeliusTransaction(data?.result,{program}),
   poolEvidence:classifyPoolCreationLead(data?.result)});
 }
 return {enabled:true,source:'Helius Solana RPC',checked:results.length,results};
}

// Pool creation leads require an exact known program plus explicit parsed instruction.
// Most on-chain instructions are binary; these remain UNCLASSIFIED until decoded
// against the protocol IDL and independently verified via the pool account.
import {PUMPSWAP} from './pumpswap.mjs';
import {RAYDIUM_CPMM} from './raydium-cpmm.mjs';
import {binaryPoolCreationLead} from './helius-binary-pool.mjs';
export function classifyPoolCreationLead(transaction){
 if(!transaction||transaction.meta?.err)return {status:'FAILED_OR_MISSING',leads:[]};
 const instructions=[
  ...(transaction.transaction?.message?.instructions||[]),
  ...(transaction.meta?.innerInstructions||[]).flatMap(x=>x.instructions||[])
 ];
 const protocols=new Map([[PUMPSWAP,'PUMPSWAP'],[RAYDIUM_CPMM,'RAYDIUM_CPMM']]);
 const leads=[];
 for(const ix of instructions){
  const binaryLead=binaryPoolCreationLead(ix);
  if(binaryLead){leads.push(binaryLead);continue;}
  const protocol=protocols.get(ix?.programId);
  if(!protocol)continue;
  const type=String(ix?.parsed?.type||'');
  if(!['initialize','initializePool','createPool'].includes(type))continue;
  const info=ix?.parsed?.info||{};
  const pool=info.pool||info.poolState||info.poolAccount;
  if(!base58.test(pool||''))continue;
  leads.push({protocol,pool,evidence:'PARSED_INITIALIZATION_INSTRUCTION',
   verified:false});
 }
 return {status:leads.length?'POOL_CREATION_LEADS':'UNCLASSIFIED',leads,
  caveat:'Parsed initialization is a lead only; account ownership, state, mint pair and reserves require separate verification.'};
}
