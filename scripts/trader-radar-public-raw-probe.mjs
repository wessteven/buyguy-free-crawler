// Bounded public Solana mainnet raw audit of seven PHP flows + one XTV control.
// Research-only. No private RPC key, D1, scanner, trading, wallet signatures or order calls.
import {readFileSync} from 'node:fs';
import {auditRawSignature} from '../src/trader-radar-raw-audit.mjs';
import {buildPhpRawAuditPlan,SOLANA_USDC} from '../src/trader-radar-php-proof-plan.mjs';
const RPC='https://api.mainnet-beta.solana.com';
const study=JSON.parse(readFileSync(new URL('../data/trader-radar/2026-10-21-cost-basis-study.json',import.meta.url),'utf8'));
const plan=buildPhpRawAuditPlan(study);
if(!plan.complete)throw Error('INCOMPLETE_PHP_PROOF_PLAN');
const examples=[...plan.events,{
 label:'XTV_ACQUISITION_CONTROL',wallet:'mDR91ufq4S2uSHa9E2PYL7xg4LwcQXaQFP7YK864a1z',
 mint:'6MBf1XdZNSAaDKcxxbnCAngRUxBmwbHS5Ybe2rLRpump',
 quoteMint:SOLANA_USDC,
 signature:'2BqKYNqHnDpgzM4cmdtV6BpX5T6cgoCDegysrhvwYb7jNmbxsyVitj1eWQrqYmCVEQFYB6p7e2A9Bkeq7SbpiFPx',
 at:'2026-10-21T02:03:39Z',side:'BUY_LIKE',baseUnits:157429.423304,quoteUnits:50
}];
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
  if(!response.ok){results.push({label:ex.label,signature:ex.signature,status:'PUBLIC_RPC_HTTP_'+response.status,corroborated:false});continue;}
  const payload=await response.json();
  if(payload?.error){results.push({label:ex.label,signature:ex.signature,status:'PUBLIC_RPC_JSON_RPC_ERROR',
   rpcCode:Number.isInteger(payload.error.code)?payload.error.code:null,corroborated:false});continue;}
  const audit=auditRawSignature(ex,payload?.result);
  results.push({label:ex.label,signature:ex.signature,at:ex.at,mint:ex.mint,side:ex.side,
   status:audit.status,corroborated:audit.corroborated,
   walletSignerObserved:audit.walletSignerObserved??null,feeLamports:audit.feeLamports??null,
   swapVerified:false,realizedPnlUsd:null,independenceVerified:false});
 }catch(error){results.push({label:ex.label,signature:ex.signature,status:error?.name==='AbortError'?'PUBLIC_RPC_TIMEOUT':'PUBLIC_RPC_UNAVAILABLE',corroborated:false});}
 finally{clearTimeout(timeout);}
}
const php=results.filter(r=>r.mint===study.walletClaims.php.mint);
console.log('TRADER_RADAR_PUBLIC_RAW_PROBE',JSON.stringify({
 network:'solana-mainnet',source:'PUBLIC_SOLANA_JSON_RPC',
 phpExpected:7,phpCorroborated:php.filter(r=>r.corroborated).length,
 results,transactionsRequested:examples.length,
 allPhpRawBalanceProofs:php.length===7&&php.every(r=>r.corroborated&&r.walletSignerObserved===true),
 verifiedExecutedTrades:0,verifiedRealizedPnlUsd:null,
 caveat:'Seven-event raw wallet deltas are not independently verified beneficial-owner identity, swap routing, transfer-free inventory, execution-fee-adjusted profit or investable convergence.'
}));
