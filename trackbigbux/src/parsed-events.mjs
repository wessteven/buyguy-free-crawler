// trackBIGBUX: Helius Parsed Events v1 wallet-specific, conservative classifications.
// REST item-level errors remain pending; parsed token transfers are not audited P&L.
export const PARSED_EVENTS_ENDPOINT='https://mainnet.helius-rpc.com/v1/parsed-events/transactions';
export const MAX_PARSED_EVENTS_BATCH=100;
const eq=(a,b)=>typeof a==='string'&&typeof b==='string'&&a===b;
const transferView=t=>({
  mint:typeof t.mint==='string'?t.mint:null,
  rawTokenAmount:String(t.rawTokenAmount??''),
  decimals:Number.isInteger(t.decimals)?t.decimals:null
});
export function classifyParsedEvent(wallet,item){
  if(!wallet||!item||item.parserStatus!=='OK'||!item.parsed||
     typeof item.signature!=='string')return null;
  const p=item.parsed,flows=Array.isArray(p.tokenTransfers)?p.tokenTransfers:[];
  const ownIn=flows.filter(t=>eq(t?.toUserAccount,wallet.address)&&!eq(t?.fromUserAccount,wallet.address));
  const ownOut=flows.filter(t=>eq(t?.fromUserAccount,wallet.address)&&!eq(t?.toUserAccount,wallet.address));
  const feePayerMatch=eq(p.feePayer,wallet.address);
  const eventType=String(p.summary?.type||'').toLowerCase();
  const swap=eventType==='swap'&&p.transactionStatus==='OK';
  const bidirectional=swap&&ownIn.length>0&&ownOut.length>0;
  // Both directions are required. A fee payer or an inbound airdrop
  // alone NEVER becomes proof of a purchase or successful trading.
  const category=bidirectional?'WALLET_SWAP_EVIDENCE':
    swap?'SWAP_UNATTRIBUTED':
      p.transactionStatus==='ERROR'?'FAILED_TRANSACTION_PARSED':'NON_SWAP_OR_UNRESOLVED';
  const initiated=feePayerMatch?'WALLET_FEE_PAYER':
    bidirectional?'OWN_BIDIRECTIONAL_TOKEN_FLOWS':'NOT_ESTABLISHED';
  const evidence={
    parserStatus:item.parserStatus,transactionStatus:p.transactionStatus||null,
    summaryType:eventType||null,protocol:p.summary?.parsedData?.protocol||null,
    feePayerMatches:feePayerMatch,tokenUnits:'raw',
    ownInbound:ownIn.slice(0,8).map(transferView),
    ownOutbound:ownOut.slice(0,8).map(transferView),
    warnings:bidirectional?['HELIUS_PARSED_NOT_INDEPENDENT_NET_PNL']:[]
  };
  return {category,initiated,source:'helius_parsed_events',
    evidence_json:JSON.stringify(evidence).slice(0,2800)};
}
export function parsedItemErrors(items){
  if(!Array.isArray(items))throw Error('PARSED_EVENTS_SCHEMA_INVALID');
  return items.filter(x=>x?.parserStatus==='ERROR').length;
}
