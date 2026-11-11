// Manual-only research adapter using the existing Helius JSON-RPC URL.
// Never imports cron, D1, ranking, scanner or paper-trade modules.
import {isSolanaAddress} from './trader-radar.mjs';
const lim=(n,max)=>Math.min(max,Math.max(1,Math.floor(Number(n)||1)));
async function rpc(url,method,params,fetcher){
 const response=await fetcher(url,{method:'POST',headers:{'content-type':'application/json'},
  body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});
 if(!response?.ok)throw Error('HELIUS_RPC_HTTP_ERROR');
 const payload=await response.json();
 if(payload?.error||!Object.hasOwn(payload,'result'))throw Error('HELIUS_RPC_BAD_RESPONSE');
 return payload.result;
}
function rawAmount(balance){
 const raw=balance?.uiTokenAmount?.amount;
 const d=balance?.uiTokenAmount?.decimals;
 if(!/^[0-9]+$/.test(raw||'')||!Number.isInteger(d)||d<0||d>18)return null;
 const val=Number(raw)/10**d;return Number.isFinite(val)?val:null;
}
// Balance-derived swap-like evidence. Never count isolated inbound airdrops,
// fee-payer signatures or generic transfer labels as verified buys.
export function classifyWalletBalanceChanges(wallet,tx){
 if(!isSolanaAddress(wallet)||!tx||tx.meta?.err||!tx.meta)return {status:'FAILED_OR_INCOMPLETE',changes:[]};
 const byKey=new Map();
 for(const [side,list] of [['pre',tx.meta.preTokenBalances],['post',tx.meta.postTokenBalances]]){
  for(const row of Array.isArray(list)?list:[]){
   if(row?.owner!==wallet||!isSolanaAddress(row.mint))continue;
   const val=rawAmount(row);if(val===null)continue;
   const key=String(row.accountIndex)+':'+row.mint;
   const entry=byKey.get(key)||{mint:row.mint,pre:0,post:0};entry[side]=val;byKey.set(key,entry);
  }
 }
 const perMint=new Map();
 for(const row of byKey.values())perMint.set(row.mint,(perMint.get(row.mint)||0)+row.post-row.pre);
 const changes=[...perMint].filter(([,v])=>Math.abs(v)>1e-12).map(([mint,delta])=>({mint,delta}));
 const positives=changes.filter(x=>x.delta>0),negatives=changes.filter(x=>x.delta<0);
 return {status:positives.length&&negatives.length?'TWO_SIDED_TOKEN_BALANCE_CHANGE':'NOT_VERIFIED_AS_SWAP',
  changes,signature:tx.transaction?.signatures?.[0]||null,
  caveat:'Balance changes are not proof of a swap venue, USD cost basis, beneficial owner or intent.'};
}
export async function verifyFomoWalletActivity(env,{candidates=[],fetcher=fetch,maxWallets=5,signatureLimit=3}={}){
 if(!env?.HELIUS_RPC_URL)return {enabled:false,reason:'RPC_NOT_CONFIGURED',wallets:[]};
 const unique=[...new Set(candidates.map(x=>x?.wallet).filter(isSolanaAddress))].slice(0,lim(maxWallets,10));
 const wallets=[];
 for(const wallet of unique){
  try{
   const signatures=await rpc(env.HELIUS_RPC_URL,'getSignaturesForAddress',
    [wallet,{limit:lim(signatureLimit,5),commitment:'confirmed'}],fetcher);
   if(!Array.isArray(signatures))throw Error('INVALID_SIGNATURES');
   const valid=signatures.filter(x=>typeof x?.signature==='string'&&!x.err);
   const sample=valid[0];
   let evidence={status:'NO_CONFIRMED_SAMPLE',changes:[]};
   if(sample){
    const tx=await rpc(env.HELIUS_RPC_URL,'getTransaction',
     [sample.signature,{encoding:'jsonParsed',commitment:'confirmed',maxSupportedTransactionVersion:0}],fetcher);
    evidence=classifyWalletBalanceChanges(wallet,tx);
   }
   wallets.push({wallet,status:valid.length?'ONCHAIN_ACTIVITY_OBSERVED':'NO_ACTIVITY_IN_WINDOW',
    signaturesSeen:signatures.length,confirmedSignatures:valid.length,
    latestBlockTime:sample?.blockTime??null,sample:evidence,
    identityVerified:false,realizedPnlVerified:false});
  }catch(error){wallets.push({wallet,status:'RPC_RESEARCH_ERROR',errorCode:error?.message==='HELIUS_RPC_HTTP_ERROR'?'HTTP_ERROR':'UNCLASSIFIED_ERROR',
   identityVerified:false,realizedPnlVerified:false});}
 }
 return {enabled:true,mode:'READ_ONLY_RESEARCH',wallets,checked:wallets.length,
  caveat:'Activity only: a wallet history and sample do not verify a FOMO username, independent controller, realized PnL or trade profitability.'};
}
