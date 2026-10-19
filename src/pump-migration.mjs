// Pump.fun canonical migration-derived PumpSwap pool classifier.
// Official pump-public-docs: canonical creator PDA seeds ["pool-authority", base_mint]
// under Pump bonding-curve program; canonical pool index 0.
// All derivations use SHA-256 and ed25519 compressed-point decompression.
// Distinguishes 1) canonical identity 2) LP supply burn pattern 3) independently
// verified migration TX (not currently sourced). NEVER claims locked liquidity.
import {PUMP_BONDING_CURVE} from './pumpswap.mjs';
import {toBase58} from './raydium-cpmm.mjs';
const ab='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const textEncoder=new TextEncoder();
const p=(1n<<255n)-19n;
const d=mod(-121665n*pow(121666n,p-2n),p);
const sqrtMinusOne=pow(2n,(p-1n)/4n);
function mod(a,n=p){const x=a%n;return x<0n?x+n:x}
function pow(base,exp){let acc=1n,x=mod(base);while(exp){if(exp&1n)acc=mod(acc*x);x=mod(x*x);exp>>=1n}return acc}
export function base58Pubkey(value){
 if(typeof value!=='string'||value.length<32||value.length>44)return null;
 let n=0n,zeros=0;
 for(const ch of value){const v=ab.indexOf(ch);if(v<0)return null;n=n*58n+BigInt(v)}
 for(const ch of value){if(ch!=='1')break;zeros++}
 const bytes=[];
 while(n){bytes.unshift(Number(n&255n));n>>=8n}
 const output=Uint8Array.from([...Array(zeros).fill(0),...bytes]);
 return output.length===32?output:null;
}
export function isEd25519Point(bytes){
 if(!(bytes instanceof Uint8Array)||bytes.length!==32)return false;
 const copy=Uint8Array.from(bytes);
 const sign=copy[31]>>>7;copy[31]&=127;
 let y=0n;
 for(let i=31;i>=0;i--)y=(y<<8n)+BigInt(copy[i]);
 if(y>=p)return false;
 const y2=mod(y*y),u=mod(y2-1n),v=mod(d*y2+1n);
 if(v===0n)return false;
 const x2=mod(u*pow(v,p-2n));
 let x=pow(x2,(p+3n)/8n);
 if(mod(x*x)!==x2)x=mod(x*sqrtMinusOne);
 if(mod(x*x)!==x2)return false;
 if(x===0n&&sign!==0)return false;
 return true;
}
async function hash(...parts){
 const size=parts.reduce((n,b)=>n+b.length,0),msg=new Uint8Array(size);
 let offset=0;for(const part of parts){msg.set(part,offset);offset+=part.length}
 const bytes=await crypto.subtle.digest('SHA-256',msg);
 return new Uint8Array(bytes);
}
export async function findPda(seeds,programId){
 const program=base58Pubkey(programId);
 if(!program||!Array.isArray(seeds)||seeds.length>16||
    !seeds.every(x=>x instanceof Uint8Array&&x.length<=32))
   throw Error('Invalid PDA derivation inputs');
 const label=textEncoder.encode('ProgramDerivedAddress');
 for(let bump=255;bump>=0;bump--){
   const digest=await hash(...seeds,Uint8Array.of(bump),program,label);
   if(!isEd25519Point(digest))return {address:toBase58(digest),bump};
 }
 throw Error('No off-curve PDA derived');
}
export async function canonicalPumpCreator(mint){
 const mintBytes=base58Pubkey(mint);
 if(!mintBytes)throw Error('Invalid exact Solana mint');
 return findPda([textEncoder.encode('pool-authority'),mintBytes],PUMP_BONDING_CURVE);
}
export async function assessPumpMigration(poolInfo){
 const result={
  verifier:'buyguy-pump-canonical-v1',protocol:'PUMPSWAP',
  assetMint:poolInfo?.baseMint||null,pool:poolInfo?.pool||null,
  status:'UNVERIFIED',canonicalPool:false,canonicalCreatorMatches:false,
  canonicalIndexMatches:false,lpSupplyZero:false,lpSupplyGapBps:null,
  migrationTxVerified:false,lpLockVerified:false,
  flags:[],note:'Canonical creator identity and empty LP supply are not a confirmed migration transaction or safety certificate.'
 };
 if(poolInfo?.protocol!=='PUMPSWAP'||!poolInfo.vaultsVerified||
    poolInfo.status!=='POOL_VAULTS_VERIFIED'||
    !base58Pubkey(poolInfo.baseMint||'')||
    !base58Pubkey(poolInfo.poolCreator||'')){
    result.flags.push('PUMPSWAP_VAULT_VERIFICATION_REQUIRED');return result;
 }
 const expected=await canonicalPumpCreator(poolInfo.baseMint);
 result.expectedCreator=expected.address;
 result.canonicalCreatorMatches=poolInfo.poolCreator===expected.address;
 result.canonicalIndexMatches=poolInfo.poolIndex===0;
 result.canonicalPool=result.canonicalCreatorMatches&&result.canonicalIndexMatches;
 result.lpSupplyGapBps=Number.isFinite(poolInfo.lpSupplyGapBps)?poolInfo.lpSupplyGapBps:null;
 const poolLP=typeof poolInfo.lpSupplyRaw==='string'&&/^\d+$/.test(poolInfo.lpSupplyRaw)?
   BigInt(poolInfo.lpSupplyRaw):null;
 const liveLP=typeof poolInfo.lpMintSupplyRaw==='string'&&/^\d+$/.test(poolInfo.lpMintSupplyRaw)?
   BigInt(poolInfo.lpMintSupplyRaw):null;
 result.lpSupplyZero=poolLP!==null&&poolLP>0n&&liveLP===0n;
 if(result.canonicalPool&&result.lpSupplyZero){
   result.status='CANONICAL_LP_BURN_PATTERN';
   result.note='Canonical Pump PDA and index 0 match; positive recorded LP supply and zero current LP mint supply. This strongly supports the documented migration/burn mechanism but is NOT an observed migrate transaction. Code governance and sellability remain independent risks.';
 }else if(result.canonicalPool){
   result.status='CANONICAL_POOL_UNBURNED_OR_INCOMPLETE';
   result.flags.push('CIRCULATING_LP_OR_SUPPLY_UNAVAILABLE');
 }else{
   result.status='NONCANONICAL_POOL';
   result.flags.push('NOT_CANONICAL_PUMP_CREATOR_AND_INDEX');
 }
 return result;
}
