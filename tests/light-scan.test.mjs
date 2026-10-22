import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {parseNewPools,cronScan} from '../src/light-scan.mjs';
import {parseDexQuotes,dexFallback} from '../src/dex-fallback.mjs';

const mint='So11111111111111111111111111111111111111112';
const fixture={included:[{id:'solana_'+mint,type:'token',attributes:{address:mint,symbol:'CRONTEST'}}],
  data:[{attributes:{address:'Pool_for_tests',name:'CRONTEST / SOL',
    base_token_price_usd:'0.001',reserve_in_usd:'67000',market_cap_usd:'85000',
    transactions:{m5:{buys:12,sells:4}},volume_usd:{h24:'25000'},
    pool_created_at:'2026-10-18T00:00:00Z',price_change_percentage:{h1:'11'}},
    relationships:{base_token:{data:{id:'solana_'+mint}}}}]};

test('GeckoTerminal mint identity and five-minute flows are preserved',()=>{
  const leads=parseNewPools(fixture);
  assert.equal(leads.length,1);
  assert.equal(leads[0].address,mint);
  assert.equal(leads[0].source,'GeckoTerminal');
  assert.equal(leads[0].buys_m5,12);
  assert.equal(leads[0].sells_m5,4);
  assert.equal(leads[0].liquidity,67000);
  assert.equal(leads[0].status,undefined);
});
test('Unknown token addresses, stale zero prices and weak pools rejected',()=>{
  assert.deepEqual(parseNewPools({data:[{attributes:{address:'abc',reserve_in_usd:'50000',base_token_price_usd:'0.001'}}]}),[]);
  assert.deepEqual(parseNewPools({data:[{attributes:{address:'pool',reserve_in_usd:'100',base_token_price_usd:'0.001'},
    relationships:{base_token:{data:{id:'solana_'+mint}}}}],included:fixture.included}),[]);
});
test('Invalid API response does not become a successful scan',()=>{
  assert.throws(()=>parseNewPools({data:{error:'unavailable'}}));
});
test('Lightweight cron stores only research observations, never paper trades',async()=>{
  const batchStatements=[],errorStatements=[];
  const DB={
    prepare(sql){return {bind(...args){
      assert.equal((sql.match(/\?/g)||[]).length,args.length,'SQL parameter count mismatch');
      return {...this,sql,args,run:async()=>{errorStatements.push(sql);}};
    }}},
    batch:async(stmts)=>{batchStatements.push(...stmts);return []; }
  };
  const fetcher=async()=>({ok:true,json:async()=>fixture});
  const count=await cronScan({DB},fetcher);
  assert.equal(count,1);
  assert.equal(batchStatements.length,4);
  assert.equal(errorStatements.length,0);
  assert.equal(batchStatements.some(x=>/paper_positions|paper_trades/.test(x.sql)),false);
  assert.equal(batchStatements.filter(x=>/INSERT INTO runs/.test(x.sql)).length,1);
});
test('Provider outage becomes a recorded error rather than invented quotes',async()=>{
  const failures=[],DB={
    prepare(sql){return {bind(...args){return {run:async()=>failures.push({sql,args})}}}}
  };
  await assert.rejects(cronScan({DB},async()=>({ok:false,status:503})));
  assert.equal(failures.filter(x=>/INSERT INTO runs/.test(x.sql)).length,1);
  assert.match(failures.at(-1).sql,/INSERT INTO runs/);
});

test('Both providers HTTP 429 records RATE_LIMITED and does not invent quotes',async()=>{
 const records=[],calls=[];
 const DB={prepare(sql){return {bind(...args){return {run:async()=>records.push({sql,args})}}}}};
 const count=await cronScan({DB},async url=>{calls.push(url);return {ok:false,status:429}});
 assert.equal(count,0);
 assert.equal(calls.length,2);
 const runs=records.filter(x=>/INSERT INTO runs/.test(x.sql));
 assert.equal(runs.length,1);
 assert.equal(runs[0].args[2],'RATE_LIMITED');
 assert.match(runs[0].args[3],/429/);
});
test('Actual SQLite validates the D1 INSERT and UPDATE statements', async()=>{
  const statements=[];
  const DB={
    prepare(sql){return {bind(...args){return {sql,args,run:async()=>{}}}};},
    batch:async(batch)=>{statements.push(...batch);return [];}
  };
  await cronScan({DB},async()=>({ok:true,json:async()=>fixture}));
  const py=`
import sys,json,sqlite3
d=json.load(sys.stdin)
cx=sqlite3.connect(':memory:')
cx.executescript(d['schema'])
for line in d['statements']:
  cx.execute(line['sql'],line['args'])
cx.commit()
assert cx.execute('select count(*) from assets').fetchone()[0]==1
assert cx.execute('select count(*) from observations').fetchone()[0]==1
assert cx.execute('select count(*) from runs').fetchone()[0]==1
asset=cx.execute('select symbol,price,status,risk_status from assets').fetchone()
assert asset==('CRONTEST',0.001,'STATIC','UNVERIFIED'), asset
print('SQLite D1 statements: passed')
`;
  const run=spawnSync('python',['-c',py],{input:JSON.stringify({
    schema:readFileSync('sql/schema.sql','utf8'),statements
  }),encoding:'utf8',timeout:15000});
  assert.equal(run.status,0,run.stderr||run.stdout);
});

