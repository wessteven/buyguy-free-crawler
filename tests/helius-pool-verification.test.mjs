import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyHeliusPoolLeads} from '../src/helius-pool-verification.mjs';
import {PUMPSWAP} from '../src/pumpswap.mjs';
const pool='11111111111111111111111111111111';
test('verification stays disabled without Helius and never calls RPC',async()=>{
 const result=await verifyHeliusPoolLeads({},{leads:[{protocol:'PUMPSWAP',pool}]});
 assert.equal(result.enabled,false);
});
test('bounded leads, exact program owner, no D1 writes',async()=>{
 let calls=0;
 const leads=Array.from({length:9},(_,i)=>({protocol:'PUMPSWAP',pool:i===0?pool:('2'.repeat(32+i))}));
 const result=await verifyHeliusPoolLeads({HELIUS_RPC_URL:'https://example.org'},{
  leads,fetcher:async(_url,opts)=>{
   calls++;
   assert.equal(JSON.parse(opts.body).method,'getAccountInfo');
   return {ok:true,json:async()=>({result:{value:{owner:'11111111111111111111111111111111',data:['AA==','base64']}}})};
  }
 });
 assert.equal(calls,3);
 assert.ok(result.results.every(x=>x.status==='PROGRAM_OWNER_MISMATCH'&&!x.verified));
});
test('matching program without valid binary pool layout remains unverified',async()=>{
 const result=await verifyHeliusPoolLeads({HELIUS_RPC_URL:'https://example.org'},{
  leads:[{protocol:'PUMPSWAP',pool}],fetcher:async()=>({ok:true,json:async()=>({
   result:{value:{owner:PUMPSWAP,data:['AA==','base64'],executable:false}}
  })})
 });
 assert.equal(result.results.length,1);
 assert.equal(result.results[0].verified,false);
 assert.notEqual(result.results[0].status,'POOL_ACCOUNT_LAYOUT_VERIFIED');
});
test('unknown protocols and invalid pools are not queried',async()=>{
 const result=await verifyHeliusPoolLeads({HELIUS_RPC_URL:'https://example.org'},{
  leads:[{protocol:'UNKNOWN',pool},{protocol:'PUMPSWAP',pool:'bad'}],
  fetcher:async()=>{throw Error('Unexpected request')}
 });
 assert.equal(result.checked,0);
});
