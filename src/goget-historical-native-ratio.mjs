// Exact counterpart pool-flow reconstruction from Helius Enhanced parsed transfers.
// Returns native SOL/token only. NEVER USD, never executable quote, never wallet PnL.
const BASE58=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const WSOL='So11111111111111111111111111111111111111112';
const amt=x=>x!==null&&x!==undefined&&x!==''&&Number.isFinite(Number(x))&&Number(x)>0?Number(x):null;
export function inferExactCounterpartyNativeRatio(tx,{pool,mint}={}){
 if(!BASE58.test(pool||'')||!BASE58.test(mint||'')||mint===WSOL)
  throw Error('INVALID_POOL_MINT');
 const bad=reason=>({status:reason,solPerToken:null,side:null,signature:tx?.signature||null});
 if(tx?.type!=='SWAP'||tx?.transactionError!==null&&tx?.transactionError!==undefined)
   return bad('NO_SUCCESSFUL_ENHANCED_SWAP');
 if(!Array.isArray(tx.tokenTransfers)||tx.tokenTransfers.length>50||
   !(tx.accountData||[]).some(x=>x?.account===pool))
   return bad('POOL_AND_TRANSFER_EVIDENCE_UNVERIFIED');
 const legs=tx.tokenTransfers.filter(x=>
   (x?.mint===WSOL||x?.mint===mint)&&amt(x.tokenAmount)!==null&&
   (x.fromUserAccount===pool||x.toUserAccount===pool));
 const unrelated=tx.tokenTransfers.some(x=>x?.mint!==WSOL&&x?.mint!==mint&&
   (x.fromUserAccount===pool||x.toUserAccount===pool));
 if(unrelated)return bad('MULTI_MINT_POOL_LEGS_AMBIGUOUS');
 const matched=[];
 for(const sol of legs.filter(x=>x.mint===WSOL)){
  for(const token of legs.filter(x=>x.mint===mint)){
   const buying=sol.toUserAccount===pool&&
     token.fromUserAccount===pool&&sol.fromUserAccount===token.toUserAccount;
   const selling=sol.fromUserAccount===pool&&
     token.toUserAccount===pool&&sol.toUserAccount===token.fromUserAccount;
   if(!buying&&!selling)continue;
   const ratio=Number(sol.tokenAmount)/Number(token.tokenAmount);
   if(!Number.isFinite(ratio)||ratio<=0)continue;
   matched.push({side:buying?'TOKEN_BOUGHT_FROM_POOL':'TOKEN_SOLD_TO_POOL',
     solPerToken:ratio,wsolAmount:Number(sol.tokenAmount),
     tokenAmount:Number(token.tokenAmount),
     counterparty:buying?sol.fromUserAccount:sol.toUserAccount});
  }
 }
 // Exactly one direct matched counterparty pair; reject multi-route, splits,
 // fee-only legs or multiple possible interpretations.
 if(matched.length!==1)return bad('NO_UNAMBIGUOUS_DIRECT_COUNTERPARTY_LEGS');
 const m=matched[0];
 return {status:'HISTORIC_NATIVE_POOL_FLOW_RATIO_ONLY',
   signature:tx.signature,blockTime:new Date(tx.timestamp*1000).toISOString(),
   side:m.side,solPerToken:m.solPerToken,wsolAmount:m.wsolAmount,
   tokenAmount:m.tokenAmount,counterparty:m.counterparty,
   source:'HELIUS_ENHANCED_TRANSFER_LEGS',
   caveat:'Indicative transfer-leg ratio; not pool spot/mid, not executable USD price, not fee/slippage adjusted.'};
}
