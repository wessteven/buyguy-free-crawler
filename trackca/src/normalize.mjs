export const finite=v=>(v===null||v===undefined||v===''||!Number.isFinite(Number(v)))?null:Number(v);
export const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.toLowerCase()===b.toLowerCase();
export function isPairForAsset(p,a){return !!(p&&a.address&&same(p.chainId,a.chain)&&(same(p.baseToken?.address,a.address)||same(p.quoteToken?.address,a.address)))}
export function validPools(pairs,asset,limit=4){
 if(!Array.isArray(pairs))return [];
 const uniq=new Map();
 for(const p of pairs)if(isPairForAsset(p,asset)&&typeof p.pairAddress==='string'&&/^[a-z0-9]{20,}$/i.test(p.pairAddress))uniq.set(p.pairAddress.toLowerCase(),p);
 return [...uniq.values()].sort((a,b)=>{
  if(asset.pool&&same(a.pairAddress,asset.pool))return -1;
  if(asset.pool&&same(b.pairAddress,asset.pool))return 1;
  return (finite(b.liquidity?.usd)||0)-(finite(a.liquidity?.usd)||0);
 }).slice(0,limit);
}
export function pairRow(p,a,ts,runId){
 const v=p.volume||{},t=p.txns||{},c=p.priceChange||{};
 return [runId,a.id,a.chain,a.address,p.pairAddress,p.dexId||'',ts,finite(p.priceUsd),finite(p.liquidity?.usd),
 finite(v.m5),finite(v.h1),finite(v.h24),finite(t.m5?.buys),finite(t.m5?.sells),finite(t.h1?.buys),finite(t.h1?.sells),
 finite(t.h24?.buys),finite(t.h24?.sells),finite(c.m5),finite(c.h1),finite(c.h24),'dexscreener','observation_time_only'];
}
export function normalizeCandles(j,a,pool){
 const arr=j?.data?.attributes?.ohlcv_list;
 if(!Array.isArray(arr))throw Error('MIHAO OHLCV not present');
 const base=j?.meta?.base?.address,quote=j?.meta?.quote?.address;
 if(base&&quote&&!same(base,a.address)&&!same(quote,a.address))throw Error('MIHAO pool address does not contain exact mint');
 return arr.filter(x=>Array.isArray(x)&&x.length>=6&&x.slice(0,6).every(v=>finite(v)!==null))
 .map(x=>[a.id,a.chain,pool,Math.trunc(Number(x[0])),...x.slice(1,6).map(Number),'geckoterminal']);
}
export function coverage(a,pools,holder,transfer,error){
 return {id:a.id,address:a.address,identity:a.address?'ADDRESS_KNOWN':'AMBIGUOUS',
 market:pools.length?'PROVIDER_SNAPSHOT':'UNAVAILABLE',
 five_min:pools.length?'AGGREGATE_5M':'UNAVAILABLE',
 hour:pools.length?'AGGREGATE_1H':'UNAVAILABLE',
 day:pools.length?'AGGREGATE_24H':'UNAVAILABLE',
 unique_buyers:'UNVERIFIED',wallets:'UNVERIFIED',whales:'UNVERIFIED',executable_depth:'UNVERIFIED',
 holder,transfer,note:error||a.reason||(pools.length?'Trade counts not unique buyers; depth unverified':'No matching exact-address pool')};
}
