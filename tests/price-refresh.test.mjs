import test from 'node:test';
import assert from 'node:assert/strict';
import {parseQuoteRefresh,refreshKnownQuotes} from '../src/price-refresh.mjs';
const mint='So11111111111111111111111111111111111111112';
const asset={asset_key:'solana:'+mint,chain:'solana',address:mint,symbol:'SOL',pool:'oldPool',has_position:1};
const example=(pool,liq=60000)=>({chainId:'solana',pairAddress:pool,baseToken:{address:mint,symbol:'SOL'},
  priceUsd:'160',liquidity:{usd:liq},marketCap:90000,txns:{m5:{buys:24,sells:8}},
  priceChange:{h1:10},volume:{h24:20000},pairCreatedAt:Date.parse('2026-10-18T18:00:00Z')});
test('Held paper token never silently changes pool to quote other pair',()=>{
 const quote=parseQuoteRefresh([example('differentPool')],[asset]);
 assert.equal(quote.length,0);
 const correct=parseQuoteRefresh([example('oldPool')],[asset]);
 assert.equal(correct.length,1);
 assert.equal(correct[0].pool,'oldPool');
 assert.equal(correct[0].pool_created,'2026-10-18T18:00:00.000Z');
});
test('For unheld tokens, quote keeps known pool when it exists',()=>{
 const quotes=parseQuoteRefresh([example('newPool',70000),example('oldPool',50000)],
   [{...asset,has_position:0}]);
 assert.equal(quotes[0].pool,'oldPool');
});
test('Invalid chain or wrong address is never matched through same ticker',()=>{
 const x=parseQuoteRefresh([example('oldPool'),{...example('oldPool'),baseToken:{address:mint.slice(0,-2)+'XX',symbol:'SOL'}}],
   [{...asset,has_position:0}]);
 assert.equal(x.length,1);
});
test('Batch writes refreshed price and observation, never paper fills',async()=>{
 const sql=[];
 const DB={prepare(query){return {bind(...args){return {sql:query,args,async all(){return {results:[asset]}}}}}},
   batch:async stmts=>{sql.push(...stmts);return []}};
 const fetcher=async()=>({ok:true,json:async()=>[example('oldPool')]});
 const r=await refreshKnownQuotes({DB},{fetcher,now:'2026-10-19T00:12:00Z'});
 assert.equal(r.refreshed,1);
 assert.equal(sql.length,2);
 assert.ok(!sql.some(x=>/paper_trades|paper_account SET/.test(x.sql)));
 assert.ok(sql[0].args.includes('2026-10-18T18:00:00.000Z'));
});
test('Provider 429 cannot write fabricated prices',async()=>{
 const writes=[],DB={prepare(sql){return {bind(){return {
   async all(){return {results:[asset]}}
 }}}},batch:async st=>writes.push(...st)};
 const r=await refreshKnownQuotes({DB},{fetcher:async()=>({ok:false,status:429})});
 assert.equal(r.refreshed,0);
 assert.equal(r.failedProviders.length,1);
 assert.equal(writes.length,0);
});

test('Pinned addresses rotate through scan slots so slower tokens are not starved',async()=>{
 const addresses=Array.from({length:12},(_,i)=>({
   ...asset,asset_key:'solana:'+mint.slice(0,-2)+'A'+'123456789ABC'[i],
   address:mint.slice(0,-2)+'A'+'123456789ABC'[i],
   has_position:0,pinned:1
 }));
 const db={prepare(sql){return {bind(){return {async all(){
   if(sql.includes('a.pinned=1'))return {results:addresses};
   return {results:[]};
 }}}}}};
 const seen=[];
 const fetcher=async url=>{seen.push(url);return {ok:true,json:async()=>[]}};
 await refreshKnownQuotes({DB:db},{fetcher,limit:5,now:'2026-10-19T00:00:00Z'});
 await refreshKnownQuotes({DB:db},{fetcher,limit:5,now:'2026-10-19T00:10:00Z'});
 assert.equal(seen.length,2);
 assert.notEqual(seen[0],seen[1]);
});
