import test from 'node:test';
import assert from 'node:assert/strict';
import {canonicalPumpCreator,assessPumpMigration,base58Pubkey,
 isEd25519Point,findPda} from '../src/pump-migration.mjs';
import {PUMP_BONDING_CURVE} from '../src/pumpswap.mjs';
const mint='So11111111111111111111111111111111111111112';
const original={protocol:'PUMPSWAP',status:'POOL_VAULTS_VERIFIED',
  pool:'11111111111111111111111111111111',poolCreator:'',
  poolIndex:0,baseMint:mint,vaultsVerified:true,lpSupplyRaw:'41000000000',
  lpMintSupplyRaw:'0',lpSupplyGapBps:10000};
test('Canonical Pump creator derives deterministically from exact mint and pump program',async()=>{
 const first=await canonicalPumpCreator(mint),second=await canonicalPumpCreator(mint);
 assert.deepEqual(first,second);
 assert.equal(first.address.length>=32,true);
 assert.equal(isEd25519Point(base58Pubkey(first.address)),false);
 const different=await canonicalPumpCreator('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
 assert.notEqual(first.address,different.address);
 const other=await findPda([new TextEncoder().encode('pool-authority'),
   base58Pubkey(mint)],PUMP_BONDING_CURVE);
 assert.deepEqual(other,first);
});
test('Ed25519 point recognition rejects large y and accepts Solana basepoint',()=>{
 const base=Uint8Array.from([0x58,...Array(31).fill(0x66)]);
 assert.equal(isEd25519Point(base),true);
 assert.equal(isEd25519Point(new Uint8Array(32).fill(255)),false);
 assert.equal(base58Pubkey('0x1111111111111111111111111111111111111111'),null);
 assert.equal(base58Pubkey('11111111111111111111111111111111')?.length,32);
});
test('Canonical index zero and creator PDA plus zero live LP form strong nontrade provenance',async()=>{
 const creator=(await canonicalPumpCreator(mint)).address;
 const r=await assessPumpMigration({...original,poolCreator:creator});
 assert.equal(r.canonicalPool,true);
 assert.equal(r.canonicalIndexMatches,true);
 assert.equal(r.lpSupplyZero,true);
 assert.equal(r.status,'CANONICAL_LP_BURN_PATTERN');
 assert.equal(r.migrationTxVerified,false);
 assert.equal(r.lpLockVerified,false);
 assert.match(r.note,/NOT an observed migrate transaction/);
});
test('Ordinary creator-owned pool cannot inherit canonical migration burn',async()=>{
 const creator=(await canonicalPumpCreator(mint)).address;
 for(const pool of [
   {...original,poolCreator:original.pool},
   {...original,poolCreator:creator,poolIndex:1}]){
   const r=await assessPumpMigration(pool);
   assert.equal(r.status,'NONCANONICAL_POOL');
   assert.equal(r.canonicalPool,false);
   assert.equal(r.migrationTxVerified,false);
 }
});
test('Canonical pool with remaining LP tokens must not claim burn',async()=>{
 const creator=(await canonicalPumpCreator(mint)).address;
 const r=await assessPumpMigration({...original,poolCreator:creator,
   lpMintSupplyRaw:'123456789',lpSupplyGapBps:9700});
 assert.equal(r.canonicalPool,true);
 assert.equal(r.lpSupplyZero,false);
 assert.equal(r.status,'CANONICAL_POOL_UNBURNED_OR_INCOMPLETE');
 assert.equal(r.lpLockVerified,false);
});
test('Unverified pool vaults and invalid token identity stay unverified',async()=>{
 const creator=(await canonicalPumpCreator(mint)).address;
 for(const input of [{...original,poolCreator:creator,vaultsVerified:false},
   {...original,poolCreator:creator,baseMint:'not-a-mint'},null]){
   const result=await assessPumpMigration(input);
   assert.equal(result.status,'UNVERIFIED');
   assert.equal(result.canonicalPool,false);
 }
});
