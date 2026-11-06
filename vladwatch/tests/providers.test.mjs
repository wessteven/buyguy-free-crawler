import assert from 'node:assert/strict';
import test from 'node:test';
import {PAIRS,WALLETS} from '../src/config.mjs';
import {rpcSnapshot,fetchStream} from '../src/providers.mjs';
import worker from '../src/worker.mjs';
const a=WALLETS[0].address;
const h1='0x'+'1'.repeat(64),h2='0x'+'2'.repeat(64);
const makeJson=(x,status=200)=>new Response(JSON.stringify(x),{status,headers:{'content-type':'application/json'}});
const tx=(hash,block='123')=>({hash,block,timestamp:'2026-11-05T23:00:00Z',from:{hash:a},to:{hash:'0x'+'a'.repeat(40)},value:'1000'});

test('hard coverage gate is five wallet/chain pairs; ownership remains unverified',()=>{
 assert.equal(PAIRS.length,5);
 assert.deepEqual(WALLETS[0].chains,[42161,4663,1,8453]);
 assert.deepEqual(WALLETS[1].chains,[4663]);
 assert.ok(WALLETS.every(w=>/unverified/i.test(w.attribution)));
});

test('RPC rejects wrong chain, falls back independently and returns snapshots only',async()=>{
 let first=true;
 const f=async(url,opts)=>{
   const m=JSON.parse(opts.body).method;
   if (url.includes('rpc.mainnet.chain.robinhood.com') && m==='eth_chainId')return makeJson({jsonrpc:'2.0',result:'0x1'});
   return makeJson({jsonrpc:'2.0',result: m==='eth_chainId'?'0x1237':m==='eth_blockNumber'?'0x64':m==='eth_getBalance'?'0x2a':'0x5'});
 };
 const s=await rpcSnapshot(4663,a,{},f);
 assert.equal(s.status,'checked');assert.equal(s.attempts.length,2);
 assert.match(s.attempts[0].error,/CHAIN_MISMATCH/);
 assert.equal(s.wei,'42');assert.equal(s.nonce,'5');assert.equal(s.snapshotOnly,true);
});

test('both RPC sources fail -> fail, not no movement',async()=>{
 const s=await rpcSnapshot(4663,a,{},async()=>{throw new Error('getaddrinfo ENOTFOUND')});
 assert.equal(s.status,'failed');assert.equal(s.attempts.length,2);assert.equal(s.wei,undefined);
});

test('historical first run establishes a baseline, not a new Vlad trade',async()=>{
 const s=await fetchStream({chainId:4663,address:a},'tx',null,{},async()=>makeJson({items:[tx(h1)],next_page_params:null}));
 assert.equal(s.status,'checked');assert.equal(s.initialBaseline,true);
 assert.equal(s.events[0].hash,h1);assert.equal(s.events[0].tradeVerified,false);
});

test('new transaction since known checkpoint distinguished from old',async()=>{
 const s=await fetchStream({chainId:4663,address:a},'tx',h1,{},async()=>makeJson({items:[tx(h2),tx(h1)],next_page_params:{block_number:90}}),true);
 assert.equal(s.status,'checked');assert.equal(s.checkpointReached,true);assert.equal(s.events.length,1);assert.equal(s.events[0].hash,h2);
});

test('known checkpoint disappearing at history end is PARTIAL rather than complete',async()=>{
 const s=await fetchStream({chainId:4663,address:a},'tx',h1,{},async()=>makeJson({items:[tx(h2)],next_page_params:null}),true);
 assert.equal(s.status,'partial');assert.equal(s.events.length,1);
});

test('indexer outage never masquerades as empty wallet',async()=>{
 const s=await fetchStream({chainId:4663,address:a},'tx',h1,{},async()=>makeJson({message:'unavailable'},503),true);
 assert.equal(s.status,'failed');assert.equal(s.events.length,0);assert.match(s.attempts[0].error,/503/);
});

test('missing token event log index is failure, not misleading deduplicated history',async()=>{
 const t={...tx(h2),token:{address:'0x'+'a'.repeat(40),symbol:'FAKE'},total:{value:'100',decimals:'18'}};
 const s=await fetchStream({chainId:4663,address:a},'token',null,{},async()=>makeJson({items:[t],next_page_params:null}));
 assert.equal(s.status,'failed');assert.match(s.attempts[0].error,/TOKEN_LOG_INDEX_MISSING/);
});

test('Etherscan fallback only when key present; no fabricated success',async()=>{
 const called=[];
 const f=async(url)=>{
  called.push(url);
  if(url.includes('blockscout.com'))return makeJson({error:'offline'},503);
  return makeJson({status:'1',result:[{...tx(h1),timeStamp:'1793920000',blockNumber:'100'}]});
 };
 const s=await fetchStream({chainId:4663,address:a},'tx',null,{ETHERSCAN_API_KEY:'fake-test-key'},f);
 assert.equal(s.status,'checked');assert.equal(s.source,'etherscan');assert.equal(s.attempts.length,2);
 assert.equal(called.length,2);
});

test('HTTP API has no mutation routes and health is not labelled complete',async()=>{
 const h=await worker.fetch(new Request('https://unit.test/health'),{});
 assert.equal((await h.json()).collectionVerified,false);
 const r=await worker.fetch(new Request('https://unit.test/api/run',{method:'POST'}),{});
 assert.equal(r.status,405);
});