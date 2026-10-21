// Anchor binary pool-creation leads. Discriminators/account order pinned to
// pump-fun/pump-public-docs pump_amm.json and raydium-io/raydium-idl cp_swap.json.
// Evidence only: never equate instruction bytes with verified on-chain pool state.
import {PUMPSWAP} from './pumpswap.mjs';
import {RAYDIUM_CPMM} from './raydium-cpmm.mjs';
const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const address=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const specs={
 [PUMPSWAP]:{protocol:'PUMPSWAP',discriminator:[233,146,209,142,207,104,64,188],poolIndex:0,minAccounts:5},
 [RAYDIUM_CPMM]:{protocol:'RAYDIUM_CPMM',discriminator:[175,175,109,31,13,152,155,237],poolIndex:3,minAccounts:8}
};
export function decodeBase58Instruction(value){
 if(typeof value!=='string'||value.length>1024||!/^[1-9A-HJ-NP-Za-km-z]+$/.test(value))return null;
 let number=0n;
 for(const c of value){const i=alphabet.indexOf(c);if(i<0)return null;number=number*58n+BigInt(i);}
 const bytes=[];
 while(number>0n){bytes.unshift(Number(number&255n));number>>=8n;}
 for(const c of value){if(c!=='1')break;bytes.unshift(0);}
 return Uint8Array.from(bytes);
}
export function binaryPoolCreationLead(ix){
 const spec=specs[ix?.programId];
 if(!spec||!Array.isArray(ix?.accounts)||ix.accounts.length<spec.minAccounts)return null;
 const data=decodeBase58Instruction(ix.data);
 if(!data||data.length<8||!spec.discriminator.every((byte,i)=>data[i]===byte))return null;
 const pool=ix.accounts[spec.poolIndex];
 if(typeof pool!=='string'||!address.test(pool))return null;
 return {protocol:spec.protocol,pool,evidence:'BINARY_IDL_DISCRIMINATOR',verified:false};
}
