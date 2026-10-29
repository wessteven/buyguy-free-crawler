import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {decodeLaunchlabSwapTransaction} from '../src/launchlab-raw-swap-research.mjs';
import {buildLaunchlabRawReceiptLedger} from '../src/launchlab-raw-receipt-ledger-research.mjs';
import {LAUNCHLAB_PROGRAM} from '../src/launchlab-birth-research.mjs';

const realBirth=JSON.parse(readFileSync(new URL(
 './fixtures/float-launchlab-birth-2026-10-28.json',import.meta.url),'utf8'));
const A='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const addr=c=>c.repeat(32);
const signatureFor=n=>'7'.repeat(87)+A[n+5];
const T=Date.parse('2026-10-30T03:00:00.000Z')/1000;
const iso=t=>new Date(t*1000).toISOString();
const quote='So11111111111111111111111111111111111111112';
const token='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const token2022='TokenzQdBNbLqP5VEhdkAS6EPF4rEM3LhLQzwkpA3sA';
const discs={
 BUY_EXACT_IN:[250,234,13,123,213,156,19,236],
 BUY_EXACT_OUT:[24,211,116,40,105,3,153,56],
 SELL_EXACT_IN:[149,39,222,155,211,124,152,26],
 SELL_EXACT_OUT:[95,200,71,34,8,9,11,166]
};
function base58(bytes){
 let n=0n;for(const b of bytes)n=n*256n+BigInt(b);
 let out='';while(n){out=A[Number(n%58n)]+out;n/=58n;}
 for(const b of bytes){if(b!==0)break;out='1'+out}
 return out||'1';
}
function makeTx({
 id=0,t=T+3,kind='BUY_EXACT_IN',mint=realBirth.expectedMint,
 curve=realBirth.expectedCurve,quoteMint=quote,
 feePayer=addr('A'),trader=feePayer,token2022Base=false,
 fail=false,inner=false,wrongSigner=false,wrongProgram=false
}={}){
 const sig=signatureFor(id);
 const data=new Uint8Array(32);
 data.set(discs[kind]);
 const view=new DataView(data.buffer);
 view.setBigUint64(8,1000000000n,true);
 view.setBigUint64(16,900000000n,true);
 view.setBigUint64(24,0n,true);
 const accounts=[trader,addr('C'),addr('D'),addr('E'),curve,
  addr('F'),addr('G'),addr('H'),addr('J'),mint,quoteMint,
  token2022Base?token2022:token,token,addr('K'),
  wrongProgram?addr('Z'):LAUNCHLAB_PROGRAM];
 const ix={programId:LAUNCHLAB_PROGRAM,data:base58(data),accounts};
 const keys=[{pubkey:feePayer,signer:true}];
 if(trader!==feePayer)keys.push({pubkey:trader,signer:!wrongSigner});
 if(wrongSigner&&trader===feePayer)keys[0].signer=false;
 return {
  signature:sig,receivedAt:iso(t+1),
  transaction:{
   slot:462635268+id,blockTime:t,meta:{
    err:fail?{InstructionError:[0,'Custom']}:null,
    innerInstructions:inner?[{index:0,instructions:[ix]}]:[]
   },
   transaction:{signatures:[sig],message:{
    accountKeys:keys,instructions:inner?[]:[ix]
   }}
  }
 };
}
const birth={
 signature:realBirth.signature,slot:realBirth.slot,
 classification:'LAUNCH_INSTRUCTION_VERIFIED',
 evidence:'SUCCESSFUL_ANCHOR_INITIALIZE_DISCRIMINATOR_AND_IDL_ACCOUNTS',
 origin:'POST_ACK_LIVE_LOG_HINT',
 mint:realBirth.expectedMint,curve:realBirth.expectedCurve,quoteMint:quote,
 streamReceivedAt:iso(T),verifiedAt:iso(T+0.5),buyQualified:false
};
const identity={mint:birth.mint,curve:birth.curve,programId:LAUNCHLAB_PROGRAM,
 sourceProof:'CALLER_ATTESTED_BOUNDED_FULL_PAGINATION',complete:true};
