import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {joinVerifiedLaunchlabTo30sFlow} from '../src/launchlab-flow-join-research.mjs';
import {LAUNCHLAB_PROGRAM} from '../src/launchlab-birth-research.mjs';
const f=JSON.parse(readFileSync(new URL('./fixtures/float-launchlab-birth-2026-10-28.json',import.meta.url),'utf8'));
const T=Date.parse('2026-10-30T03:00:00.000Z')/1000;
const iso=sec=>new Date(sec*1000).toISOString();
const proof='DECODED_SWAP_PROGRAM_ACCOUNTS';
const quote='So11111111111111111111111111111111111111112';
const payer=['A','B','C','D','E','F','G','H'].map(x=>x.repeat(32));
const letters='ABCDEFGHJKLMNPQRSTUVWXYZ';
const birth={
 signature:f.signature,slot:f.slot,classification:'LAUNCH_INSTRUCTION_VERIFIED',
 evidence:'SUCCESSFUL_ANCHOR_INITIALIZE_DISCRIMINATOR_AND_IDL_ACCOUNTS',
 origin:'POST_ACK_LIVE_LOG_HINT',mint:f.expectedMint,curve:f.expectedCurve,
 quoteMint:quote,streamReceivedAt:iso(T),verifiedAt:iso(T+0.5),
 buyQualified:false
};
const identity={mint:f.expectedMint,curve:f.expectedCurve,
 programId:LAUNCHLAB_PROGRAM,sourceProof:proof};
function fixture(){
 const observations=[];let n=0;
 const event=(t,side,who)=>{
  observations.push({...identity,t,side,payer:payer[who],sol:0.1,
   sig:'7'.repeat(87)+letters[n++],receivedAt:iso(t+1)});
 };
 for(let i=0;i<3;i++)event(T+3+i*6,'buy',i);
 event(T+25,'sell',7);
 for(let i=0;i<6;i++)event(T+33+i*3,'buy',i);
 event(T+52,'sell',7);event(T+57,'sell',7);
 const windows=[{...identity,start:iso(T),end:iso(T+60),
  complete:true,receivedAt:iso(T+62)}];
 return {observations,windows,asOf:iso(T+65),birth};
}
test('exact curve/mint and receipt-complete offline windows join, without inventing live alert or buyers',()=>{
 const r=joinVerifiedLaunchlabTo30sFlow(fixture());
 assert.equal(r.status,'OFFLINE_IDENTITY_SCOPED_HYPOTHESES');
 assert.equal(r.episodeCount,1);
 assert.equal(r.episodes[0].firstWindowBuys,3);
 assert.equal(r.episodes[0].secondWindowBuys,6);
 assert.equal(r.episodes[0].earliestEvidenceReadyAt,iso(T+62));
 assert.equal(r.episodes[0].evidenceReadyAfterWindowEndMs,2000);
 assert.equal(r.episodes[0].actualLiveAlertLatencyMs,null);
 assert.equal(r.episodes[0].independentBuyers,null);
 assert.equal(r.sourceIdentityIndependentlyVerified,false);
 assert.equal(r.marketCapUsd,null);
 assert.equal(r.liquidityUsd,null);
 assert.equal(r.executableExitVerified,false);
 assert.equal(r.buyQualified,false);
});
test('complete source window received after as-of cannot create a backdated hypothesis',()=>{
 const r=joinVerifiedLaunchlabTo30sFlow({...fixture(),asOf:iso(T+61)});
 assert.equal(r.episodeCount,0);
 assert.equal(r.status,'NO_CAUSALLY_COMPLETE_IDENTITY_WINDOWS');
});
test('birth not verified by cutoff and forged birth provenance are rejected',()=>{
 const x=fixture();
 assert.equal(joinVerifiedLaunchlabTo30sFlow({...x,asOf:iso(T)}).status,
  'BIRTH_VERIFICATION_NOT_YET_AVAILABLE');
 assert.equal(joinVerifiedLaunchlabTo30sFlow({...x,birth:{...birth,
  classification:'UNVERIFIED_LOG_HINT'}}).status,'UNVERIFIED_OR_INCOMPLETE_BIRTH');
 assert.equal(joinVerifiedLaunchlabTo30sFlow({...x,birth:{...birth,
  buyQualified:true}}).status,'UNVERIFIED_OR_INCOMPLETE_BIRTH');
});
test('mixed mint, curve, program or unverified decoder evidence fails closed',()=>{
 const x=fixture();
 for(const field of ['mint','curve','programId','sourceProof']){
  const observations=x.observations.map(e=>({...e}));
  observations[0][field]='WRONG_IDENTITY';
  const r=joinVerifiedLaunchlabTo30sFlow({...x,observations});
  assert.equal(r.status,'MIXED_OR_UNVERIFIED_SOURCE_IDENTITY',field);
  assert.equal(r.episodeCount,0);
 }
 const windows=x.windows.map(w=>({...w,curve:'WRONG_CURVE'}));
 assert.equal(joinVerifiedLaunchlabTo30sFlow({...x,windows}).episodeCount,0);
});
test('missing receipt, receipt earlier than event, and event received after as-of are rejected',()=>{
 const x=fixture();
 const noReceipt=x.observations.map(e=>({...e}));
 delete noReceipt[0].receivedAt;
 assert.equal(joinVerifiedLaunchlabTo30sFlow({...x,observations:noReceipt}).status,
  'SOURCE_RECEIPT_PROVENANCE_MISSING');
 const impossible=x.observations.map(e=>({...e}));
 impossible[0].receivedAt=iso(impossible[0].t-1);
 assert.equal(joinVerifiedLaunchlabTo30sFlow({...x,observations:impossible}).status,
  'INVALID_EVENT_OR_RECEIPT_TIME');
 const late=x.observations.map(e=>({...e}));
 late[0].receivedAt=iso(T+80);
 assert.equal(joinVerifiedLaunchlabTo30sFlow({...x,observations:late}).status,
  'FUTURE_EVENT_RECEIPT_AT_CAUSAL_CUTOFF');
});
test('windows preceding live birth receipt do not count as early flow',()=>{
 const x=fixture();
 const later={...birth,streamReceivedAt:iso(T+1),verifiedAt:iso(T+2)};
 const r=joinVerifiedLaunchlabTo30sFlow({...x,birth:later});
 assert.equal(r.episodeCount,0);
 assert.equal(r.status,'NO_CAUSALLY_COMPLETE_IDENTITY_WINDOWS');
});
test('bounded input and strict as-of time are enforced',()=>{
 const x=fixture();
 assert.throws(()=>joinVerifiedLaunchlabTo30sFlow({...x,asOf:'2026-10-30'}),/VALID_UTC/);
 assert.throws(()=>joinVerifiedLaunchlabTo30sFlow({...x,
  observations:Array(5001).fill(x.observations[0])}),/BOUNDED/);
});
