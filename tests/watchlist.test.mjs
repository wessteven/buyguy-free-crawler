import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {normalizedWatchAddress,addWatchedAddress} from '../src/watchlist.mjs';
const evm='0x2cc0fac44b8252f6b10208b091aff2c94b4da77d';
const sol='So11111111111111111111111111111111111111112';
test('Only real chain-specific address structure enters the watchlist',()=>{
 const e=normalizedWatchAddress('robinhood',evm.toUpperCase().replace('0X','0x'));
 assert.equal(e.ok,true);assert.equal(e.address,evm);
 assert.equal(normalizedWatchAddress('solana',sol).ok,true);
 assert.equal(normalizedWatchAddress('solana',evm).ok,false);
 assert.equal(normalizedWatchAddress('robinhood',sol).ok,false);
 assert.equal(normalizedWatchAddress('bsc',evm).ok,false);
 assert.equal(normalizedWatchAddress('solana','11111111111111111111111111111111').ok,true); // 32 zero bytes
 assert.equal(normalizedWatchAddress('solana','1111111111111111111111111111111').ok,false);
 assert.equal(normalizedWatchAddress('solana',sol+' ' ).ok,false);
});
test('Pinned watchlist writes do not overwrite existing evidence or paper positions',async()=>{
 const writes=[];
 const db={prepare(sql){return {
  first:async()=>({n:2}),
  bind(...args){return {first:async()=>null,run:async()=>writes.push({sql,args})}}
 }}};
 const result=await addWatchedAddress(db,'robinhood',evm,{now:'2026-10-19T12:00:00Z'});
 assert.equal(result.ok,true);assert.equal(result.status,201);
 assert.equal(writes.length,1);
 assert.match(writes[0].sql,/ON CONFLICT\(asset_key\) DO UPDATE/);
 assert.match(writes[0].sql,/pinned=1/);
 assert.doesNotMatch(writes[0].sql,/price=|risk_status=|paper_account|paper_trades/);
 assert.equal(writes[0].args[0],'robinhood:'+evm);
});
test('Duplicate watch entries are idempotent; limit blocks new entries',async()=>{
 const mock=(n,exists)=>({
  prepare(sql){return {
   first:async()=>({n}),
   bind(...args){return {first:async()=>exists?{asset_key:'solana:'+sol,pinned:1}:null,run:async()=>({})}}
  }}
 });
 assert.equal((await addWatchedAddress(mock(100,false),'solana',sol)).status,409);
 const repeat=await addWatchedAddress(mock(100,true),'solana',sol);
 assert.equal(repeat.ok,true);assert.equal(repeat.existed,true);
});

test('Real SQLite accepts D1 watch insertion and duplicate pin without overwriting token research',async()=>{
 let statement='',args=[];
 const db={prepare(sql){return {
  first:async()=>({n:0}),
  bind(...a){return {
   first:async()=>null,
   run:async()=>{statement=sql;args=a;return {}}
  }}
 }}};
 await addWatchedAddress(db,'solana',sol,{now:'2026-10-19T00:00:00Z'});
 const py=[
 'import sqlite3,json,sys',
 'v=json.load(sys.stdin);db=sqlite3.connect(":memory:");db.executescript(v["schema"])',
 'db.execute(v["statement"],v["args"])',
 'db.execute("UPDATE assets SET price=42,score=88,risk_status=\\'PARTIAL_ONCHAIN_REVIEW\\',pinned=0 WHERE asset_key=?", (v["args"][0],))',
 'db.execute(v["statement"],v["args"])',
 'r=db.execute("SELECT pinned,status,price,score,risk_status FROM assets WHERE asset_key=?", (v["args"][0],)).fetchone()',
 'assert r==(1,"STATIC",42,88,"PARTIAL_ONCHAIN_REVIEW"),r',
 'print("WATCHLIST_SQL_PASS")'
 ].join('\n');
 const run=spawnSync('python',['-c',py],{input:JSON.stringify({
   schema:readFileSync('sql/schema.sql','utf8'),statement,args
 }),encoding:'utf8',timeout:15000});
 assert.equal(run.status,0,run.stderr);
 assert.match(run.stdout,/WATCHLIST_SQL_PASS/);
});
