// No API keys and no trade execution. DEX Screener public aggregate quotes are
// indicative pool prices, not venue quotes, transaction execution or verified routes.
const ADDR=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
export const MARKET_BOUNDS=Object.freeze({
  maxSignalMints:8,maxControlMints:4,maxTokenQuery:12,
  maxResponseBytes:450000,maxPairsToInspect:1500,
  backoff429Ms:30*60000,backoffErrorMs:5*60000,
  maxOutcomePairs:20,requestTimeoutMs:6500
});
const pos=x=>x!==null&&x!==undefined&&x!==''&&Number.isFinite(Number(x))&&Number(x)>0?Number(x):null;
const nonnegative=x=>x!==null&&x!==undefined&&x!==''&&Number.isFinite(Number(x))&&Number(x)>=0?Number(x):null;
export function selectMarketResearchMints(windows){
  if(!Array.isArray(windows))return [];
  const signal=windows.filter(x=>x.sampleKind==='POTENTIAL_SIGNAL'&&ADDR.test(x.mint||''))
    .slice(0,MARKET_BOUNDS.maxSignalMints);
  const controls=windows.filter(x=>x.sampleKind==='CONTROL'&&ADDR.test(x.mint||''))
    .slice(0,MARKET_BOUNDS.maxControlMints);
  return [...new Set([...signal,...controls].map(x=>x.mint))]
    .slice(0,MARKET_BOUNDS.maxTokenQuery);
}
const pairValid=p=>p?.chainId==='solana'&&ADDR.test(p.pairAddress||'')&&
  ADDR.test(p.baseToken?.address||'')&&pos(p.priceUsd)!==null;
export function chooseMarketPairs(payload,mints,receivedAt){
  if(!Array.isArray(payload)||payload.length>MARKET_BOUNDS.maxPairsToInspect)
    throw Error('DEX_MARKET_RESPONSE_SHAPE');
  const requested=new Set(mints.filter(x=>ADDR.test(x||'')));
  const best=new Map();
  for(const pair of payload){
    if(!pairValid(pair)||!requested.has(pair.baseToken.address))continue;
    const q={mint:pair.baseToken.address,pool:pair.pairAddress,
      quoteReceivedAt:receivedAt,priceUsd:pos(pair.priceUsd),
      liquidityUsd:nonnegative(pair.liquidity?.usd),marketCapUsd:nonnegative(pair.marketCap),
      volume5mUsd:nonnegative(pair.volume?.m5),buys5m:nonnegative(pair.txns?.m5?.buys),
      sells5m:nonnegative(pair.txns?.m5?.sells),dexId:typeof pair.dexId==='string'?pair.dexId.slice(0,60):null,
      provider:'DEX_SCREENER_PUBLIC_AGGREGATE',sourceAge:'RECEIPT_TIME_ONLY',
      routeProof:false,executionQuote:false};
    const old=best.get(q.mint);
    if(!old||((q.liquidityUsd??-1)>(old.liquidityUsd??-1))||
      ((q.liquidityUsd??-1)===(old.liquidityUsd??-1)&&q.pool<old.pool))best.set(q.mint,q);
  }
  return [...best.values()].sort((a,b)=>a.mint.localeCompare(b.mint));
}
export function chooseExactPoolOutcomes(payload,requestedPools,receivedAt){
  if(!Array.isArray(payload)||payload.length>MARKET_BOUNDS.maxPairsToInspect)
    throw Error('DEX_OUTCOME_RESPONSE_SHAPE');
  const needed=new Set(requestedPools.filter(x=>ADDR.test(x||'')));
  const found=new Map();
  for(const pair of payload){
    if(!pairValid(pair)||!needed.has(pair.pairAddress))continue;
    found.set(pair.pairAddress,{pool:pair.pairAddress,mint:pair.baseToken.address,
      priceUsd:pos(pair.priceUsd),quoteReceivedAt:receivedAt,
      liquidityUsd:nonnegative(pair.liquidity?.usd),
      provider:'DEX_SCREENER_PUBLIC_AGGREGATE',executionQuote:false});
  }
  return found;
}
export async function readBoundedJson(response,maxBytes=MARKET_BOUNDS.maxResponseBytes){
  const reported=response.headers.get('content-length');
  if(reported!==null&&Number(reported)>maxBytes)throw Error('DEX_RESPONSE_TOO_LARGE');
  if(!response.body)throw Error('DEX_RESPONSE_EMPTY');
  const reader=response.body.getReader();let bytes=0;const chunks=[];
  try{
    while(true){
      const part=await reader.read();if(part.done)break;
      bytes+=part.value.byteLength;
      if(bytes>maxBytes){await reader.cancel();throw Error('DEX_RESPONSE_TOO_LARGE');}
      chunks.push(part.value);
    }
  }finally{reader.releaseLock();}
  const data=new Uint8Array(bytes);let offset=0;
  for(const x of chunks){data.set(x,offset);offset+=x.length;}
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(data));
}
