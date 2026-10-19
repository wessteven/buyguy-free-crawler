import test from 'node:test';
import assert from 'node:assert/strict';
import {retireDormantAssets} from '../src/retirement.mjs';
import {verifyPendingMints,combineRisk} from '../src/risk-ops.mjs';
test('Retirement only archives after thresholds, protects held or pinned tokens',async()=>{
 const statements=[];
 const DB={prepare(sql){return {bind(...params){return {sql,params}}}},
   batch:async items=>{statements.push(...items);return items.map(()=>({meta:{changes:1}}))}};
 const r=await retireDormantAssets(DB,Date.parse('2026-10-19T01:00:00Z'));
 assert.equal(r.deleted,0);
 assert.equal(statements.length,3);
 assert.ok(statements.every(s=>s.sql.includes('p.status=\'OPEN\'')&&s.sql.includes('pinned=0')));
 assert.ok(statements.some(s=>s.sql.includes("status='DEAD'")));
 assert.ok(statements.some(s=>s.sql.includes("status='TRASH'")));
});
test('Without Helius secret autonomous verification does not make network calls',async()=>{
 const DB={prepare(){throw Error('Unexpected database access')}};
 const result=await verifyPendingMints({DB});
 assert.equal(result.enabled,false);
 assert.equal(result.checked,0);
});
test('Supported exact mint gets recorded as limited audit, NOT paper eligible',async()=>{
 const mint='So11111111111111111111111111111111111111112';
 const calls=[];
 const DB={
  prepare(sql){return {bind(...args){return {
    sql,args,
    async all(){return {results:[{asset_key:'solana:'+mint,chain:'solana',address:mint,score:80}]}}
  }}}},
  batch:async statements=>{calls.push(...statements);return []}
 };
 const rpc={result:{value:{owner:'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
  executable:false,data:{parsed:{type:'mint',info:{
    isInitialized:true,decimals:9,mintAuthority:null,freezeAuthority:null,supply:'1000'
  }}}}}};
 const result=await verifyPendingMints({DB,HELIUS_RPC_URL:'https://rpc.example/secret'},
  {limit:1,fetcher:async(_url,opt)=>{
    const method=JSON.parse(opt.body).method;
    const holder={result:{value:[{address:mint,amount:'200'}]}};
    return {ok:true,json:async()=>method==='getTokenLargestAccounts'?holder:rpc};
  }});
 assert.equal(result.checked,1);
 assert.equal(calls.length,2);
 assert.equal(calls[0].args[0],'PARTIAL_ONCHAIN_REVIEW');
 assert.ok(calls[0].args[1].includes('"top1Bps":2000'));
 assert.equal(calls[0].args[1].includes('"paperEligible":false'),true);
});
\ntest('Metadata-only Token-2022 with screened balances stays partial, not safe',()=>{
  assert.equal(combineRisk({riskStatus:'TOKEN_2022_METADATA_ONLY'},
    {status:'TOKEN_ACCOUNT_BALANCES_SCREENED'}),'PARTIAL_ONCHAIN_REVIEW');
  assert.equal(combineRisk({riskStatus:'TOKEN_2022_REVIEW_REQUIRED'},
    {status:'TOKEN_ACCOUNT_BALANCES_SCREENED'}),'TOKEN_2022_REVIEW_REQUIRED');
  assert.equal(combineRisk({riskStatus:'TOKEN_2022_METADATA_ONLY'},
    {status:'CONCENTRATION_WARNING'}),'HOLDER_CONCENTRATION_RISK');
});
