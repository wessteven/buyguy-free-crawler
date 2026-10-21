import test from 'node:test';
import assert from 'node:assert/strict';
import {binaryPoolCreationLead,decodeBase58Instruction} from '../src/helius-binary-pool.mjs';
import {classifyPoolCreationLead} from '../src/helius-discovery-probe.mjs';
import {PUMPSWAP} from '../src/pumpswap.mjs';
import {RAYDIUM_CPMM} from '../src/raydium-cpmm.mjs';
const pool='11111111111111111111111111111111';
const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function encode(bytes){
 let n=0n;for(const b of bytes)n=(n<<8n)+BigInt(b);
 let s='';while(n>0n){s=alphabet[Number(n%58n)]+s;n/=58n;}
 for(const b of bytes){if(b!==0)break;s='1'+s;}
 return s;
}
const cases=[
 {programId:PUMPSWAP,disc:[233,146,209,142,207,104,64,188],poolIndex:0,count:18},
 {programId:RAYDIUM_CPMM,disc:[175,175,109,31,13,152,155,237],poolIndex:3,count:20}
];
for(const item of cases)test('IDL discriminator and full accounts required: '+item.programId,()=>{
 const accounts=Array(item.count).fill(pool);
 const ix={programId:item.programId,accounts,data:encode([...item.disc,1,2,3])};
 assert.equal(binaryPoolCreationLead(ix).pool,pool);
 assert.equal(classifyPoolCreationLead({meta:{err:null},transaction:{message:{instructions:[ix]}}}).leads.length,1);
 assert.equal(binaryPoolCreationLead({...ix,accounts:accounts.slice(0,-1)}),null);
 assert.equal(binaryPoolCreationLead({...ix,data:encode([0,...item.disc])}),null);
 assert.equal(binaryPoolCreationLead({...ix,programId:pool}),null);
 assert.equal(binaryPoolCreationLead({...ix,accounts:accounts.map((x,i)=>i===item.poolIndex?'bad':x)}),null);
});
test('base58 bytes decode strictly and reject malformed payloads',()=>{
 const bytes=[0,0,233,146,209,142,207,104,64,188];
 assert.deepEqual([...decodeBase58Instruction(encode(bytes))],bytes);
 assert.equal(decodeBase58Instruction('0OIl'),null);
 assert.equal(decodeBase58Instruction('1'.repeat(1025)),null);
});
