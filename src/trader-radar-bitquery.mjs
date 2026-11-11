// Optional future Bitquery GraphQL adapter. NO network activity, credentials,
// subscriptions or expenses are activated by importing this module.
import {isSolanaAddress} from './trader-radar.mjs';
const QUOTE=new Set(['EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v','So11111111111111111111111111111111111111112','Es9vMFrzaCERmJfrF4H2FYD4KCoNkM1SNEtP9qjn4Ms']);
export const FOMO_SIGNER_RESEARCH_ONLY='AgmLJBMDCqWynYnQiPCuj9ewsNNsBJXyzoUhD9LJzN51';
export const BITQUERY_FOMO_DOCS='https://docs.bitquery.io/docs/blockchain/Solana/fomo-api/';
export const FOMO_LATEST_TRADES_QUERY=[
 'query FomoLatestTrades {','  Solana {',
 '    DEXTrades(limit: {count: 10}, orderBy: {descending: Block_Time},',
 '      where: {Transaction: {Signer: {is: "'+FOMO_SIGNER_RESEARCH_ONLY+'"}}, Trade: {Dex: {ProtocolName: {is: "dflow"}}}}) {',
 '      Block { Time }','      Transaction { Signature }',
 '      Trade {','        Buy { Amount AmountInUSD Account { Owner } Currency { Symbol MintAddress } }',
 '        Sell { Amount AmountInUSD Currency { Symbol MintAddress } }',
 '      }','    }','  }','}'
].join('\n');
// DFlow owner is a candidate association, not guaranteed true ownership;
// no Bitquery-only row is marked as a confirmed buy for convergence.
export function normalizeBitqueryFomoRows(payload,{max=10}={}){
 const rows=payload?.data?.Solana?.DEXTrades;
 if(!Array.isArray(rows))return {status:'INVALID_OR_MISSING_ROWS',events:[]};
 const events=[],seen=new Set();
 for(const row of rows.slice(0,Math.min(100,Math.max(1,Math.floor(max))))){
  const w=row?.Trade?.Buy?.Account?.Owner,mint=row?.Trade?.Buy?.Currency?.MintAddress;
  const sig=row?.Transaction?.Signature,at=row?.Block?.Time;
  const paidMint=row?.Trade?.Sell?.Currency?.MintAddress;
  if(!QUOTE.has(paidMint)||QUOTE.has(mint)||!isSolanaAddress(w)||!isSolanaAddress(mint)||typeof sig!=='string'||!Number.isFinite(Date.parse(at||'')))continue;
  const key=sig+':'+w+':'+mint;if(seen.has(key))continue;seen.add(key);
  events.push({wallet:w,mint,signature:sig,at,side:'BUY',
   claimedQuoteMint:paidMint,source:'BITQUERY_DFLOW_FOMO_RESEARCH',confirmed:false,independenceVerified:false,
   caveat:'DFlow trade owner is provisional. Requires independent attribution and raw transaction verification.'});
 }
 return {status:'RESEARCH_ONLY',events};
}
