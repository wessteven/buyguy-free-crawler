// Conservative wallet USDC receipt attribution from parsed token transfers.
// Outbound tokens accompanying USDC are trade-like, not verified third-party funding.
import {isSolanaAddress} from './trader-radar.mjs';
import {SOLANA_USDC} from './trader-radar-php-proof-plan.mjs';
const stable=new Set([SOLANA_USDC,'Es9vMFrzaCERmJfrF4H2FYD4KCoNkM1SNEtP9qjn4Ms']);
export function classifyWalletUsdcReceipt(wallet,transaction,{thresholdUnits=25}={}){
 const refuse=status=>({status,netUsdcUnits:null,fundingVerified:false,
  independentBeneficialOwnerVerified:false});
 if(!isSolanaAddress(wallet)||!transaction||transaction.transactionError||
   !Array.isArray(transaction.tokenTransfers))return refuse('INVALID_OR_FAILED_TRANSACTION');
 const delta=new Map(),counterparties=new Set();
 for(const leg of transaction.tokenTransfers){
  if(!isSolanaAddress(leg?.mint)||typeof leg.tokenAmount!=='number'||
     !Number.isFinite(leg.tokenAmount)||!(leg.tokenAmount>0))
    return refuse('MALFORMED_TOKEN_TRANSFER');
  if(leg.fromUserAccount===wallet)delta.set(leg.mint,(delta.get(leg.mint)||0)-leg.tokenAmount);
  if(leg.toUserAccount===wallet){
   delta.set(leg.mint,(delta.get(leg.mint)||0)+leg.tokenAmount);
   if(leg.mint===SOLANA_USDC&&isSolanaAddress(leg.fromUserAccount)&&leg.fromUserAccount!==wallet)
    counterparties.add(leg.fromUserAccount);
  }
 }
 const usdc=delta.get(SOLANA_USDC)||0;
 if(usdc<Math.max(0,thresholdUnits))return {status:'NO_MEANINGFUL_USDC_NET_RECEIPT',
  netUsdcUnits:usdc,fundingVerified:false,independentBeneficialOwnerVerified:false};
 const other=[...delta].filter(([m,v])=>m!==SOLANA_USDC&&Math.abs(v)>1e-8);
 const outgoing=other.filter(([m,v])=>!stable.has(m)&&v<0);
 const incoming=other.filter(([m,v])=>!stable.has(m)&&v>0);
 const status=outgoing.length?
  (incoming.length?'MULTI_ASSET_USDC_RECEIPT':'USDC_RECEIPT_WITH_TOKEN_DISPOSAL'):
  other.length?'COMPLEX_USDC_RECEIPT':'UNPAIRED_USDC_RECEIPT';
 return {status,netUsdcUnits:usdc,outgoingTokenMints:outgoing.map(([mint])=>mint),
  incomingTokenMints:incoming.map(([mint])=>mint),
  directTokenTransferSources:[...counterparties],
  fundingVerified:false,independentBeneficialOwnerVerified:false,
  caveat:'Receipt of USDC, including standalone receipts, is not proof of external owner funding. Accompanying token disposals may be swaps or routed settlements.'};
}
