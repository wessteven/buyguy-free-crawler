// Solana BPF Upgradeable Loader v3 program/ProgramData authority check.
// Official loader metadata: Program=4 type + 32 ProgramData pubkey.
// ProgramData=4 type + 8 slot + 1 option + optional 32 pubkey.
// Never assume "known AMM" means immutable or source-verified.
import {toBase58} from './raydium-cpmm.mjs';
export const UPGRADEABLE_LOADER='BPFLoaderUpgradeab1e11111111111111111111111';
const key=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
function parseAccountData(value){
 const encoded=Array.isArray(value?.data)?value.data[0]:null;
 if(typeof encoded!=='string'||encoded.length>1000||!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded))
   return null;
 try{return Uint8Array.from(atob(encoded),ch=>ch.charCodeAt(0))}catch{return null}
}
const u32=(x,at)=>x[at]|(x[at+1]<<8)|(x[at+2]<<16)|((x[at+3]<<24)>>>0);
export function decodeUpgradeableProgram(program,account){
 const result={program,status:'UNKNOWN',upgradeAuthorityPresent:null,
  immutable:false,programData:null,flags:[]};
 if(!key.test(program||'')||account?.owner!==UPGRADEABLE_LOADER||
   account.executable!==true)return {...result,status:'UNSUPPORTED_OR_INVALID_PROGRAM',
    flags:['NOT_UPGRADEABLE_LOADER_PROGRAM']};
 const bytes=parseAccountData(account);
 if(!bytes||bytes.length!==36||u32(bytes,0)!==2)
   return {...result,status:'INVALID_PROGRAM_STATE',flags:['PROGRAM_STATE_MISMATCH']};
 return {...result,status:'PROGRAMDATA_POINTER_VERIFIED',programData:toBase58(bytes.slice(4,36))};
}
export function decodeProgramData(account,pointer,program){
 const result={program,programData:pointer,status:'UNKNOWN',
   upgradeAuthorityPresent:null,upgradeAuthority:null,immutable:false,
   flags:[]};
 if(!key.test(pointer||'')||account?.owner!==UPGRADEABLE_LOADER)return {
    ...result,status:'INVALID_PROGRAMDATA_ACCOUNT',flags:['PROGRAMDATA_OWNER_MISMATCH']};
 const bytes=parseAccountData(account);
 if(!bytes||bytes.length<13||u32(bytes,0)!==3){
   return {...result,status:'INVALID_PROGRAMDATA_STATE',flags:['PROGRAMDATA_LAYOUT_MISMATCH']};
 }
 const option=bytes[12];
 if(option===0)return {...result,status:'PROGRAM_IMMUTABLE',immutable:true,
   upgradeAuthorityPresent:false};
 if(option===1&&bytes.length>=45){
   const authority=toBase58(bytes.slice(13,45));
   return {...result,status:'PROGRAM_UPGRADEABLE',immutable:false,
     upgradeAuthorityPresent:true,upgradeAuthority:authority,
     caveat:'An upgrade authority can alter program behavior. This alone does not prove malicious intent.'};
 }
 return {...result,status:'INVALID_UPGRADE_OPTION',flags:['UPGRADE_AUTHORITY_NOT_PARSED']};
}
async function call(endpoint,address,limit,fetcher){
 const res=await fetcher(endpoint,{method:'POST',headers:{'content-type':'application/json'},
  body:JSON.stringify({jsonrpc:'2.0',id:1,method:'getAccountInfo',
    params:[address,{encoding:'base64',commitment:'confirmed',
       dataSlice:{offset:0,length:limit}}]})});
 if(!res.ok)throw Error('Helius program authority RPC HTTP '+res.status);
 const body=await res.json();
 if(body.error||!body?.result)throw Error('Helius authority metadata unavailable');
 return body.result.value;
}
export async function inspectProgramUpgradeAuthority(program,endpoint,fetcher=fetch){
 if(!key.test(program||'')||typeof endpoint!=='string'||!endpoint.startsWith('https://'))
   throw Error('Invalid program or private RPC endpoint');
 const account=await call(endpoint,program,36,fetcher);
 const state=decodeUpgradeableProgram(program,account);
 if(!state.programData)return state;
 const data=await call(endpoint,state.programData,45,fetcher);
 return {...state,...decodeProgramData(data,state.programData,program)};
}
