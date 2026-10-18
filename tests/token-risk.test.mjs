import test from 'node:test';
import assert from 'node:assert/strict';
import {assessMintAccount,checkSolanaMint,SPL_TOKEN,TOKEN_2022} from '../src/token-risk.mjs';
const mint='So11111111111111111111111111111111111111112';
const fixture=(mintAuthority=null,freezeAuthority=null,owner=SPL_TOKEN)=>({
 result:{value:{owner,executable:false,data:{parsed:{type:'mint',info:{
  mintAuthority,freezeAuthority,decimals:9,isInitialized:true,supply:'99999'
 }}}}}
});
test('Revoked mint and freeze only grants partial assurance, never paper eligibility',()=>{
  const risk=assessMintAccount(mint,fixture());
  assert.equal(risk.riskStatus,'MINT_CONTROLS_REVOKED');
  assert.equal(risk.paperEligible,false);
  assert.ok(risk.notes.some(x=>x.includes('NOT VERIFIED')));
});
test('Active mint and freeze authorities are both risk flags',()=>{
  const risk=assessMintAccount(mint,fixture('operator','other'));
  assert.deepEqual(risk.flags,['MINT_AUTHORITY_ACTIVE','FREEZE_AUTHORITY_ACTIVE']);
  assert.equal(risk.riskStatus,'MINT_CONTROL_RISK');
});
test('Token-2022 unknown extensions are not cleared',()=>{
  const risk=assessMintAccount(mint,fixture(null,null,TOKEN_2022));
  assert.ok(risk.flags.includes('TOKEN_2022_EXTENSIONS_UNREVIEWED'));
});
test('Provider errors, incorrect owner and malformed metadata fail closed',()=>{
  assert.equal(assessMintAccount(mint,{error:{code:429}}).riskStatus,'UNVERIFIED');
  assert.ok(assessMintAccount(mint,fixture(null,null,'11111111111111111111111111111111')).flags.includes('UNKNOWN_ACCOUNT_OWNER'));
  assert.ok(assessMintAccount('wrong',fixture()).flags.includes('INVALID_MINT_ADDRESS'));
});
test('RPC transport calls only exact mint info, no transaction signing',async()=>{
  let called=null;
  const fetcher=async(url,options)=>{called={url,options};return {ok:true,json:async()=>fixture()};};
  const result=await checkSolanaMint({mint,rpcEndpoint:'https://example.test/secure-rpc',fetcher});
  assert.equal(result.paperEligible,false);
  assert.equal(JSON.parse(called.options.body).method,'getAccountInfo');
  assert.equal(JSON.parse(called.options.body).params[0],mint);
  assert.equal(called.options.method,'POST');
});
