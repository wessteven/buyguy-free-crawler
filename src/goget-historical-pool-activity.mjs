// Classification of historic transaction EVIDENCE, never a historical USD price.
// Enhanced parsed transaction types may be incomplete or misleading.
// No amount of absence here proves an on-chain pool had zero trades.
export const FORENSIC_LIMITS=Object.freeze({
  maxPoolsPerBatch:12,maxApiCallsPerBatch:30,maxPagesPerPool:3,
  pageSize:100,maxOutcomeRows:500,maxD1Calls:180,
  maxEvidenceSignatures:3,afterDueMs:10*60000,
  maxSourceBytes:900000,heliusTimeoutMs:18000,
  estimatedProviderCreditsUpperBound:4950
});
const PUBKEY=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const SIG=/^[1-9A-HJ-NP-Za-km-z]{64,88}$/;
export function validateEvidenceTx(tx,{pool,fromMs,toMs}={}){
  if(!PUBKEY.test(pool||'')||!Number.isFinite(fromMs)||!Number.isFinite(toMs)||
      !(toMs>=fromMs))throw Error('INVALID_WINDOW');
  if(!SIG.test(tx?.signature||'')||!Number.isSafeInteger(tx?.slot)||tx.slot<=0||
      !Number.isSafeInteger(tx?.timestamp))
    throw Error('TRANSACTION_IDENTITY_UNVERIFIED');
  const timeMs=tx.timestamp*1000;
  if(timeMs<fromMs||timeMs>toMs)throw Error('OUT_OF_REQUESTED_TIME_WINDOW');
  const inAccountData=(tx.accountData||[]).some(x=>x?.account===pool);
  const inTransfer=(tx.tokenTransfers||[]).some(x=>x?.fromUserAccount===pool||x?.toUserAccount===pool);
  const inNative=(tx.nativeTransfers||[]).some(x=>x?.fromUserAccount===pool||x?.toUserAccount===pool);
  return {signature:tx.signature,slot:tx.slot,timeMs,
    exactPoolReferenced:inAccountData||inTransfer||inNative,
    failedTransaction:tx.transactionError!==null&&tx.transactionError!==undefined,
    sourceType:typeof tx.type==='string'?tx.type.slice(0,80):'UNKNOWN',
    tokenMints:[...new Set((tx.tokenTransfers||[]).map(x=>x?.mint)
      .concat((tx.accountData||[]).flatMap(x=>(x.tokenBalanceChanges||[]).map(z=>z?.mint)))
      .filter(x=>PUBKEY.test(x||'')))].slice(0,50)
  };
}
export function classifyHistoricalPoolWindows(rows,txs,{
  pool,mint,historyComplete=false,providerFailure=null,asOf=new Date().toISOString()
}={}){
  if(!PUBKEY.test(pool||'')||!PUBKEY.test(mint||'')||
    !Array.isArray(rows)||!Array.isArray(txs)||rows.length>FORENSIC_LIMITS.maxOutcomeRows||
    !Number.isFinite(Date.parse(asOf))||txs.length>FORENSIC_LIMITS.maxPagesPerPool*FORENSIC_LIMITS.pageSize)
    throw Error('INVALID_FORENSIC_INPUT');
  const earliest=Math.min(...rows.map(x=>Date.parse(x?.due_at||'')));
  const latest=Math.max(...rows.map(x=>Date.parse(x?.due_at||'')))+FORENSIC_LIMITS.afterDueMs;
  if(!Number.isFinite(earliest)||!Number.isFinite(latest)||earliest>latest)
    throw Error('INVALID_DUE_TIME');
  const all=[],seen=new Set();
  for(const t of txs){
    const v=validateEvidenceTx(t,{pool,fromMs:earliest,toMs:latest});
    if(seen.has(v.signature))throw Error('DUPLICATE_HELIUS_PAGE_SIGNATURE');
    seen.add(v.signature);all.push(v);
  }
  return rows.map(o=>{
    const due=Date.parse(o.due_at||''),bucket=Date.parse(o.bucket||'');
    if(o.pool!==pool||o.mint!==mint||
      !Number.isFinite(due)||!Number.isFinite(bucket)||![5,60,360,1440].includes(Number(o.horizon_min)))
      throw Error('ROW_POOL_MINT_OR_TIME_MISMATCH');
    const nearby=all.filter(v=>v.timeMs>=due&&v.timeMs<=due+FORENSIC_LIMITS.afterDueMs);
    const poolHits=nearby.filter(v=>v.exactPoolReferenced&&!v.failedTransaction);
    const enhancedSwaps=poolHits.filter(v=>v.sourceType==='SWAP');
    const mintHints=enhancedSwaps.filter(v=>v.tokenMints.includes(mint));
    const unknowns=poolHits.filter(v=>v.sourceType==='UNKNOWN');
    let classification;
    if(providerFailure)classification='INCOMPLETE_PROVIDER_HISTORY';
    else if(!historyComplete)classification='INCOMPLETE_PAGINATION_CANNOT_RULE_OUT_SWAPS';
    else if(mintHints.length)classification='HELIUS_LABELED_SWAP_POOL_AND_MINT_HINT';
    else if(enhancedSwaps.length)classification='LABELED_POOL_SWAP_MINT_UNVERIFIED';
    else if(unknowns.length)classification='UNCLASSIFIED_POOL_ACTIVITY';
    else if(poolHits.length)classification='NON_SWAP_POOL_ACTIVITY';
    else classification='NO_MATCHING_TX_IN_HELIUS_ENHANCED_HISTORY';
    return {mint,bucket:o.bucket,horizonMin:Number(o.horizon_min),
      dueAt:o.due_at,pool,historyComplete:!!historyComplete,
      classification,nearbyTxCount:nearby.length,
      validPoolTxCount:poolHits.length,labeledPoolSwapTxCount:enhancedSwaps.length,
      exactMintHintedSwaps:mintHints.length,unclassifiedPoolTxCount:unknowns.length,
      signatures:mintHints.slice(0,FORENSIC_LIMITS.maxEvidenceSignatures)
        .map(x=>({signature:x.signature,blockTime:new Date(x.timeMs).toISOString()})),
      providerFailure,source:'HELIUS_ENHANCED_ADDRESS_HISTORY_BACKFILLED',
      asOf,usdPriceReconstructed:false,
      caveat:'Enhanced history is not a complete raw-chain proof; token mint in a multi-pool transaction is not proof of exact-pool execution price.'};
  });
}
