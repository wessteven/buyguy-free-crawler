import test from 'node:test';
import assert from 'node:assert/strict';
import {assessLargestAccounts,fetchLargestAccounts} from '../src/holder-risk.mjs';
const mint='So11111111111111111111111111111111111111112';
const addr=n=>'So1111111111111111111111111111111111111111'+String(n);
const fake=(amounts)=>({result:{value:amounts.map((amount,i)=>({address:addr(i+1),amount:String(amount),uiAmount:null}))}});
test('Top token balances use raw integer supply without float overflow',()=>{
 const supply='1000000000000000000000000000000';
 const balances=fake(['190000000000000000000000000000','140000000000000000000000000000']);
 const r=assessLargestAccounts(mint,supply,balances);
 assert.equal(r.top1Bps,1900);
 assert.equal(r.top5Bps,3300);
 assert.equal(r.status,'TOKEN_ACCOUNT_BALANCES_SCREENED');
 assert.equal(r.accountsReported,2);
});
test('Top token account greater than 40% is flagged, not safe',()=>{
 const r=assessLargestAccounts(mint,'1000000',fake(['550000','100000','30000']));
 assert.equal(r.status,'CONCENTRATION_WARNING');
 assert.ok(r.flags.includes('TOP_ACCOUNT_OVER_40_PERCENT'));
});
test('Cannot infer real wallets from token-account list, invalid sums fail closed',()=>{
 const r=assessLargestAccounts(mint,'10000',fake(['9500','9500']));
 assert.equal(r.status,'UNVERIFIED');
 assert.ok(r.flags.includes('TOTAL_EXCEEDS_SUPPLY'));
 assert.ok(r.notes.join('').includes('AMM'));
});
test('Missing RPC data or unknown supply never yields confidence',()=>{
 assert.equal(assessLargestAccounts(mint,null,{result:{value:[]}}).status,'UNVERIFIED');
 assert.equal(assessLargestAccounts(mint,'10000',{error:{code:429}}).status,'UNVERIFIED');
});
test('Read only RPC uses getTokenLargestAccounts, never sendTransaction',async()=>{
 let method;
 const reply=await fetchLargestAccounts({mint,rpcEndpoint:'https://rpc.example.test/secret',
 fetcher:async (url,opt)=>{method=JSON.parse(opt.body).method;return {ok:true,json:async()=>fake(['100'])}}});
 assert.equal(method,'getTokenLargestAccounts');
 assert.equal(reply.result.value.length,1);
});
