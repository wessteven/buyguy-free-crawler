// Independent price refresh of known assets and any open paper positions.
// Token identity is exact. Never infer same-ticker equivalence or executable liquidity.
const root='https://api.dexscreener.com/tokens/v1/';
const evm=/^0x[0-9a-fA-F]{40}$/,sol=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const n=v=>{const x=Number(v);return Number.isFinite(x)?x:0};
const identity=(chain,addr)=>chain+':'+(chain==='robinhood'?addr.toLowerCase():addr);
export function parseQuoteRefresh(pairs,tracked){
  if(!Array.isArray(pairs))throw Error('DEX quote list malformed');
  const requested=new Map(tracked.map(t=>[identity(t.chain,t.address),t]));
  const result=new Map();
  for(const p of pairs){
    const chain=p?.chainId,addr=p?.baseToken?.address;
    if(!['solana','robinhood'].includes(chain)||typeof addr!=='string')continue;
    const id=identity(chain,addr),old=requested.get(id);
    if(!old||!p.pairAddress)continue;
    const price=n(p.priceUsd),liq=n(p.liquidity?.usd);
    if(!(price>0&&liq>0))continue;
    const matchedPool=(p.pairAddress===old.pool);
    // Exact known pool is preferred; never silently relabel existing paper holdings.
    if(old.has_position && !matchedPool)continue;
    const prior=result.get(id);
    if(prior&&(prior.matchedPool&&!matchedPool || prior.matchedPool===matchedPool&&prior.liquidity>=liq))continue;
    const cap=n(p.marketCap||p.fdv),buys=n(p.txns?.m5?.buys),sells=n(p.txns?.m5?.sells);
    const change=n(p.priceChange?.h1),volume=n(p.volume?.h24);
    let score=(liq>=50000?24:0)+(cap>=50000&&cap<=100000?17:cap>100000&&cap<=250000?9:0);
    if(buys+sells>=12)score+=10;
    if(buys+sells>=35)score+=5;
    if(buys>=8&&buys>=1.25*Math.max(1,sells))score+=13;
    if(volume>=10000)score+=5;
    if(change>=4&&change<=70)score+=5;
    if(sells>buys)score-=15;
    if(change>200)score-=20;
    score=Math.min(100,Math.max(0,score));
    let created=null;
    if(Number.isFinite(p.pairCreatedAt) && p.pairCreatedAt>0){
      created=new Date(p.pairCreatedAt).toISOString();
    }
    result.set(id,{asset_key:id,chain,address:addr,symbol:p.baseToken.symbol||old.symbol,
      pool:p.pairAddress,matchedPool,price,liquidity:liq,market_cap:cap,
      buys_m5:Math.round(buys),sells_m5:Math.round(sells),tx_m5:Math.round(buys+sells),
      change_h1:change,volume_h24:volume,pool_created:created,
      score,status:(score>=62&&liq>=50000)?'ALIVE':'STATIC'});
  }
  return [...result.values()];
}
export async function refreshKnownQuotes(env,{fetcher=fetch,now=new Date().toISOString(),limit=20}={}){
  if(!env?.DB)throw Error('Missing D1 DB');
  const tracked=(await env.DB.prepare(`SELECT a.asset_key,a.chain,a.address,a.symbol,a.pool,
    CASE WHEN EXISTS (SELECT 1 FROM paper_positions p WHERE p.asset_key=a.asset_key
    AND p.status='OPEN') THEN 1 ELSE 0 END AS has_position
    FROM assets a WHERE a.status IN ('ALIVE','STATIC') OR a.pinned=1
    OR EXISTS (SELECT 1 FROM paper_positions p WHERE p.asset_key=a.asset_key AND p.status='OPEN')
    ORDER BY has_position DESC,a.pinned DESC,a.score DESC LIMIT ?`)
    .bind(Math.max(1,Math.min(25,limit))).all()).results||[];
  const accepted=[],failures=[];
  for(const chain of ['solana','robinhood']){
    const items=tracked.filter(t=>t.chain===chain&&
      (chain==='solana'?sol.test(t.address):evm.test(t.address)));
    if(!items.length)continue;
    try{
      const url=root+chain+'/'+items.map(x=>x.address).join(',');
      const response=await fetcher(url,{headers:{accept:'application/json'}});
      if(!response.ok)throw Error('DEX refresh HTTP '+response.status);
      accepted.push(...parseQuoteRefresh(await response.json(),items));
    }catch(e){
      failures.push(chain+': '+String(e?.message||'UnknownError').slice(0,70));
    }
  }
  if(accepted.length){
    const stmts=[];
    for(const q of accepted){
      stmts.push(env.DB.prepare(`UPDATE assets SET symbol=?,pool=?,provider='DEX Screener',
        updated_at=?,last_seen=?,pool_created=COALESCE(pool_created,?),
        price=?,liquidity=?,market_cap=?,buys_m5=?,sells_m5=?,tx_m5=?,change_h1=?,volume_h24=?,
        score=?,status=?,observations=observations+1,misses=0
        WHERE asset_key=? AND status!='TRASH'`)
        .bind(q.symbol,q.pool,now,now,q.pool_created,q.price,q.liquidity,q.market_cap,
          q.buys_m5,q.sells_m5,q.tx_m5,q.change_h1,q.volume_h24,q.score,q.status,q.asset_key));
      stmts.push(env.DB.prepare(`INSERT OR IGNORE INTO observations
        (asset_key,seen_at,pool,provider,price,liquidity,buys_m5,sells_m5,score)
        VALUES(?,?,?,'DEX Screener',?,?,?,?,?)`)
        .bind(q.asset_key,now,q.pool,q.price,q.liquidity,q.buys_m5,q.sells_m5,q.score));
    }
    await env.DB.batch(stmts);
  }
  return {tracked:tracked.length,refreshed:accepted.length,failedProviders:failures};
}