test('Gecko HTTP 429 is not retried and an independent DEX feed can keep scanning',async()=>{
  const d=[],calls=[];
  const DB={
    prepare(sql){return {bind(...args){return {sql,args,run:async()=>{}};}}},
    batch:async rows=>{d.push(...rows);return []}
  };
  const quote={chainId:'solana',baseToken:{address:mint,symbol:'DEMO'},
    pairAddress:'POOL2',priceUsd:'0.002',liquidity:{usd:65000},
    marketCap:85000,txns:{m5:{buys:30,sells:10}},volume:{h24:15000},
    pairCreatedAt:Date.now()};
  const fetcher=async url=>{
    calls.push(url);
    if(url.includes('geckoterminal'))return {ok:false,status:429};
    if(url.includes('token-profiles'))return {ok:true,json:async()=>[{chainId:'solana',tokenAddress:mint}]};
    if(url.includes('/tokens/v1/solana/'))return {ok:true,json:async()=>[quote]};
    throw Error('Unexpected endpoint');
  };
  assert.equal(await cronScan({DB},fetcher),1);
  assert.equal(calls.filter(u=>u.includes('geckoterminal')).length,1);
  assert.equal(d[0].args[5],'DEX Screener');
  const run=d.at(-1);
  assert.equal(run.args[2],'PARTIAL');
  assert.ok(run.args[5].includes('429'));
});
test('DEX fallback rejects wrong chain, same ticker with different contract, zero price',()=>{
  assert.equal(parseDexQuotes([{chainId:'ethereum',baseToken:{address:mint},priceUsd:1,
    liquidity:{usd:90000},pairAddress:'pool'}]).length,0);
  assert.equal(parseDexQuotes([{chainId:'solana',baseToken:{address:'not-a-token'},priceUsd:1,
    liquidity:{usd:90000},pairAddress:'pool'}]).length,0);
});

test('DEX fallback retries a transient HTTP 503 once and preserves exact token identity',async()=>{
  const calls=[];
  const quote={chainId:'solana',baseToken:{address:mint,symbol:'DEMO'},pairAddress:'POOL2',
    priceUsd:'0.002',liquidity:{usd:65000},txns:{m5:{buys:12,sells:3}}};
  const result=await dexFallback(async url=>{
    calls.push(url);
    if(url.includes('token-profiles')&&calls.filter(x=>x===url).length===1)return {ok:false,status:503};
    if(url.includes('token-profiles'))return {ok:true,json:async()=>[{chainId:'solana',tokenAddress:mint}]};
    return {ok:true,json:async()=>[quote]};
  });
  assert.equal(calls.length,3);
  assert.equal(result.length,1);
  assert.equal(result[0].address,mint);
});
test('DEX fallback does not retry HTTP 429',async()=>{
  let calls=0;
  await assert.rejects(dexFallback(async()=>{calls++;return {ok:false,status:429}}),/429/);
  assert.equal(calls,1);
});

test('Shared D1 provider cooldown skips repeated 429 calls and never fabricates observations',async()=>{
 const leases=new Map(),runs=[],calls=[];
 const DB={
  prepare(sql){return {bind(...args){return {
   first:async()=>({expires_at:leases.get(args[0])||0}),
   run:async()=>{
    if(sql.includes('INSERT INTO leases'))leases.set(args[0],Math.max(leases.get(args[0])||0,args[1]));
    if(sql.includes('INSERT INTO runs'))runs.push(args);
   }
  }}}},
  batch:async()=>{throw Error('No provider observations should be written');}
 };
 const fetcher=async url=>{calls.push(url);return {ok:false,status:429}};
 assert.equal(await cronScan({DB},fetcher),0);
 assert.equal(calls.length,2);
 assert.equal(leases.size,2);
 assert.equal(await cronScan({DB},fetcher),0);
 assert.equal(calls.length,2,'cooldowns must suppress both provider requests');
 assert.deepEqual(runs.map(x=>x[2]),['RATE_LIMITED','RATE_LIMITED']);
 assert.equal(runs.length,2); // discovered and observed are SQL literal zeroes
});
