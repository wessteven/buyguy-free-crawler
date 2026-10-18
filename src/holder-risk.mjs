// Solana token-account concentration screen. It is NOT owner/wallet distribution:
// top token accounts may be AMM pool vaults, escrow or custodians.
const base58=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
export function assessLargestAccounts(mint,rawSupply,reply){
  const result={source:'Solana getTokenLargestAccounts',mint,status:'UNVERIFIED',
    checkedAt:new Date().toISOString(),flags:[],top1Bps:null,top5Bps:null,top20Bps:null,
    accountsReported:0,notes:['Token accounts are not unique holder wallets; AMM vaults may appear in the largest accounts. LP locks and sell executability NOT verified.']};
  if(!base58.test(mint||'')){result.flags.push('MINT_INVALID');return result}
  let supply;
  try{supply=BigInt(rawSupply)}catch{supply=0n}
  if(supply<=0n){result.flags.push('SUPPLY_UNKNOWN');return result}
  if(reply?.error||!Array.isArray(reply?.result?.value)){
    result.flags.push('TOP_ACCOUNTS_UNAVAILABLE');return result;
  }
  const accounts=reply.result.value;
  if(accounts.length===0){result.flags.push('NO_TOKEN_ACCOUNTS');return result}
  if(accounts.length>20){result.flags.push('MALFORMED_TOP_ACCOUNTS');return result}
  const amounts=[];
  for(const a of accounts){
    if(!base58.test(a?.address||'')){result.flags.push('ACCOUNT_ADDRESS_INVALID');return result}
    let amount;
    try{amount=BigInt(a?.amount)}catch{result.flags.push('ACCOUNT_BALANCE_MALFORMED');return result}
    if(amount<0n||amount>supply){result.flags.push('ACCOUNT_BALANCE_INVALID');return result}
    amounts.push(amount)
  }
  amounts.sort((a,b)=>a>b?-1:a<b?1:0);
  const bps=qty=>Number((qty*10000n)/supply);
  const sum=n=>amounts.slice(0,n).reduce((total,x)=>total+x,0n);
  if(sum(20)>supply){result.flags.push('TOTAL_EXCEEDS_SUPPLY');return result}
  result.top1Bps=bps(sum(1));result.top5Bps=bps(sum(5));result.top20Bps=bps(sum(20));
  result.accountsReported=accounts.length;
  if(result.top1Bps>4000)result.flags.push('TOP_ACCOUNT_OVER_40_PERCENT');
  if(result.top5Bps>8500)result.flags.push('TOP_FIVE_ACCOUNTS_OVER_85_PERCENT');
  result.status=result.flags.length?'CONCENTRATION_WARNING':'TOKEN_ACCOUNT_BALANCES_SCREENED';
  return result;
}
export async function fetchLargestAccounts({mint,rpcEndpoint,fetcher=fetch}){
  if(!base58.test(mint||''))throw Error('Invalid token mint');
  if(!/^https:\/\//.test(rpcEndpoint||''))throw Error('RPC URL absent');
  const payload={jsonrpc:'2.0',id:1,method:'getTokenLargestAccounts',params:[mint,{commitment:'confirmed'}]};
  const response=await fetcher(rpcEndpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
  if(!response.ok)throw Error('Solana RPC top accounts HTTP '+response.status);
  return response.json();
}
