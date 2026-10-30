// GOGET Helius Enhanced webhook *candidate* extractor. Read-only, never a trade signal.
// This is intentionally separate from the decision engine's VERIFIED_SWAP contract.
// Do not infer buy/sell or executed size from a fee payer, description or token transfer alone.
const addr=s=>typeof s==='string'&&/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s);
const sig=s=>typeof s==='string'&&/^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(s);
export function extractHeliusSwapCandidates(payload,watchedWallets,{receivedAt=new Date().toISOString(),maxBatch=100}={}) {
  const invalid=[],candidates=[],seen=new Set();
  if(!Array.isArray(payload))return {candidates,invalid:[{reason:'WEBHOOK_BODY_NOT_ARRAY'}]};
  if(payload.length>maxBatch)return {candidates,invalid:[{reason:'WEBHOOK_BATCH_LIMIT_EXCEEDED',count:payload.length}]};
  const receipt=Date.parse(receivedAt);
  if(!Number.isFinite(receipt))return {candidates,invalid:[{reason:'RECEIPT_TIMESTAMP_INVALID'}]};
  if(!(watchedWallets instanceof Set))return {candidates,invalid:[{reason:'WATCHLIST_NOT_VERIFIED'}]};
  for(const tx of payload) {
    const signature=tx?.signature??null;
    // Helius fee payer is *not always* the trader. We only admit watchlist fee payers
    // as preliminary candidates; a later transaction-delta decoder must establish owner.
    if(!watchedWallets.has(tx?.feePayer))continue;
    let reason=null;
    if(tx?.type!=='SWAP')reason='NOT_SWAP';
    else if(!sig(signature)||!addr(tx?.feePayer))reason='INVALID_SWAP_IDENTITY';
    else if(tx?.transactionError!==null)reason='NOT_VERIFIED_SUCCESS';
    else if(!Number.isSafeInteger(tx?.slot)||tx.slot<=0||!Number.isSafeInteger(tx?.timestamp)||tx.timestamp<=0)reason='MISSING_SLOT_OR_BLOCKTIME';
    else if(receipt-tx.timestamp*1000<0||receipt-tx.timestamp*1000>60000)reason='DELAY_UNKNOWN_OR_OLD';
    else if(!Array.isArray(tx?.tokenTransfers)||tx.tokenTransfers.length===0)reason='NO_TOKEN_TRANSFER_EVIDENCE';
    else if(seen.has(signature))reason='DUPLICATE_SIGNATURE';
    if(reason){invalid.push({signature,reason});continue;}
    seen.add(signature);
    candidates.push({
      signature,slot:tx.slot,feePayer:tx.feePayer,
      blockTime:new Date(tx.timestamp*1000).toISOString(),receivedAt,
      source:'HELIUS_ENHANCED_CANDIDATE',verifiedBuy:false,canTrade:false,
      nextCheck:'DECODE_WALLET_TOKEN_AND_NATIVE_DELTAS_AND_IDENTIFY_EXACT_POOL',
      transferHints:tx.tokenTransfers.filter(t=>addr(t?.mint)).slice(0,12)
        .map(t=>({mint:t.mint,from:t.fromUserAccount??null,to:t.toUserAccount??null}))
    });
  }
  return {candidates,invalid};
}
