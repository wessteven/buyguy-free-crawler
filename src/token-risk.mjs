// Contract checks are PARTIAL evidence only, never a scam-free guarantee.
// This module doesn't use private keys or transmit orders.
export const SPL_TOKEN='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
export const TOKEN_2022='TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
const b58=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
export function assessMintAccount(mint,rpcResponse) {
  const checkedAt=new Date().toISOString();
  const base={mint,chain:'solana',checkedAt,source:'Solana getAccountInfo jsonParsed',
    riskStatus:'UNVERIFIED',paperEligible:false,flags:[],notes:[]};
  if(!b58.test(mint)){base.flags.push('INVALID_MINT_ADDRESS');return base;}
  if(rpcResponse?.error){base.flags.push('RPC_ERROR');return base;}
  const value=rpcResponse?.result?.value;
  if(!value){base.flags.push('NO_MINT_ACCOUNT');return base;}
  if(![SPL_TOKEN,TOKEN_2022].includes(value.owner)){
    base.flags.push('UNKNOWN_ACCOUNT_OWNER');return base;
  }
  if(value.executable){base.flags.push('MINT_ACCOUNT_EXECUTABLE');return base;}
  if(value.data?.parsed?.type!=='mint'||!value.data?.parsed?.info){
    base.flags.push('MINT_NOT_PARSED');return base;
  }
  const info=value.data.parsed.info;
  if(info.isInitialized!==true||!Number.isInteger(info.decimals)||info.decimals<0||info.decimals>18){
    base.flags.push('INVALID_MINT_METADATA');return base;
  }
  if(info.mintAuthority!=null)base.flags.push('MINT_AUTHORITY_ACTIVE');
  if(info.freezeAuthority!=null)base.flags.push('FREEZE_AUTHORITY_ACTIVE');
  if(value.owner===TOKEN_2022){
    const extensions=value.data.parsed?.info?.extensions || value.data.parsed?.extensions;
    if(extensions?.length || !Array.isArray(extensions)){
      base.flags.push('TOKEN_2022_EXTENSIONS_UNREVIEWED');
    }
  }
  if(base.flags.includes('MINT_AUTHORITY_ACTIVE')||base.flags.includes('FREEZE_AUTHORITY_ACTIVE')){
    base.riskStatus='MINT_CONTROL_RISK';
  }else if(base.flags.includes('TOKEN_2022_EXTENSIONS_UNREVIEWED')){
    base.riskStatus='TOKEN_2022_REVIEW_REQUIRED';
    base.notes.push('Token-2022 extension details must be independently checked; not evidence of malicious controls.');
  }else{
    base.riskStatus='MINT_CONTROLS_REVOKED';
    base.notes.push('Authority checks only: sell restrictions, liquidity ownership, holders and admin roles NOT VERIFIED.');
  }
  base.decimals=info.decimals;
  return base;
}
// Private endpoint URL is supplied at runtime; never store API key in public repo.
// This is a helper only: no automatic provider access without an explicit secret.
export async function checkSolanaMint({mint,rpcEndpoint,fetcher=fetch}){
  if(!rpcEndpoint||!/^https:\/\//.test(rpcEndpoint))throw Error('No secure Solana RPC configured');
  const response=await fetcher(rpcEndpoint,{
    method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({jsonrpc:'2.0',id:1,method:'getAccountInfo',
      params:[mint,{encoding:'jsonParsed',commitment:'confirmed'}]})
  });
  if(!response.ok)throw Error('Solana RPC HTTP '+response.status);
  return assessMintAccount(mint,await response.json());
}
