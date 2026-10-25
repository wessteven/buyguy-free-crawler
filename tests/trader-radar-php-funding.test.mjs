import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildPhpRawAuditPlan,SOLANA_USDC} from '../src/trader-radar-php-proof-plan.mjs';
import {classifyWalletUsdcReceipt} from '../src/trader-radar-funding.mjs';
import {scoreRealizedPerformance} from '../src/trader-radar.mjs';
const study=JSON.parse(readFileSync(new URL('../data/trader-radar/2026-10-21-cost-basis-study.json',import.meta.url),'utf8'));
const wallet='AH75Bn6QHSt5K2Ad4p1otns3JTwpSJWZTwiwKWNhmnKx';
const other='AGdtsMmphhymH5wYW3dWKSkAxpLYRrNDCTFAfuq8ii9v';
const alt='DvdmEnztCmXwBnAbedD48XVGZJSxq31zNvnyftXdpump';
const leg=(mint,tokenAmount,fromUserAccount,toUserAccount)=>({mint,tokenAmount,fromUserAccount,toUserAccount});
test('raw PHP proof plan covers five dated acquisitions and two disposals in order',()=>{
 const r=buildPhpRawAuditPlan(study);
 assert.equal(r.expectedTotal,7);
 assert.equal(r.complete,true);
 assert.equal(r.events.length,7);
 assert.equal(new Set(r.events.map(e=>e.signature)).size,7);
 assert.equal(r.events.filter(e=>e.side==='BUY_LIKE').length,5);
 assert.equal(r.events.filter(e=>e.side==='SELL_LIKE').length,2);
 assert.deepEqual(r.events.map(e=>e.at),[...r.events.map(e=>e.at)].sort());
 assert.ok(r.events.every(e=>e.wallet===wallet&&e.quoteMint===SOLANA_USDC));
 assert.equal(r.verifiedRealizedPnlUsd,null);
});
test('proof plan refuses incomplete, duplicate, invalid or unpriced events',()=>{
 const broken=structuredClone(study);
 broken.walletClaims.php.acquisitionEvents.pop();
 assert.throws(()=>buildPhpRawAuditPlan(broken),/INCOMPLETE/);
 const duplicates=structuredClone(study);
 duplicates.walletClaims.php.disposalEvents[0].signature=duplicates.walletClaims.php.acquisitionEvents[0].signature;
 assert.throws(()=>buildPhpRawAuditPlan(duplicates),/INVALID_PHP_PROOF/);
 const missingTime=structuredClone(study);
 missingTime.walletClaims.php.disposalEvents[0].at='not-a-time';
 assert.throws(()=>buildPhpRawAuditPlan(missingTime),/INVALID_PHP_PROOF/);
 const shortened=buildPhpRawAuditPlan(study,{maxEvents:2});
 assert.equal(shortened.complete,false);
});
test('USDC credited alongside sale of another token is NOT verified external funding',()=>{
 const r=classifyWalletUsdcReceipt(wallet,{tokenTransfers:[
  leg(SOLANA_USDC,4587,other,wallet),
  leg(alt,1795715,wallet,other)
 ]});
 assert.equal(r.status,'USDC_RECEIPT_WITH_TOKEN_DISPOSAL');
 assert.equal(r.netUsdcUnits,4587);
 assert.equal(r.fundingVerified,false);
 assert.equal(r.outgoingTokenMints[0],alt);
});
test('unpaired USDC receipt is still not a proven third-party funding source',()=>{
 const r=classifyWalletUsdcReceipt(wallet,{tokenTransfers:[leg(SOLANA_USDC,1000,other,wallet)]});
 assert.equal(r.status,'UNPAIRED_USDC_RECEIPT');
 assert.equal(r.fundingVerified,false);
 assert.equal(r.independentBeneficialOwnerVerified,false);
 assert.deepEqual(r.directTokenTransferSources,[other]);
});
test('reject malformed transfers, no receipt, failed tx and low notional',()=>{
 assert.equal(classifyWalletUsdcReceipt(wallet,{transactionError:{code:1},tokenTransfers:[]}).status,'INVALID_OR_FAILED_TRANSACTION');
 assert.equal(classifyWalletUsdcReceipt(wallet,{tokenTransfers:[leg(SOLANA_USDC,0,other,wallet)]}).status,'MALFORMED_TOKEN_TRANSFER');
 assert.equal(classifyWalletUsdcReceipt(wallet,{tokenTransfers:[leg(SOLANA_USDC,5,other,wallet)]}).status,'NO_MEANINGFUL_USDC_NET_RECEIPT');
});
test('raw proof plan is never a verified realized-PnL input',()=>{
 const events=buildPhpRawAuditPlan(study).events.map(e=>({wallet:e.wallet,mint:e.mint,signature:e.signature,
  at:e.at,side:e.side==='BUY_LIKE'?'BUY':'SELL',quantity:e.baseUnits,usd:e.quoteUnits,
  feesUsd:null,confirmed:false,basisKnown:false}));
 const result=scoreRealizedPerformance(wallet,events);
 assert.equal(result.realizedPnlUsd,null);
 assert.equal(result.eligible,false);
 assert.equal(result.reason,'INCOMPLETE_BASIS');
});
