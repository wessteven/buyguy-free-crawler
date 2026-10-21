import test from 'node:test';
import assert from 'node:assert/strict';
import {runHeliusDiscoveryExperiment} from '../src/helius-discovery-experiment.mjs';
import {PUMPSWAP} from '../src/pumpswap.mjs';
const pool='11111111111111111111111111111111';
const sig='a'.repeat(88);
test('opt-in experiment never runs without RPC',async()=>{
 assert.equal((await runHeliusDiscoveryExperiment({})).enabled,false);
});
test('parsed initialization leads to bounded account verification but not certification',async()=>{
 const calls=[];
 const fetcher=async(_url,options)=>{
  const body=JSON.parse(options.body);calls.push(body.method);
  if(body.method==='getSignaturesForAddress')return {ok:true,json:async()=>({result:[{signature:sig,err:null,slot:2}]})};
  if(body.method==='getTransaction')return {ok:true,json:async()=>({result:{
   meta:{err:null},transaction:{message:{instructions:[{
    programId:PUMPSWAP,parsed:{type:'initialize',info:{pool}}
   }]}}
  }})};
  if(body.method==='getAccountInfo')return {ok:true,json:async()=>({result:{value:{owner:pool,data:['AA==','base64']}}})};
  throw Error('Unexpected RPC method');
 };
 const result=await runHeliusDiscoveryExperiment({HELIUS_RPC_URL:'https://example.org'},{fetcher});
 assert.deepEqual(calls,['getSignaturesForAddress','getTransaction','getAccountInfo']);
 assert.equal(result.poolLeads,1);
 assert.equal(result.poolsChecked,1);
 assert.equal(result.results[0].status,'PROGRAM_OWNER_MISMATCH');
 assert.equal(result.results[0].verified,false);
});
test('unparsed program instruction is not a pool lead',async()=>{
 const calls=[];
 const fetcher=async(_url,options)=>{
  const body=JSON.parse(options.body);calls.push(body.method);
  if(body.method==='getSignaturesForAddress')return {ok:true,json:async()=>({result:[{signature:sig,err:null}]})};
  if(body.method==='getTransaction')return {ok:true,json:async()=>({result:{meta:{err:null},
   transaction:{message:{instructions:[{programId:PUMPSWAP,data:'opaque'}]}}}})};
  throw Error('Unexpected pool account lookup');
 };
 const result=await runHeliusDiscoveryExperiment({HELIUS_RPC_URL:'https://example.org'},{fetcher});
 assert.equal(result.poolLeads,0);
 assert.equal(result.poolsChecked,0);
 assert.deepEqual(calls,['getSignaturesForAddress','getTransaction']);
});
