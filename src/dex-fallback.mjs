// Public DEX Screener discovery, only used when GeckoTerminal is unavailable.
// Never claims a promotion feed is organic momentum or that a pool is safe.
const base='https://api.dexscreener.com';
const base58=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0;};
export const PROFILES=base+'/token-profiles/latest/v1';

export function parseDexQuotes(rows, limit=8){
  if(!Array.isArray(rows))throw Error('Invalid DEX Screener token list');
  const byKey=new Map();
  for(const x of rows){
    const address=x?.baseToken?.address,chain=x?.chainId;
    const price=num(x?.priceUsd),liq=num(x?.liquidity?.usd);
    if(chain!=='solana'||!base58.test(address||'')||!(price>0)||liq<15000||!x.pairAddress)continue;
    const buys=num(x.txns?.m5?.buys),sells=num(x.txns?.m5?.sells);
    const cap=num(x.marketCap||x.fdv),change=num(x.priceChange?.h1),volume=num(x.volume?.h24);
    let score=(liq>=50000?24:0)+(cap>=50000&&cap<=100000?17:cap>100000&&cap<=250000?9:0);
    if(buys+sells>=12)score+=10;
    if(buys>=8&&buys>=1.25*Math.max(1,sells))score+=13;
    if(volume>=10000)score+=5;
    if(change>=4&&change<=70)score+=5;
    if(sells>buys)score-=15;
    const candidate={asset_key:'solana:'+address,chain:'solana',address,
      symbol:x.baseToken.symbol||'?',pool:x.pairAddress,price,liquidity:liq,
      market_cap:cap,buys_m5:Math.round(buys),sells_m5:Math.round(sells),
      tx_m5:Math.round(buys+sells),change_h1:change,volume_h24:volume,
      pool_created:x.pairCreatedAt?new Date(x.pairCreatedAt).toISOString():null,
      score:Math.max(0,Math.min(100,score)),source:'DEX Screener'};
    if(!byKey.has(address)||byKey.get(address).liquidity<liq)byKey.set(address,candidate);
  }
  return [...byKey.values()].sort((a,b)=>b.score-a.score||b.liquidity-a.liquidity).slice(0,limit);
}
export async function dexFallback(fetcher=fetch){
  const r=await fetcher(PROFILES,{headers:{accept:'application/json'}});
  if(!r.ok)throw Error('DEX Screener profiles HTTP '+r.status);
  const data=await r.json();
  if(!Array.isArray(data))throw Error('DEX Screener profiles malformed');
  const addresses=[...new Set(data.filter(x=>x.chainId==='solana'&&base58.test(x.tokenAddress||'')).map(x=>x.tokenAddress))].slice(0,15);
  if(!addresses.length)return [];
  const result=await fetcher(base+'/tokens/v1/solana/'+addresses.join(','),{headers:{accept:'application/json'}});
  if(!result.ok)throw Error('DEX Screener quotes HTTP '+result.status);
  return parseDexQuotes(await result.json());
}