function fixture(){
 const rawTransactions=[];
 for(let i=0;i<3;i++)rawTransactions.push(makeTx({
  id:i,t:T+3+i*6,feePayer:addr('ABC'[i])}));
 for(let i=0;i<6;i++)rawTransactions.push(makeTx({
  id:i+3,t:T+33+i*3,feePayer:addr('ABCDEF'[i])}));
 rawTransactions.push(makeTx({id:9,t:T+52,kind:'SELL_EXACT_IN',
  feePayer:addr('H')}));
 const windows=[
  {...identity,start:iso(T),end:iso(T+30),receivedAt:iso(T+31)},
  {...identity,start:iso(T+30),end:iso(T+60),receivedAt:iso(T+62)}
 ];
 return {birth,rawTransactions,windows,asOf:iso(T+65)};
}
test('official IDL discriminators and account positions decode all four successful swap variants',()=>{
 for(const kind of Object.keys(discs)){
  const raw=makeTx({kind});
  const r=decodeLaunchlabSwapTransaction(raw);
  assert.equal(r.status,'DECODED_SUCCESSFUL_SWAP_INSTRUCTION',kind);
  assert.equal(r.count,1);
  assert.equal(r.swaps[0].kind,kind);
  assert.equal(r.swaps[0].side,kind.startsWith('BUY')?'buy':'sell');
  assert.equal(r.swaps[0].mint,birth.mint);
  assert.equal(r.swaps[0].curve,birth.curve);
  assert.equal(r.swaps[0].quoteMint,quote);
  assert.equal(r.swaps[0].instructionArgumentsU64.first,'1000000000');
  assert.equal(r.swaps[0].executedQuoteSol,null);
  assert.equal(r.swaps[0].independentBuyersVerified,null);
  assert.equal(r.sourceIdentityIndependentlyVerified,false);
  assert.equal(r.buyQualified,false);
 }
});
test('inner CPI LaunchLab instruction is decoded, without attributing fee payer to beneficial buyer',()=>{
 const r=decodeLaunchlabSwapTransaction(makeTx({
  inner:true,feePayer:addr('A'),trader:addr('B')}));
 assert.equal(r.count,1);
 assert.equal(r.swaps[0].traderSigner,addr('B'));
 assert.equal(r.swaps[0].feePayer,addr('A'));
 assert.equal(r.swaps[0].independentBuyersVerified,null);
});
test('failed, unsigned, mismatched-signature and malformed accounts fail closed',()=>{
 const raw=makeTx();
 assert.equal(decodeLaunchlabSwapTransaction(makeTx({fail:true})).status,'FAILED_TRANSACTION');
 assert.equal(decodeLaunchlabSwapTransaction(makeTx({
  trader:addr('B'),wrongSigner:true})).status,'MALFORMED_SWAP_INSTRUCTION');
 assert.equal(decodeLaunchlabSwapTransaction(makeTx({
  wrongProgram:true})).status,'MALFORMED_SWAP_INSTRUCTION');
 const forged=structuredClone(raw);forged.transaction.transaction.signatures[0]=signatureFor(22);
 assert.equal(decodeLaunchlabSwapTransaction(forged).status,'TRANSACTION_SIGNATURE_MISMATCH');
 const unsigned=structuredClone(raw);
 unsigned.transaction.transaction.message.accountKeys[0].signer=false;
 assert.equal(decodeLaunchlabSwapTransaction(unsigned).status,'FEE_PAYER_SIGNER_UNVERIFIED');
});
test('Token-2022 swap is decoded but extensions and sellability remain unknown',()=>{
 const r=decodeLaunchlabSwapTransaction(makeTx({token2022Base:true}));
 assert.equal(r.swaps[0].token2022,true);
 assert.equal(r.swaps[0].executableExitVerified,false);
 assert.equal(r.swaps[0].buyQualified,false);
});
test('raw instruction 30-second ledger is receipt gated, identity scoped and never a live alert',()=>{
 const r=buildLaunchlabRawReceiptLedger(fixture());
 assert.equal(r.status,'OFFLINE_RAW_SWAP_HYPOTHESES');
 assert.equal(r.episodeCount,1);
 assert.equal(r.episodes[0].firstWindowBuys,3);
 assert.equal(r.episodes[0].secondWindowBuys,6);
 assert.equal(r.episodes[0].earliestEvidenceReadyAt,iso(T+62));
 assert.equal(r.episodes[0].evidenceReadyAfterWindowEndMs,2000);
 assert.equal(r.decodedTransactions,10);
 assert.equal(r.coverageIndependentlyVerified,false);
 assert.equal(r.sourceIdentityIndependentlyVerified,false);
 assert.equal(r.rawInstructionIdentityValidated,true);
 assert.equal(r.episodes[0].independentBuyers,null);
 assert.equal(r.episodes[0].executedQuoteSol,null);
 assert.equal(r.episodes[0].actualLiveAlertLatencyMs,null);
 assert.equal(r.buyQualified,false);
});
test('as-of before second window receipt never backdates an acceleration hypothesis',()=>{
 const r=buildLaunchlabRawReceiptLedger({...fixture(),asOf:iso(T+61)});
 assert.equal(r.episodeCount,0);
 assert.equal(r.status,'NO_RAW_SWAP_HYPOTHESIS');
});
test('late raw transaction receipts are not counted at an earlier as-of',()=>{
 const x=fixture();
 for(let i=3;i<7;i++)x.rawTransactions[i].receivedAt=iso(T+80);
 const r=buildLaunchlabRawReceiptLedger(x);
 assert.equal(r.episodeCount,0);
 assert.equal(r.decodedTransactions,6);
});
test('a source-complete window cannot precede a constituent transaction receipt',()=>{
 const x=fixture();
 x.rawTransactions[8].receivedAt=iso(T+64);
 assert.equal(buildLaunchlabRawReceiptLedger(x).status,
  'CAUSAL_COVERAGE_RECEIPT_CONTRADICTION');
});
test('mixed mint, curve, incomplete source and forged birth never produce episodes',()=>{
 const x=fixture();
 x.rawTransactions[0]=makeTx({id:0,mint:addr('Z')});
 assert.equal(buildLaunchlabRawReceiptLedger(x).status,'MIXED_OR_MISMATCHED_POOL_IDENTITY');
 const y=fixture();y.rawTransactions[0]=makeTx({id:0,curve:addr('Z')});
 assert.equal(buildLaunchlabRawReceiptLedger(y).episodeCount,0);
 const z=fixture();z.windows[0].sourceProof='UNKNOWN';
 assert.equal(buildLaunchlabRawReceiptLedger(z).status,'INVALID_OR_UNATTESTED_COVERAGE_WINDOW');
 assert.equal(buildLaunchlabRawReceiptLedger({...fixture(),
  birth:{...birth,classification:'LOG_HINT'}}).episodeCount,0);
});
test('conflicting duplicate signatures and multi-swap transactions are rejected',()=>{
 const x=fixture();
 x.rawTransactions.push(makeTx({id:0,kind:'BUY_EXACT_OUT'}));
 assert.equal(buildLaunchlabRawReceiptLedger(x).status,'CONFLICTING_DUPLICATE_SIGNATURE');
 const y=fixture();
 const extra=structuredClone(y.rawTransactions[0].transaction.transaction.message.instructions[0]);
 y.rawTransactions[0].transaction.transaction.message.instructions.push(extra);
 assert.equal(buildLaunchlabRawReceiptLedger(y).status,'MULTI_SWAP_SIGNATURE_AMBIGUOUS');
});
test('unsupported or failed transactions block a falsely complete research ledger',()=>{
 const x=fixture();x.rawTransactions[0]=makeTx({id:0,fail:true});
 const r=buildLaunchlabRawReceiptLedger(x);
 assert.equal(r.status,'RAW_SWAP_UNRESOLVED');
 assert.equal(r.unresolvedStatus,'FAILED_TRANSACTION');
});
test('Token-2022 extension warning, no quote volume and no safety claims',()=>{
 const x=fixture();
 x.rawTransactions[0]=makeTx({id:0,t:T+3,token2022Base:true});
 const r=buildLaunchlabRawReceiptLedger(x);
 assert.equal(r.episodeCount,1);
 assert.ok(r.episodes[0].warnings.includes('TOKEN_2022_EXTENSIONS_UNASSESSED'));
 assert.equal(r.episodes[0].executedQuoteSol,null);
 assert.equal(r.episodes[0].executableExitVerified,false);
});
test('bounded input and invalid as-of fail fast',()=>{
 const x=fixture();
 assert.throws(()=>buildLaunchlabRawReceiptLedger({...x,
  rawTransactions:Array(301).fill(x.rawTransactions[0])}),/BOUNDED/);
 assert.throws(()=>buildLaunchlabRawReceiptLedger({...x,asOf:'2026-10-30'}),/UTC/);
});
