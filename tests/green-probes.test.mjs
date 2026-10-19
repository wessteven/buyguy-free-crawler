import test from 'node:test';
import assert from 'node:assert/strict';
import {ownerClusterSample,probeLargestOwnerAccounts,probePoolProgram,runGreenProbes} from '../src/green-probes.mjs';
import {SPL_TOKEN} from '../src/token-risk.mjs';
const mint='So11111111111111111111111111111111111111112';
const a1='11111111111111111111111111111111';
const a2='SysvarRent111111111111111111111111111111111';
const owner='Stake11111111111111111111111111111111111111';
const largest={value:[{address:a1,amount:'1200'},{address:a2,amount:'800'}]};
const accounts={value:[
 {owner:SPL_TOKEN,data:{parsed:{type:'account',info:{mint,owner,tokenAmount:{amount:'1200'}}}}},
 {owner:SPL_TOKEN,data:{parsed:{type:'account',info:{mint,owner,tokenAmount:{amount:'800'}}}}}
]};
test('Top SPL token accounts resolving to one authority are NOT verified beneficial holders',()=>{
 const r=ownerClusterSample(mint,largest,accounts);
 assert.equal(r.status,'OWNER_SAMPLE_OBSERVED');
 assert.equal(r.uniqueAuthorityCount,1);
 assert.equal(r.largestAuthoritySampleBps,10000);
 assert.equal(r.vaultsExcluded,false);
 assert.equal(r.beneficialOwnersVerified,false);
});
test('Unknown token accounts and mismatched mint/account balances fail closed',()=>{
 assert.equal(ownerClusterSample(mint,largest,{value:[]}).status,'UNAVAILABLE');
 const bad=JSON.parse(JSON.stringify(accounts));bad.value[0].data.parsed.info.mint=a1;
 assert.ok(ownerClusterSample(mint,largest,bad).flags.includes('UNRESOLVED_TOKEN_ACCOUNT_OWNER'));
 const diff=JSON.parse(JSON.stringify(accounts));diff.value[1].data.parsed.info.tokenAmount.amount='7';
 assert.ok(ownerClusterSample(mint,largest,diff).flags.includes('ACCOUNT_BALANCE_MISMATCH'));
});
test('RPC probes read only account info; pool owner does not certify LP lock',async()=>{
 const calls=[];
 const fetcher=async(_url,opts)=>{
  const p=JSON.parse(opts.body);calls.push(p.method);
  const result=p.method==='getTokenLargestAccounts'?largest:p.method==='getMultipleAccounts'?accounts:
    {value:{owner:a1,executable:false}};
  return {ok:true,json:async()=>({result})};
 };
 const ownerData=await probeLargestOwnerAccounts(mint,'https://rpc.example/private',fetcher);
 const poolData=await probePoolProgram(a1,'https://rpc.example/private',fetcher);
 assert.deepEqual(calls,['getTokenLargestAccounts','getMultipleAccounts','getAccountInfo']);
 assert.equal(ownerData.uniqueAuthorityCount,1);
 assert.equal(poolData.lpLockVerified,false);
 assert.equal(poolData.status,'POOL_ACCOUNT_OBSERVED');
});
test('Cron records provisional evidence and leaves every green/trading permission off',async()=>{
 const statements=[];
 const env={HELIUS_RPC_URL:'https://rpc.example/private',DB:{
   prepare(sql){return {bind(...args){return {
     sql,args,async all(){return {results:[{asset_key:'solana:'+mint,address:mint,pool:a1}]}}
   }}}},
   batch:async rows=>{statements.push(...rows);return []}
 }};
 const fetcher=async(_url,opts)=>{
  const method=JSON.parse(opts.body).method;
  return {ok:true,json:async()=>({result:method==='getTokenLargestAccounts'?largest:
   method==='getMultipleAccounts'?accounts:{value:{owner:a1,executable:false}}})};
 };
 const r=await runGreenProbes(env,{now:'2026-10-19T12:00:00Z',fetcher});
 assert.equal(r.checked,1);assert.equal(r.fullGreenApprovals,0);assert.equal(r.lpLocksVerified,0);
 assert.equal(statements.length,2);
 assert.ok(statements[0].args[2].includes('"beneficialOwnersVerified":false'));
 assert.ok(statements[1].args[2].includes('"lpLockVerified":false'));
 assert.ok(statements.every(x=>!x.sql.includes('UPDATE assets')));
});
test('Missing secret or malformed pool leaves probes as unknown',async()=>{
 const result=await runGreenProbes({DB:{prepare(){throw Error('should not access DB')}}});
 assert.equal(result.enabled,false);
 const pool=await probePoolProgram('not-a-solana-address','https://rpc.example/test');
 assert.equal(pool.status,'NO_SOLANA_POOL_ACCOUNT');
});
