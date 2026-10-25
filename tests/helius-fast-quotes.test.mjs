import test from 'node:test';
import assert from 'node:assert/strict';
import {WSOL,makeRegistry,calculateSnapshot,readAccounts,discoverRegistry,readPumpSnapshots} from '../src/helius-fast-quotes.mjs';
import {PUMPSWAP,PUMPSWAP_POOL_DISCRIMINATOR} from '../src/pumpswap.mjs';
import {SPL_TOKEN} from '../src/token-risk.mjs';
const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const mint='EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',pool='11111111111111111111111111111111';
const bv='Vote111111111111111111111111111111111111111',qv='BPFLoaderUpgradeab1e11111111111111111111111';
function from58(s){let n=0n;for(const c of s)n=n*58n+BigInt(alphabet.indexOf(c));const a=new Uint8Array(32);for(let i=31;i>=0;i--){a[i]=Number(n%256n);n/=256n}return a}
function poolAccount(){const b=new Uint8Array(301);b.set(PUMPSWAP_POOL_DISCRIMINATOR);for(const [offset,key]of[[43,WSOL],[75,mint],[139,bv],[171,qv]])b.set(from58(key),offset);return {owner:PUMPSWAP,executable:false,data:[Buffer.from(b).toString('base64'),'base64']}}
const target={asset_key:'solana:'+mint,chain:'solana',address:mint,symbol:'TEST',pool};
const mintAccount=decimals=>({owner:SPL_TOKEN,data:{parsed:{type:'mint',info:{isInitialized:true,decimals}}}});
const vault=(mint,amount,decimals)=>({owner:SPL_TOKEN,data:{parsed:{type:'account',info:{mint,owner:pool,state:'initialized',tokenAmount:{amount,decimals}}}}});
function fixture(){const account=poolAccount(),registry=makeRegistry(target,account);return {registry,state:{slot:101,received_at:'2026-10-25T03:00:00Z',accounts:new Map([[pool,account],[WSOL,mintAccount(9)],[mint,mintAccount(6)],[bv,vault(WSOL,'100000000000',9)],[qv,vault(mint,'10000000000',6)]])}}}
test('supported exact PumpSwap pair calculates independently expected SOL ratio with decimal scaling',()=>{
 const {registry,state}=fixture();assert.equal(registry.supported,true);
 const q=calculateSnapshot(registry,state);assert.equal(q.price_sol,.01);assert.equal(q.price_usd,null);assert.equal(q.slot,101);assert.equal(q.unique_buyers,null);assert.equal(q.trade_volume,null);assert.equal(q.price_method,'INDICATIVE_RESERVE_RATIO');
});
test('pool owner, target identity and wrapped SOL pair are required',()=>{
 assert.equal(makeRegistry(target,{...poolAccount(),owner:SPL_TOKEN}).supported,false);
 assert.equal(makeRegistry({...target,address:bv},poolAccount()).reason,'TARGET_MINT_MISMATCH');
 assert.equal(makeRegistry({...target,address:WSOL},poolAccount()).reason,'WSOL_PAIR_REQUIRED');
});
test('wrong vault mint, authority, token program, frozen state and missing data fail closed',()=>{
 for(const mutate of [v=>v.data.parsed.info.mint=WSOL,v=>v.data.parsed.info.owner=bv,v=>v.owner=pool,v=>v.data.parsed.info.state='frozen',v=>delete v.data.parsed]){
  const {registry,state}=fixture();mutate(state.accounts.get(qv));assert.throws(()=>calculateSnapshot(registry,state),/VAULT_IDENTITY/);
 }
});
test('zero reserves and inconsistent mint decimals reject rather than fabricate prices',()=>{
 for(const mode of ['zero','decimals','missing']){
  const {registry,state}=fixture();
  if(mode==='zero')state.accounts.get(qv).data.parsed.info.tokenAmount.amount='0';
  if(mode==='decimals')state.accounts.get(mint).data.parsed.info.decimals=9;
  if(mode==='missing')state.accounts.delete(mint);
  assert.throws(()=>calculateSnapshot(registry,state));
 }
});
test('changed pool registry is rejected even when vault balances look valid',()=>{
 const {registry,state}=fixture();registry.baseVault=qv;assert.throws(()=>calculateSnapshot(registry,state),/POOL_REGISTRY_CHANGED/);
});
test('one batch fetches pool, both mints and both vaults at shared confirmed context',async()=>{
 const {registry,state}=fixture();let calls=0;
 const result=await readPumpSnapshots({HELIUS_RPC_URL:'https://mainnet.helius-rpc.com/?api-key=secret'},[registry],{minSlot:100,fetcher:async(url,options)=>{
  calls++;const p=JSON.parse(options.body);assert.equal(p.method,'getMultipleAccounts');assert.equal(p.params[0].length,5);assert.equal(p.params[1].commitment,'confirmed');assert.equal(p.params[1].minContextSlot,100);
  return Response.json({result:{context:{slot:101},value:p.params[0].map(k=>state.accounts.get(k))}});
 }});
 assert.equal(calls,1);assert.equal(result.quotes.length,1);assert.equal(result.quotes[0].price_sol,.01);
});
test('RPC rejects backward context, malformed batches, oversized requests and sanitized 429',async()=>{
 const env={HELIUS_RPC_URL:'https://mainnet.helius-rpc.com/?api-key=secret'};
 for(const payload of [{result:{context:{slot:99},value:[null]}},{result:{context:{slot:101},value:[]}},{error:{code:-32016}}])await assert.rejects(readAccounts(env,[pool],{minSlot:100,fetcher:async()=>Response.json(payload)}),/RPC_/);
 await assert.rejects(readAccounts(env,Array(101).fill(pool)),/ACCOUNT_BATCH_BUDGET/);
 await assert.rejects(readAccounts(env,[pool],{fetcher:async()=>new Response('',{status:429})}),e=>e.message==='RPC_HTTP_429'&&!e.message.includes('secret'));
});
test('recovery succeeds after a transient failure with the last accepted minimum slot',async()=>{
 const {registry,state}=fixture();let n=0;const env={HELIUS_RPC_URL:'https://mainnet.helius-rpc.com/?api-key=secret'};
 const fetcher=async(url,options)=>{if(n++===0)throw Error('network');const keys=JSON.parse(options.body).params[0];return Response.json({result:{context:{slot:110},value:keys.map(k=>state.accounts.get(k))}})};
 await assert.rejects(readPumpSnapshots(env,[registry],{minSlot:101,fetcher}),/RPC_NETWORK_ERROR/);
 const r=await readPumpSnapshots(env,[registry],{minSlot:101,fetcher});assert.equal(r.slot,110);assert.equal(r.quotes.length,1);
});
test('unsupported candidates remain explicit and never get reserve prices',async()=>{
 const r=await discoverRegistry({HELIUS_RPC_URL:'https://mainnet.helius-rpc.com/?api-key=secret'},[target],{fetcher:async()=>Response.json({result:{context:{slot:100},value:[{owner:SPL_TOKEN}]}})});
 assert.equal(r.registry.length,0);assert.equal(r.rejected[0].reason,'UNSUPPORTED_PROTOCOL');
});

