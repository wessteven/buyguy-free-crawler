import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyHeliusPoolLeads} from '../src/helius-pool-verification.mjs';
import {PUMPSWAP} from '../src/pumpswap.mjs';
const pool='2'.repeat(32);
const env={HELIUS_RPC_URL:'https://example.org'};
const lead={protocol:'PUMPSWAP',pool};
test('wrong owner cannot be mistaken for layout verification',async()=>{
 const r=await verifyHeliusPoolLeads(env,{leads:[lead],fetcher:async()=>({
  ok:true,json:async()=>({result:{value:{owner:'1'.repeat(32),data:['AA==','base64']}}})
 })});
 assert.equal(r.results[0].status,'PROGRAM_OWNER_MISMATCH');
 assert.equal(r.results[0].ownerMatchesExpected,false);
 assert.equal(r.results[0].layoutVerified,false);
});
test('correct owner with malformed binary layout is not verified',async()=>{
 const r=await verifyHeliusPoolLeads(env,{leads:[lead],fetcher:async()=>({
  ok:true,json:async()=>({result:{value:{owner:PUMPSWAP,data:['AA==','base64']}}})
 })});
 assert.equal(r.results[0].ownerMatchesExpected,true);
 assert.equal(r.results[0].layoutVerified,false);
 assert.equal(r.results[0].verified,false);
});
