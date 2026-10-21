// Bounded raw JSON-RPC probe on PUBLIC Solana mainnet. No credentials, no D1,
// no trading, no cloud deployment, no secret output. Use exact known signatures.
import {auditRawSignature} from '../src/trader-radar-raw-audit.mjs';
const RPC='https://api.mainnet-beta.solana.com';
const php='Cbkg5w7V7W2J2sUmecnyN825CbvwvXwasfhduVtNpump';
const xtv='6MBf1XdZNSAaDKcxxbnCAngRUxBmwbHS5Ybe2rLRpump';
const usdc='EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const examples=[
 {label:'PHP_FIRST_ACQUISITION',wallet:'AH75Bn6QHSt5K2Ad4p1otns3JTwpSJWZTwiwKWNhmnKx',mint:php,quoteMint:usdc,
  signature:'2EtnvPtjXEikXyRftJxZMdCuq32mEYPHzmurqfhDH1sSbKS4hBYQqWdzskkXXvLthyUESG8zvzhhNmyNCLEy7aM5',
  at:'2026-10-21T05:14:39Z',side:'BUY_LIKE',baseUnits:21212018.686656,quoteUnits:1000},
 {label:'PHP_LATER_EXIT',wallet:'AH75Bn6QHSt5K2Ad4p1otns3JTwpSJWZTwiwKWNhmnKx',mint:php,quoteMint:usdc,
  signature:'2ShoNPRFNwjtTGhuC29LyPqRZjRF16RurPVg5Adhw2VFZZ7d5dLX6nsJDuJDhT3AZDvkQzmbzPjnke3VyQWArvRL',
  at:'2026-10-21T06:06:39Z',side:'SELL_LIKE',baseUnits:3601519.666279,quoteUnits:1066.445685},
 {label:'XTV_ACQUISITION',wallet:'mDR91ufq4S2uSHa9E2PYL7xg4LwcQXaQFP7YK864a1z',mint:xtv,quoteMint:usdc,
  signature:'2BqKYNqHnDpgzM4cmdtV6BpX5T6cgoCDegysrhvwYb7jNmbxsyVitj1eWQrqYmCVEQFYB6p7e2A9Bkeq7SbpiFPx',
  at:'2026-10-21T02:03:39Z',side:'BUY_LIKE',baseUnits:157429.423304,quoteUnits:50}
];
const results=[];
for(let i=0;i<examples.length;i++){
 const ex=examples[i];const controller=new AbortController();
 const timeout=setTimeout(()=>controller.abort(),12000);
 try{
  const response=await fetch(RPC,{method:'POST',
   headers:{'content-type':'application/json'},
   body:JSON.stringify({jsonrpc:'2.0',id:i+1,method:'getTransaction',
    params:[ex.signature,{encoding:'jsonParsed',commitment:'confirmed',maxSupportedTransactionVersion:1}]}),
   signal:controller.signal});
  if(!response.ok){results.push({label:ex.label,status:'PUBLIC_RPC_HTTP_'+response.status,corroborated:false});continue;}
  const payload=await response.json();
  if(payload?.error){results.push({label:ex.label,status:'PUBLIC_RPC_JSON_RPC_ERROR',rpcCode:Number.isInteger(payload.error.code)?payload.error.code:null,corroborated:false});continue;}
  const audit=auditRawSignature(ex,payload?.result);
  results.push({label:ex.label,status:audit.status,corroborated:audit.corroborated,
   walletSignerObserved:audit.walletSignerObserved??null,feeLamports:audit.feeLamports??null,
   swapVerified:false,realizedPnlUsd:null});
 }catch(error){results.push({label:ex.label,status:error?.name==='AbortError'?'PUBLIC_RPC_TIMEOUT':'PUBLIC_RPC_UNAVAILABLE',corroborated:false});}
 finally{clearTimeout(timeout);}
}
console.log('TRADER_RADAR_PUBLIC_RAW_PROBE',JSON.stringify({
 network:'solana-mainnet',source:'PUBLIC_SOLANA_JSON_RPC',transactionsRequested:examples.length,
 results,verifiedExecutedTrades:0,verifiedRealizedPnlUsd:null,
 caveat:'No result promotes a raw token balance correlation to a known fill, settled cost basis, independently identified trader or trading signal.'}));
