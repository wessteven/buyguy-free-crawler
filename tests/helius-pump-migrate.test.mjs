import test from 'node:test';
import assert from 'node:assert/strict';
import {binaryPoolCreationLead} from '../src/helius-binary-pool.mjs';
const program='6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';
const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function encode(bytes){let n=0n;for(const b of bytes)n=n*256n+BigInt(b);let out='';while(n){out=alphabet[Number(n%58n)]+out;n/=58n;}return out;}
const disc=[155,234,231,146,236,158,162,30];
const pool='2'.repeat(32);
const make=(data=disc,accounts=Array(25).fill('1'.repeat(32)))=>({programId:program,data:encode(data),accounts});
test('official pump migrate IDL identifies pool at account index 9',()=>{
 const ix=make();ix.accounts[9]=pool;
 assert.deepEqual(binaryPoolCreationLead(ix),{protocol:'PUMPSWAP',pool,evidence:'PUMP_MIGRATE_IDL_DISCRIMINATOR',verified:false});
});
test('reject truncated migrate account list',()=>assert.equal(binaryPoolCreationLead(make(disc,Array(24).fill(pool))),null));
test('reject wrong migrate discriminator',()=>assert.equal(binaryPoolCreationLead(make([0,...disc.slice(1)])),null));
test('reject wrong program',()=>assert.equal(binaryPoolCreationLead({...make(),programId:'1'.repeat(32)}),null));
