import test from 'node:test';
import assert from 'node:assert/strict';
import {replayKnownPoolTransactions} from '../src/helius-historical-pool-replay.mjs';
import {PUMPSWAP} from '../src/pumpswap.mjs';
import {RAYDIUM_CPMM} from '../src/raydium-cpmm.mjs';
const pool='11111111111111111111111111111111',signature='a'.repeat(88);
const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function b58(bytes){let n=0n;for(const b of bytes)n=n*256n+BigInt(b);
 let s='';while(n){s=alphabet[Number(n%58n)]+s;n/=58n;}return s;}
for(const [protocol,program,disc,index,count] of [
 ['PUMPSWAP',PUMPSWAP,[233,146,209,142,207,104,64,188],0,18],
 ['RAYDIUM_CPMM',RAYDIUM_CPMM,[175,175,109,31,13,152,155,237],3,20]
])test('historical replay finds exact binary instruction '+protocol,async()=>{
 const methods=[];
 const fetcher=async(_url,opts)=>{const {method}=JSON.parse(opts.body);methods.push(method);
  if(method==='getTransaction')return {ok:true,json:async()=>({result:{
   meta:{err:null},transaction:{message:{instructions:[{
    programId:program,data:b58([...disc,1]),accounts:Array(count).fill(pool)
   }]}}
  }})};
  if(method==='getAccountInfo')return {ok:true,json:async()=>({result:{value:{owner:pool,data:['AA==','base64']}}})};
  throw Error('Unexpected method');
 };
 const result=await replayKnownPoolTransactions({HELIUS_RPC_URL:'https://example.org'},{
  cases:[{protocol,signature,expectedPool:pool}],fetcher
 });
 assert.equal(result.results[0].leadDetected,true);
 assert.equal(result.results[0].outcome,'EXPECTED_POOL_INSTRUCTION_FOUND');
 assert.equal(result.results[0].poolVerification.verified,false);
 assert.deepEqual(methods,['getTransaction','getAccountInfo']);
});
test('wrong expected pool is not accepted as detection',async()=>{
 const result=await replayKnownPoolTransactions({HELIUS_RPC_URL:'https://example.org'},{
  cases:[{protocol:'PUMPSWAP',signature,expectedPool:'2'.repeat(32)}],
  fetcher:async()=>({ok:true,json:async()=>({result:{meta:{err:null},transaction:{message:{instructions:[]}}}})})
 });
 assert.equal(result.results[0].outcome,'EXPECTED_POOL_INSTRUCTION_NOT_FOUND');
 assert.equal(result.results[0].poolVerification,null);
});
test('bounded input rejects more than three cases and malformed signatures',async()=>{
 await assert.rejects(replayKnownPoolTransactions({HELIUS_RPC_URL:'x'},{cases:Array(4).fill({})}),/1-3/);
 await assert.rejects(replayKnownPoolTransactions({HELIUS_RPC_URL:'x'},{cases:[{
  protocol:'PUMPSWAP',signature:'bad',expectedPool:pool
 }]}),/Exact protocol/);
});
