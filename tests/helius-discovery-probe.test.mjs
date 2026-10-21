import test from 'node:test';
import assert from 'node:assert/strict';
import {heliusDiscoveryProbe,classifyHeliusTransaction,classifyHeliusSignatures,classifyPoolCreationLead} from '../src/helius-discovery-probe.mjs';
const program='11111111111111111111111111111111';
test('probe stays off without configured RPC and program',async()=>{
 assert.equal((await heliusDiscoveryProbe({})).enabled,false);
 assert.equal((await heliusDiscoveryProbe({HELIUS_RPC_URL:'https://example.org'})).enabled,false);
});
test('bounded read-only RPC never labels a signature as a token',async()=>{
 let requests=0;
 const result=await heliusDiscoveryProbe({HELIUS_RPC_URL:'https://example.org'},{
  program,limit:999,fetcher:async(_url,opts)=>{
   requests++;
   const body=JSON.parse(opts.body);
   assert.equal(body.method,'getSignaturesForAddress');
   assert.equal(body.params[1].limit,20);
   return {ok:true,json:async()=>({result:[{signature:'a'.repeat(88),slot:123,blockTime:10,err:null}]})};
  }
 });
 assert.equal(requests,1);
 assert.equal(result.candidates.length,1);
 assert.equal(result.candidates[0].status,'UNCLASSIFIED');
});

test('parsed SPL mint initialization is evidence only, not tradability',()=>{
 const tx={meta:{err:null},transaction:{message:{instructions:[{
  program:'spl-token',parsed:{type:'initializeMint2',info:{mint:program}}
 }]}}};
 const out=classifyHeliusTransaction(tx);
 assert.equal(out.status,'MINT_INITIALIZATION_OBSERVED');
 assert.deepEqual(out.mints,[program]);
 assert.match(out.caveat,/not pool creation/);
});
test('failed transaction cannot become a mint discovery',()=>{
 const tx={meta:{err:{InstructionError:[0,'InvalidArgument']}},transaction:{message:{instructions:[{
  program:'spl-token',parsed:{type:'initializeMint',info:{mint:program}}
 }]}}};
 assert.equal(classifyHeliusTransaction(tx).status,'FAILED_OR_MISSING');
});
test('second-stage transaction requests are capped at five and read only',async()=>{
 let count=0;
 const signatures=Array.from({length:8},(_,i)=>String(i+1).repeat(88));
 const result=await classifyHeliusSignatures({HELIUS_RPC_URL:'https://example.org'},{
  signatures,fetcher:async(_url,options)=>{
   count++;
   assert.equal(JSON.parse(options.body).method,'getTransaction');
   return {ok:true,json:async()=>({result:{meta:{err:null},transaction:{message:{instructions:[]}}}})};
  }
 });
 assert.equal(count,5);
 assert.equal(result.checked,5);
 assert.ok(result.results.every(x=>x.status==='UNCLASSIFIED'));
});

test('pool lead needs exact protocol and explicit initialization, never verified',async()=>{
 const {PUMPSWAP}=await import('../src/pumpswap.mjs');
 const tx={meta:{err:null},transaction:{message:{instructions:[
  {programId:PUMPSWAP,parsed:{type:'swap',info:{pool:program}}},
  {programId:PUMPSWAP,parsed:{type:'initialize',info:{pool:program}}}
 ]}}};
 const result=classifyPoolCreationLead(tx);
 assert.equal(result.status,'POOL_CREATION_LEADS');
 assert.equal(result.leads.length,1);
 assert.equal(result.leads[0].verified,false);
 assert.equal(classifyPoolCreationLead({...tx,meta:{err:'failed'}}).leads.length,0);
});
test('unknown programs and unparsed binary instructions cannot certify pools',()=>{
 const tx={meta:{err:null},transaction:{message:{instructions:[
  {programId:program,parsed:{type:'initialize',info:{pool:program}}},
  {programId:'pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA',data:'binary',accounts:[program]}
 ]}}};
 assert.equal(classifyPoolCreationLead(tx).status,'UNCLASSIFIED');
});
