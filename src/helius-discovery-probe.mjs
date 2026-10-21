// Read-only, opt-in Helius discovery experiment. No D1 writes or trades.
// Uses bounded getSignaturesForAddress on a known Solana program; a program
// signature is a candidate transaction, NOT proof of token creation.
const base58=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
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
