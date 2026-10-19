import test from 'node:test';
import assert from 'node:assert/strict';
import {decodePumpSwapPool,verifyPumpSwapVaults,inspectPumpSwapPool,
  PUMPSWAP,PUMP_BONDING_CURVE,PUMPSWAP_POOL_DISCRIMINATOR} from '../src/pumpswap.mjs';
import {SPL_TOKEN} from '../src/token-risk.mjs';
const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const base='So11111111111111111111111111111111111111112';
const quote='EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const pool='11111111111111111111111111111111';
const creator='SysvarRent111111111111111111111111111111111';
const lp='Stake11111111111111111111111111111111111111';
const baseVault='Vote111111111111111111111111111111111111111';
const quoteVault='BPFLoaderUpgradeab1e11111111111111111111111';
function from58(s){
 let n=0n;for(const c of s){const i=alphabet.indexOf(c);if(i<0)throw Error('not base58');n=n*58n+BigInt(i)}
 const a=new Uint8Array(32);
 for(let i=31;i>=0&&n>0n;i--){a[i]=Number(n%256n);n/=256n}
 if(n>0n)throw Error('pubkey overflow');return a;
}
function state({owner=PUMPSWAP,discriminator=PUMPSWAP_POOL_DISCRIMINATOR,index=0,supply=1000000n}={}){
 const data=new Uint8Array(301);
 data.set(discriminator,0);data[8]=255;
 data[9]=index&255;data[10]=(index>>8)&255;
 for(const [offset,key] of [[11,creator],[43,base],[75,quote],[107,lp],
   [139,baseVault],[171,quoteVault]])data.set(from58(key),offset);
 for(let i=0;i<8;i++){data[203+i]=Number(supply&255n);supply>>=8n;}
 return {owner,executable:false,data:[Buffer.from(data).toString('base64'),'base64']};
}
function vault(mint){return {owner:SPL_TOKEN,data:{parsed:{type:'account',info:{
 mint,owner:pool,tokenAmount:{amount:'100000'}
}}}}}
const mintAccount=(supply='900000')=>({owner:SPL_TOKEN,data:{parsed:{type:'mint',info:{
 isInitialized:true,supply
}}}});
test('PumpSwap official program decodes correct 301-byte extended Pool layout',()=>{
 const r=decodePumpSwapPool(pool,state());
 assert.equal(r.status,'PUMPSWAP_LAYOUT_VERIFIED');
 assert.equal(r.poolIndex,0);
 assert.equal(r.baseMint,base);
 assert.equal(r.quoteMint,quote);
 assert.equal(r.baseVault,baseVault);
 assert.equal(r.quoteVault,quoteVault);
 assert.equal(r.lpMint,lp);
 assert.equal(r.lpSupplyRaw,'1000000');
 assert.equal(r.lpLockVerified,false);
});
test('Pump.fun bonding curve is not an LP pool; arbitrary pool-owner program blocked',()=>{
 const bc=decodePumpSwapPool(pool,state({owner:PUMP_BONDING_CURVE}));
 assert.equal(bc.status,'BONDING_CURVE_NO_LP_POOL');
 assert.equal(bc.lpLockVerified,false);
 assert.equal(decodePumpSwapPool(pool,state({owner:creator})).status,'UNSUPPORTED_PROTOCOL');
 assert.ok(decodePumpSwapPool(pool,state({discriminator:Array(8).fill(0)}))
  .flags.includes('POOL_DISCRIMINATOR_MISMATCH'));
});
test('Exact mint, paired vault token accounts and LP mint identity required',()=>{
 const data=decodePumpSwapPool(pool,state());
 const report=verifyPumpSwapVaults(data,[vault(base),vault(quote),mintAccount()],base);
 assert.equal(report.status,'POOL_VAULTS_VERIFIED');
 assert.equal(report.vaultsVerified,true);
 assert.deepEqual(report.verifiedVaults,[baseVault,quoteVault]);
 assert.equal(report.lpSupplyGapBps,1000);
 assert.equal(report.lpLockVerified,false);
 const spoofVault=vault(quote);spoofVault.data.parsed.info.owner=creator;
 assert.ok(verifyPumpSwapVaults(data,[vault(base),spoofVault,mintAccount()],base)
  .flags.includes('UNVERIFIED_POOL_VAULT'));
 assert.equal(verifyPumpSwapVaults(data,[vault(base),vault(quote),mintAccount()],creator)
  .vaultsVerified,false);
});
test('Current circulating LP mint supply cannot be confused with proof of LP lock',()=>{
 const decoded=decodePumpSwapPool(pool,state({supply:900000n}));
 const r=verifyPumpSwapVaults(decoded,[vault(base),vault(quote),mintAccount('1000000')],base);
 assert.equal(r.vaultsVerified,true);
 assert.equal(r.lpSupplyGapBps,null);
 assert.equal(r.lpLockVerified,false);
});
test('Live RPC adapter makes read-only getAccountInfo and getMultipleAccounts requests only',async()=>{
 const seen=[];
 const result=await inspectPumpSwapPool(pool,base,'https://helius.example/rpc',async(_,req)=>{
  const input=JSON.parse(req.body);seen.push(input);
  return {ok:true,json:async()=>({result:input.method==='getAccountInfo'?
    {value:state()}:{value:[vault(base),vault(quote),mintAccount()]}})};
 });
 assert.equal(result.status,'POOL_VAULTS_VERIFIED');
 assert.deepEqual(seen.map(x=>x.method),['getAccountInfo','getMultipleAccounts']);
 assert.deepEqual(seen[1].params[0],[baseVault,quoteVault,lp]);
});
