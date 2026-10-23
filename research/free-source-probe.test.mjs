import test from 'node:test';
import assert from 'node:assert/strict';
import {validateAsset,dexEvidence,goPlusEvidence,probeFreeSources} from './free-source-probe.mjs';

const mint='So11111111111111111111111111111111111111112';
const pool='11111111111111111111111111111111';
const evm='0x2cc0fac44b8252f6b10208b091aff2c94b4da77d';
const sol={chain:'solana',address:mint,pool};
const pair={chainId:'solana',pairAddress:pool,baseToken:{address:mint},
 quoteToken:{address:'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'},
 priceUsd:'1.25',liquidity:{usd:20000},txns:{m5:{buys:11,sells:4}}};
const json=(body,status=200)=>({ok:status>=200&&status<300,status,json:async()=>body});

test('reject unknown chains, invalid token addresses and pools before network',()=>{
 assert.throws(()=>validateAsset({chain:'ethereum',address:mint}),/UNSUPPORTED_CHAIN/);
 assert.throws(()=>validateAsset({chain:'solana',address:'https://bad-url'}),/INVALID_TOKEN_ADDRESS/);
 assert.throws(()=>validateAsset({chain:'solana',address:mint,pool:'wrong'}),/INVALID_POOL_ADDRESS/);
});
test('DEX exact-pool identity and provenance, without invented quote age or buyers',()=>{
 const r=dexEvidence([pair,{...pair,pairAddress:mint}],sol);
 assert.equal(r.status,'MATCHED');assert.equal(r.pairs.length,1);
 assert.equal(r.pairs[0].pool,pool);assert.equal(r.pairs[0].priceUsd,1.25);
 assert.equal(r.pairs[0].providerQuoteTimestamp,null);
 assert.equal(r.pairs[0].uniqueBuyersVerified,false);
 assert.equal(r.pairs[0].buys5m,11);
});
test('DEX wrong pool fails closed',()=>{
 assert.equal(dexEvidence([pair],{...sol,pool:mint}).status,'NO_EXACT_POOL');
});
test('DEX quote-token cannot inherit base-token USD price',()=>{
 const quote={...pair,baseToken:{address:mint},quoteToken:{address:pool}};
 const r=dexEvidence([quote],{chain:'solana',address:pool,pool});
 assert.equal(r.pairs[0].tokenSide,'quote');assert.equal(r.pairs[0].priceUsd,null);
});
test('GoPlus mismatched address and partial code cannot certify risk',()=>{
 const wrong={code:1,result:{[pool]:{is_mintable:'0'}}};
 assert.equal(goPlusEvidence(wrong,sol).status,'NO_EXACT_TOKEN');
 assert.equal(goPlusEvidence({code:2,result:{[mint]:{}}},sol).status,'INCOMPLETE_OR_INVALID_RESPONSE');
});
test('GoPlus matching Solana fields remain unverified independent evidence',()=>{
 const r=goPlusEvidence({code:1,result:{[mint]:{is_mintable:'0',mint_authority:'0',holders:[1,2]}}},sol);
 assert.equal(r.status,'PARTIAL_RISK_FIELDS');assert.equal(r.fields.is_mintable,'0');
 assert.equal(r.coverage.essentialPresent,1);
 assert.ok(r.coverage.missingEssential.includes('freeze_authority'));
 assert.equal(r.safetyCertified,false);assert.equal(r.fields.holders,undefined);
});
test('Robinhood contract normalized to chain 4663, two bounded read-only calls',async()=>{
 const urls=[];
 const mock=async url=>{urls.push(url);return url.includes('gopluslabs')?
  json({code:1,result:{[evm]:{is_open_source:'1'}}}):
  json([{chainId:'robinhood',pairAddress:evm,baseToken:{address:evm},
   priceUsd:'0.01',liquidity:{usd:12000}}]);};
 const result=await probeFreeSources({chain:'robinhood',address:evm.toUpperCase().replace('0X','0x')},mock);
 assert.equal(urls.length,2);assert.match(urls[1],/token_security\/4663/);
 assert.equal(result.market.status,'MATCHED');assert.equal(result.risk.status,'PARTIAL_RISK_FIELDS');
 assert.equal(result.market.exactPool,false);assert.equal(result.researchOnly,true);
});
test('Provider errors are explicit, not safe or zero risk',async()=>{
 let calls=0;
 const mock=async()=>{calls++;return json({},429);};
 const result=await probeFreeSources(sol,mock);
 assert.equal(calls,2);assert.equal(result.risk.status,'HTTP_429');
 assert.equal(result.market.status,'HTTP_429');
});
test('Malformed provider payloads are not silently accepted',async()=>{
 const mock=async url=>url.includes('goplus')?json({code:1,result:[]}):json({});
 const result=await probeFreeSources(sol,mock);
 assert.equal(result.market.status,'INVALID_RESPONSE');
 assert.equal(result.risk.status,'INCOMPLETE_OR_INVALID_RESPONSE');
});

test('Complete Robinhood GoPlus flags can be matched without certifying safety',()=>{
 const fields={is_honeypot:'0',cannot_sell_all:'0',is_mintable:'0',
  is_open_source:'1',is_proxy:'0',is_blacklisted:'0',transfer_pausable:'0'};
 const r=goPlusEvidence({code:1,result:{[evm]:fields}},
  {chain:'robinhood',address:evm});
 assert.equal(r.status,'MATCHED');
 assert.equal(r.coverage.essentialPresent,7);
 assert.equal(r.coverage.missingEssential.length,0);
 assert.equal(r.safetyCertified,false);
});
test('Holder count alone cannot imply any Solana contract risk verification',()=>{
 const r=goPlusEvidence({code:1,result:{[mint]:{holder_count:'4100'}}},sol);
 assert.equal(r.status,'PARTIAL_RISK_FIELDS');
 assert.equal(r.coverage.essentialPresent,0);
 assert.equal(r.coverage.missingEssential.length,7);
 assert.equal(r.fields.holder_count,'4100');
});
