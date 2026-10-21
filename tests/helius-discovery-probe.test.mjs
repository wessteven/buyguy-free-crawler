import test from 'node:test';
import assert from 'node:assert/strict';
import {heliusDiscoveryProbe} from '../src/helius-discovery-probe.mjs';
const program='11111111111111111111111111111111';
test('probe stays off without configured RPC and program',async()=>{
 assert.equal((await heliusDiscoveryProbe({})).enabled,false);
 assert.equal((await heliusDiscoveryProbe({HELIUS_RPC_URL:'https://example.org'})).enabled,false);
});
test('bounded read-only RPC never labels a signature as a token',async()=>{
 let requests=0;
 const result=await heliusDiscoveryProbe({HELIUS_RPC_URL:'https://example.org'},{
  program,limit:999,fetcher:async(_url,opts)=>{
   requests++;
   const body=JSON.parse(opts.body);
   assert.equal(body.method,'getSignaturesForAddress');
   assert.equal(body.params[1].limit,20);
   return {ok:true,json:async()=>({result:[{signature:'a'.repeat(88),slot:123,blockTime:10,err:null}]})};
  }
 });
 assert.equal(requests,1);
 assert.equal(result.candidates.length,1);
 assert.equal(result.candidates[0].status,'UNCLASSIFIED');
});
