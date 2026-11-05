#!/usr/bin/env node
// Production D1 read-only audit mirroring the authenticated dashboard's bounded
// evidence. Never calls Helius/Gecko/Dex, changes D1 or places trades.
import {writeFile} from 'node:fs/promises';
import {walletSourceQuality} from '../src/goget-wallet-source-quality-panel.mjs';
const requireEnv=k=>{const v=process.env[k];if(!v)throw Error('MISSING_'+k);return v;};
const account=requireEnv('CF_ACCOUNT_ID'),database=requireEnv('CF_DATABASE_ID'),secret=requireEnv('CF_D1_API_TOKEN');
const url='https://api.cloudflare.com/client/v4/accounts/'+encodeURIComponent(account)+'/d1/database/'+encodeURIComponent(database)+'/query';
let reads=0;
const db={prepare(sql){
 if(!/^(SELECT|WITH)\s/i.test(sql))throw Error('WALLET_QUALITY_NOT_READ_ONLY');
 return {bind(...params){return {async all(){
  if(++reads>10)throw Error('WALLET_QUALITY_READ_BUDGET');
  const r=await fetch(url,{method:'POST',headers:{
   authorization:'Bearer '+secret,'content-type':'application/json'},
   body:JSON.stringify({sql,params}),signal:AbortSignal.timeout(19000)});
  if(!r.ok)throw Error('WALLET_QUALITY_HTTP_'+r.status);
  const doc=await r.json(),result=doc?.result?.[0];
  if(doc?.success!==true||result?.success!==true||!Array.isArray(result.results))
   throw Error('WALLET_QUALITY_D1_INVALID');
  return result;
 }};}
 }};
async function main(){
 const report=await walletSourceQuality(db);
 report.d1Reads=reads;
 await writeFile('goget-wallet-source-quality-audit.json',JSON.stringify(report,null,2)+'\n');
 const digest={asOf:report.asOf,status:report.status,historicalBridgesComplete:report.historicalBridgesComplete,
  forwardSource:report.forwardSource,
  walletCoverage:report.wallets.map(w=>({wallet:w.wallet,historical:w.historical.state,
   source:w.forward.state,sourceSignatures:w.forward.archivedSignatures,
   rpcDecodedExactMatches:w.decoding.originalRpcDecodedMatches,
   enhancedHistoricExactMatches:w.decoding.historicalEnhancedParsedMatches,
   enhancedWebhookExactMatches:w.decoding.liveEnhancedWebhookMatches})),
  marketCandles:report.marketCandles,budgets:report.budgets,
  d1Reads:reads,d1Writes:0,heliusCalls:0,trades:0};
 console.log('GOGET_WALLET_SOURCE_QUALITY_AUDIT',JSON.stringify(digest));
 if(report.wallets.length!==3||report.unrecognizedSourceWallets.length||
  report.status==='SCOPE_OR_D1_EVIDENCE_UNVERIFIED')process.exitCode=1;
}
main().catch(e=>{console.error('GOGET_WALLET_SOURCE_QUALITY_ERROR',
 /^WALLET_QUALITY_[A-Z0-9_]+|^MISSING_[A-Z_]+$/.test(e?.message||'')?e.message:'SOURCE_UNVERIFIED');
 process.exitCode=1;});