import {parseSolUsdTrades} from '../src/helius-fast-quotes.mjs';
import {FastRadar} from '../src/fast-radar.mjs';
test('USD conversion accepts only positive SOL trades within sixty seconds',()=>{
 const now=Date.now();assert.equal(parseSolUsdTrades([{price:'150',timestampms:now-1000}],now).price,150);
 for(const trade of [{price:'150',timestampms:now-61000},{price:'150',timestampms:now+1},{price:'0',timestampms:now},{price:'bad',timestampms:now}])assert.equal(parseSolUsdTrades([trade],now),null);
});
test('Cloudflare direct mode batches verified state, attaches fresh USD and stores minute evidence',async()=>{
 const {state:snapshot}=fixture();let n=0;const original=globalThis.fetch;
 const db={prepare(){return {bind(){return this},async all(){return {results:[target],meta:{rows_read:1}}}}},async batch(){return [{meta:{rows_written:2}}]}};
 const state={storage:{get:async()=>null,put:async()=>{}},blockConcurrencyWhile:f=>f()};
 globalThis.fetch=async(url,options)=>{
  if(url.includes('gemini'))return Response.json([{price:'150',timestampms:Date.now()-1000}]);
  const p=JSON.parse(options.body);n++;
  return Response.json({result:{context:{slot:100+n},value:p.params[0].map(k=>snapshot.accounts.get(k))}});
 };
 try{
  const radar=new FastRadar(state,{DB:db,FAST_RADAR_SOURCE:'helius',HELIUS_RPC_URL:'https://mainnet.helius-rpc.com/?api-key=secret'});await Promise.resolve();
  await radar.tick(Date.now());assert.equal(n,3);assert.equal(radar.data.updated_quotes,1);assert.equal(radar.data.quotes[0].price_usd,1.5);assert.equal(radar.data.current_slot,103);
  await radar.tick(Date.now()+30000);assert.equal(n,4);assert.equal(radar.data.current_slot,104);
  radar.data.daily_rpc_calls=3000;await radar.tick(Date.now()+60000);assert.equal(n,4);assert.equal(radar.data.error,'DAILY_RPC_BUDGET');
 }finally{globalThis.fetch=original}
});

test('dust SOL vaults cannot occupy active tracking slots',()=>{const {registry,state}=fixture();state.accounts.get(bv).data.parsed.info.tokenAmount.amount='1';assert.throws(()=>calculateSnapshot(registry,state),/INSUFFICIENT_SOL_RESERVE/);});
