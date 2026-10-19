import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeRaydiumCpmmPool,verifyRaydiumVaults,inspectRaydiumCpmmPool,
 toBase58,RAYDIUM_CPMM,RAYDIUM_DISCRIMINATOR} from '../src/raydium-cpmm.mjs';
import {SPL_TOKEN} from '../src/token-risk.mjs';
const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function from58(s){
 let n=0n;for(const c of s){const i=alphabet.indexOf(c);if(i<0)throw Error('Invalid fixture pubkey');n=n*58n+BigInt(i)}
 const bytes=new Uint8Array(32);
 for(let i=31;i>=0&&n>0n;i--){bytes[i]=Number(n%256n);n/=256n}
 if(n>0n)throw Error('Fixture pubkey overflow');
 return bytes;
}
const pool='11111111111111111111111111111111';
const mint0='So11111111111111111111111111111111111111112';
const mint1='EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const v0='SysvarRent111111111111111111111111111111111';
const v1='Stake11111111111111111111111111111111111111';
const lp='Vote111111111111111111111111111111111111111';
const auth='BPFLoaderUpgradeab1e11111111111111111111111';
const fields=[pool,auth,v0,v1,lp,mint0,mint1,SPL_TOKEN,SPL_TOKEN,pool];
function poolState({program=RAYDIUM_CPMM,discriminator=RAYDIUM_DISCRIMINATOR,
 status=0,fieldsOverride=fields}={}){
 const bytes=new Uint8Array(637);
 bytes.set(discriminator,0);
 for(let i=0;i<10;i++)bytes.set(from58(fieldsOverride[i]),8+i*32);
 bytes[329]=status;
 return {owner:program,executable:false,data:[Buffer.from(bytes).toString('base64'),'base64']};
}
const vault=(mint,amount='200')=>({owner:SPL_TOKEN,data:{parsed:{type:'account',info:{
 mint,owner:auth,tokenAmount:{amount}
}}}});
const lpMint=()=>({owner:SPL_TOKEN,data:{parsed:{type:'mint',info:{
 isInitialized:true,supply:'1000000000'
}}}});
test('Base58 roundtrip handles Solana exact 32-byte addresses',()=>{
 for(const v of [pool,mint0,mint1,v0,v1,lp,auth])assert.equal(toBase58(from58(v)),v);
});
test('Official Raydium CPMM packed pool account decodes exactly matched token mints and vaults',()=>{
 const decoded=decodeRaydiumCpmmPool(pool,poolState());
 assert.equal(decoded.status,'CPMM_LAYOUT_VERIFIED');
 assert.equal(decoded.token0Mint,mint0);
 assert.equal(decoded.token1Mint,mint1);
 assert.equal(decoded.token0Vault,v0);
 assert.equal(decoded.token1Vault,v1);
 assert.equal(decoded.lpMint,lp);
 assert.equal(decoded.swapsEnabled,true);
 assert.equal(decoded.lpLockVerified,false);
});
test('Incorrect program, discriminator, length and unusual state fail closed',()=>{
 assert.equal(decodeRaydiumCpmmPool(pool,poolState({program:auth})).status,'UNSUPPORTED_PROTOCOL');
 assert.equal(decodeRaydiumCpmmPool(pool,poolState({discriminator:Array(8).fill(0)})).status,'UNVERIFIED');
 assert.ok(decodeRaydiumCpmmPool(pool,{...poolState(),data:['bWlzc2luZw==','base64']}).flags.includes('POOL_LAYOUT_UNKNOWN'));
 assert.ok(decodeRaydiumCpmmPool(pool,poolState({status:255})).flags.includes('UNEXPECTED_POOL_STATUS'));
});
test('Vaults are only trusted when both token accounts and LP mint match pool state',()=>{
 const decoded=decodeRaydiumCpmmPool(pool,poolState());
 const verified=verifyRaydiumVaults(decoded,[vault(mint0),vault(mint1),lpMint()],mint0);
 assert.equal(verified.status,'POOL_VAULTS_VERIFIED');
 assert.deepEqual(verified.verifiedVaults,[v0,v1]);
 assert.equal(verified.lpSupplyRaw,'1000000000');
 assert.equal(verified.lpLockVerified,false);
 assert.equal(verified.vaultAuthority,auth);
 assert.ok(verifyRaydiumVaults(decoded,[vault(mint0),vault(mint0),lpMint()],mint0)
  .flags.includes('VAULT_ACCOUNT_MINT_OR_PROGRAM_MISMATCH'));
 const badAuthority=vault(mint1);badAuthority.data.parsed.info.owner=pool;
 assert.ok(verifyRaydiumVaults(decoded,[vault(mint0),badAuthority,lpMint()],mint0)
  .flags.includes('VAULT_AUTHORITY_MISMATCH'));
 assert.equal(verifyRaydiumVaults(decoded,[vault(mint0),vault(mint1),lpMint()],auth).vaultsVerified,false);
});
test('Read-only pool inspection calls Helius getAccountInfo + getMultipleAccounts only',async()=>{
 const called=[];
 const r=await inspectRaydiumCpmmPool(pool,mint0,'https://rpc.example/private',async(_,params)=>{
   const body=JSON.parse(params.body);called.push(body);
   return {ok:true,json:async()=>({result:body.method==='getAccountInfo'?
     {value:poolState()}:{value:[vault(mint0),vault(mint1),lpMint()]}})};
 });
 assert.equal(r.status,'POOL_VAULTS_VERIFIED');
 assert.deepEqual(called.map(x=>x.method),['getAccountInfo','getMultipleAccounts']);
 assert.deepEqual(called[1].params[0],[v0,v1,lp]);
 assert.equal(called.some(x=>/sendTransaction|simulateTransaction/i.test(x.method)),false);
});
