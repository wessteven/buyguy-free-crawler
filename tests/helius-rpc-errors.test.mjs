import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyHeliusSignatures} from '../src/helius-discovery-probe.mjs';
const signature='a'.repeat(88);
for(const [code,reason] of [[-32015,'UNSUPPORTED_TRANSACTION_VERSION'],[-32004,'TRANSACTION_HISTORY_UNAVAILABLE'],[-32602,'INVALID_RPC_PARAMS'],[-32000,'OTHER_RPC_ERROR']]){
 test('sanitized Helius RPC classification '+code,async()=>{
  const result=await classifyHeliusSignatures({HELIUS_RPC_URL:'https://example.org'},{
   signatures:[signature],fetcher:async()=>({ok:true,json:async()=>({error:{code,message:'DO NOT LOG SECRET'}})})
  });
  assert.equal(result.results[0].rpcErrorReason,reason);
  assert.equal(result.results[0].rpcErrorCode,code);
  assert.equal(result.results[0].status,'RPC_ERROR');
  assert.equal(JSON.stringify(result).includes('DO NOT LOG SECRET'),false);
 });
}
test('null transaction response is distinct from RPC error',async()=>{
 const result=await classifyHeliusSignatures({HELIUS_RPC_URL:'https://example.org'},{
  signatures:[signature],fetcher:async()=>({ok:true,json:async()=>({result:null})})
 });
 assert.equal(result.results[0].status,'TRANSACTION_UNAVAILABLE');
});
