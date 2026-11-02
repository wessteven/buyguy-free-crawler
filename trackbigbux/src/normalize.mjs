// Never interpret an incoming transfer/airdrop as a buy.
// Parsing success, direct authorship, and economic swap evidence are distinct facts.
export const exact = (a,b) => String(a||'') === String(b||'');
export const evmEqual = (a,b) => String(a||'').toLowerCase() === String(b||'').toLowerCase();
export function boundedError(e) {
  return String(e && e.message || e || 'unknown').replace(/https?:\/\/\S+/g,'[endpoint]').slice(0,180);
}
export function solanaDelta(items, checkpoint, max=300) {
  if (!Array.isArray(items)) throw Error('SOLANA_RESPONSE_NOT_ARRAY');
  const previous = checkpoint || null;
  const pos = previous ? items.findIndex(x => x.signature === previous) : -1;
  const firstRun = !previous;
  const newRows = pos >= 0 ? items.slice(0,pos) : items.slice(0,max);
  const overflow = pos < 0 && previous !== null;
  // A full first page is not evidence of historical completeness.
  const status = firstRun ? 'BASELINE_ONLY' : overflow ? 'CHECKPOINT_NOT_FOUND' : 'OK';
  return {rows:newRows.slice(0,max),status,overflow,checkpointFound:pos>=0,
    newest:items[0]?.signature || null,fetched:items.length};
}
export function evmDelta(items, checkpoint, morePages=false, max=200) {
  if (!Array.isArray(items)) throw Error('EVM_RESPONSE_NOT_ARRAY');
  const pos=checkpoint?items.findIndex(x=>evmEqual(x.hash,checkpoint)):-1;
  const firstRun=!checkpoint;
  const rows=(pos>=0?items.slice(0,pos):items).slice(0,max);
  const complete=!morePages && (firstRun || pos>=0);
  const status=firstRun?'BASELINE_ONLY':pos>=0?'OK':'CHECKPOINT_NOT_FOUND';
  return {rows,status,morePages,complete,newest:items[0]?.hash||null,fetched:items.length};
}
export function normalizeSignature(wallet,tx,observedAt) {
  if (!tx || !/^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(String(tx.signature||''))) return null;
  return {
    wallet_id:wallet.id,chain:'solana',tx_id:tx.signature,
    occurred_at:Number.isInteger(tx.blockTime)?new Date(tx.blockTime*1000).toISOString():null,
    height:Number.isSafeInteger(tx.slot)?String(tx.slot):null,
    observed_at:observedAt,category:tx.err?'FAILED_SIGNATURE':'UNPARSED_SIGNATURE',
    initiated:'NOT_ESTABLISHED',source:'helius_rpc',evidence_json:JSON.stringify({
      err:tx.err??null,confirmationStatus:tx.confirmationStatus||null
    })
  };
}
export function normalizeEvmTx(wallet,tx,observedAt) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(String(tx?.hash||''))) return null;
  const directlyFrom=evmEqual(tx.from?.hash||tx.from,wallet.address);
  return {
    wallet_id:wallet.id,chain:'robinhood',tx_id:tx.hash.toLowerCase(),
    occurred_at:/^\d{4}-\d\d-\d\dT/.test(tx.timestamp||'')?tx.timestamp:null,
    height:Number.isSafeInteger(tx.block)?String(tx.block):
      (Number.isSafeInteger(tx.block_number)?String(tx.block_number):null),
    observed_at:observedAt,category:tx.status==='error'?'FAILED_TRANSACTION':'TRANSACTION_NOT_VERIFIED_SWAP',
    initiated:directlyFrom?'DIRECT_FROM':'PARTICIPATION_ONLY',source:'blockscout',
    evidence_json:JSON.stringify({method:tx.method||null,status:tx.status||null,
      from:tx.from?.hash||tx.from||null,to:tx.to?.hash||tx.to||null,
      value:String(tx.value||'0').slice(0,60)})
  };
}
export function classifyHelius(wallet,tx) {
  if (!tx || typeof tx.signature!=='string') return null;
  const ownTransfers=(tx.tokenTransfers||[]).filter(t=>exact(t.fromUserAccount,wallet.address)||exact(t.toUserAccount,wallet.address));
  const inbound=ownTransfers.filter(t=>exact(t.toUserAccount,wallet.address)&&!exact(t.fromUserAccount,wallet.address));
  const outbound=ownTransfers.filter(t=>exact(t.fromUserAccount,wallet.address)&&!exact(t.toUserAccount,wallet.address));
  const initiated=exact(tx.feePayer,wallet.address);
  const isSwap=tx.type==='SWAP';
  const economicSwap=isSwap && inbound.length>0 && outbound.length>0;
  // Fee payer alone is not sufficient when a wallet is merely passed as an account.
  const category=economicSwap?'WALLET_SWAP_EVIDENCE':
    (isSwap?'SWAP_UNATTRIBUTED':(tx.type==='TRANSFER'?'TRANSFER_NOT_BUY':'NON_SWAP_OR_UNRESOLVED'));
  return {category,initiated:initiated?'WALLET_FEE_PAYER':
      (economicSwap?'OWN_BIDIRECTIONAL_TOKEN_FLOWS':'NOT_ESTABLISHED'),
    source:'helius_enhanced',
    evidence_json:JSON.stringify({
      type:tx.type||null,source:tx.source||null,feePayerMatches:initiated,
      ownInbound:inbound.slice(0,8).map(t=>({mint:t.mint,amount:t.tokenAmount})),
      ownOutbound:outbound.slice(0,8).map(t=>({mint:t.mint,amount:t.tokenAmount})),
      warnings:economicSwap?['HELIUS_PARSED_NOT_INDEPENDENT_NET_PNL']:[]
    }).slice(0,2800)};
}
