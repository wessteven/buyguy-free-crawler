import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeUpgradeableProgram,decodeProgramData,inspectProgramUpgradeAuthority,
 UPGRADEABLE_LOADER} from '../src/program-authority.mjs';
const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function pk(s){let n=0n;for(const c of s){const x=alphabet.indexOf(c);if(x<0)throw Error('invalid');n=n*58n+BigInt(x)}
 const bytes=new Uint8Array(32);for(let i=31;i>=0&&n>0n;i--){bytes[i]=Number(n%256n);n/=256n}
 return bytes;
}
const program='pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA';
const pointer='SysvarRent111111111111111111111111111111111';
const authority='Vote111111111111111111111111111111111111111';
const binary=(bytes,executable=false)=>({owner:UPGRADEABLE_LOADER,executable,
  data:[Buffer.from(bytes).toString('base64'),'base64']});
const programState=()=>{const b=new Uint8Array(36);b[0]=2;b.set(pk(pointer),4);return binary(b,true)};
const dataState=enabled=>{const b=new Uint8Array(45);b[0]=3;b[12]=enabled?1:0;
 if(enabled)b.set(pk(authority),13);
 return binary(b,false)};
test('Upgradeable Solana program pointer comes only from BPF loader program state',()=>{
 const p=decodeUpgradeableProgram(program,programState());
 assert.equal(p.programData,pointer);
 assert.equal(p.status,'PROGRAMDATA_POINTER_VERIFIED');
 assert.equal(decodeUpgradeableProgram(program,{...programState(),owner:authority}).programData,null);
});
test('Only none upgrade authority makes program immutable; valid authority means upgradeable',()=>{
 const imm=decodeProgramData(dataState(false),pointer,program);
 assert.equal(imm.status,'PROGRAM_IMMUTABLE');
 assert.equal(imm.immutable,true);
 assert.equal(imm.upgradeAuthorityPresent,false);
 const editable=decodeProgramData(dataState(true),pointer,program);
 assert.equal(editable.status,'PROGRAM_UPGRADEABLE');
 assert.equal(editable.upgradeAuthority,authority);
 assert.equal(editable.immutable,false);
});
test('Corrupt/unknown programdata option fails closed, never certifies immutability',()=>{
 const bad=dataState(false);const bytes=Buffer.from(bad.data[0],'base64');bytes[12]=99;
 assert.equal(decodeProgramData(binary(bytes),pointer,program).immutable,false);
 assert.equal(decodeProgramData({owner:authority},pointer,program).status,'INVALID_PROGRAMDATA_ACCOUNT');
});
test('Real RPC wrapper issues only two minimal read-only getAccountInfo requests',async()=>{
 const calls=[];
 const fetcher=async(_,opt)=>{const q=JSON.parse(opt.body);calls.push(q);
   return {ok:true,json:async()=>({result:{value:
    calls.length===1?programState():dataState(true)}})}};
 const r=await inspectProgramUpgradeAuthority(program,'https://helius.example/rpc',fetcher);
 assert.equal(r.status,'PROGRAM_UPGRADEABLE');
 assert.equal(calls.length,2);
 assert.equal(calls[0].params[1].dataSlice.length,36);
 assert.equal(calls[1].params[1].dataSlice.length,45);
 assert.deepEqual(calls.map(x=>x.method),['getAccountInfo','getAccountInfo']);
});
