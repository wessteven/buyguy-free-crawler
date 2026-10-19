import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeB58,migrationDiscriminators,deriveBondingCurve,
 matchMigrationTx,probeMigrationTransaction} from '../src/pump-migration-tx.mjs';
import {PUMP_BONDING_CURVE} from '../src/pumpswap.mjs';
const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const mint='So11111111111111111111111111111111111111112';
const pool='SysvarRent111111111111111111111111111111111';
const signature='1'.repeat(87);
function encode58(bytes){
 let n=0n;for(const b of bytes)n=n*256n+BigInt(b);
 let result='';while(n){result=alphabet[Number(n%58n)]+result;n/=58n}
 for(const b of bytes){if(b!==0)break;result='1'+result}return result;
}
function fakeTx(curve,bytes,{wrongProgram=false,omittedPool=false,err=null}={}){
 const keys=[pool,wrongProgram?mint:PUMP_BONDING_CURVE,mint,curve];
 const accounts=omittedPool?[2,3]:[0,2,3];
 return {slot:1234,blockTime:1770000000,meta:{err,loadedAddresses:{writable:[],readonly:[]}},
   transaction:{message:{accountKeys:keys,instructions:[
     {programIdIndex:1,accounts,data:encode58(bytes)}
   ]}}};
}
test('Correct anchor migrate and migrate_v2 instruction discriminators are distinct',async()=>{
 const types=await migrationDiscriminators();
 assert.deepEqual(types.map(x=>x.name),['migrate','migrate_v2']);
 assert.notDeepEqual(types[0].bytes,types[1].bytes);
 for(const t of types)assert.deepEqual(decodeB58(encode58(t.bytes)),t.bytes);
 assert.equal(decodeB58('0x not base58'),null);
});
test('Only a successful Pump instruction referencing exact pool/mint/curve is migration evidence',async()=>{
 const curve=(await deriveBondingCurve(mint)).address,kinds=await migrationDiscriminators();
 for(const type of kinds){
   const tx=fakeTx(curve,type.bytes);
   const found=matchMigrationTx(tx,{pool,mint,bondingCurve:curve,discriminators:kinds});
   assert.equal(found.kind,type.name);
   assert.equal(found.slot,1234);
   for(const opts of [{wrongProgram:true},{omittedPool:true},{err:{InstructionError:[0,'Custom']}}])
     assert.equal(matchMigrationTx(fakeTx(curve,type.bytes,opts),
       {pool,mint,bondingCurve:curve,discriminators:kinds}),null);
   assert.equal(matchMigrationTx(tx,{pool:mint,mint,bondingCurve:curve,
     discriminators:kinds}),null);
 }
});
test('One verified migration transaction returns proof without certifying LP locks',async()=>{
 const curve=(await deriveBondingCurve(mint)).address,kinds=await migrationDiscriminators();
 const calls=[];
 const fetcher=async(_,options)=>{
   const args=JSON.parse(options.body);calls.push(args.method);
   return {ok:true,json:async()=>({result:args.method==='getSignaturesForAddress'?
     [{signature,err:null}]:fakeTx(curve,kinds[0].bytes)})};
 };
 const proof=await probeMigrationTransaction(mint,pool,'https://helius.example/rpc',{fetcher});
 assert.equal(proof.status,'MIGRATION_TRANSACTION_VERIFIED');
 assert.equal(proof.migrationTxVerified,true);
 assert.equal(proof.verifiedSignature,signature);
 assert.equal(proof.examinedSignatures,1);
 assert.deepEqual(calls,['getSignaturesForAddress','getTransaction']);
 assert.equal(proof.lpLockVerified,undefined);
});
test('Empty, non-matching or invalid migration lookup never fabricates a transaction',async()=>{
 const fetcher=async(_,options)=>{
   const q=JSON.parse(options.body);
   return {ok:true,json:async()=>({result:q.method==='getSignaturesForAddress'?
      [{signature,err:null}]:{meta:{err:null},transaction:{message:{accountKeys:[],instructions:[]}}}})};
 };
 const r=await probeMigrationTransaction(mint,pool,'https://helius.example/rpc',{fetcher});
 assert.equal(r.migrationTxVerified,false);
 assert.equal(r.status,'MIGRATION_TRANSACTION_NOT_FOUND');
 assert.equal((await probeMigrationTransaction('bad',pool,'https://example.com')).status,
   'INVALID_MINT_OR_POOL');
});
