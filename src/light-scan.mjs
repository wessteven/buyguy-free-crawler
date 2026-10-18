// Lightweight Cloudflare Free cron discovery. Never places paper or real trades.
// Official GeckoTerminal new-pool data; source and timestamps remain explicit.
export const FEED='https://api.geckoterminal.com/api/v2/networks/solana/new_pools?include=base_token&page=1';
const mintRE=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const number=x=>{const n=Number(x);return Number.isFinite(n)?n:0};
const iso=()=>new Date().toISOString();
export function parseNewPools(data,limit=8){
  if(!Array.isArray(data?.data))throw new Error('GeckoTerminal returned an invalid pool list');
  const map=new Map((data.included||[]).filter(x=>x.type==='token').map(x=>[x.id,x.attributes||{}]));
  const seen=new Set(), candidates=[];
  for(const pool of data.data){
    const at=pool.attributes||{};
    const id=pool.relationships?.base_token?.data?.id||'';
    const token=map.get(id)||{};
    const address=token.address||(id.startsWith('solana_')?id.slice(7):'');
    const price=number(at.base_token_price_usd), liq=number(at.reserve_in_usd);
    const poolAddress=at.address;
    if(!mintRE.test(address)||!poolAddress||!Number.isFinite(price)||price<=0||liq<15000||seen.has(address))continue;
    const tx=at.transactions?.m5||{}, buys=number(tx.buys), sells=number(tx.sells);
    const cap=number(at.market_cap_usd||at.fdv_usd),volume=number(at.volume_usd?.h24);
    const change=number(at.price_change_percentage?.h1);
    let score=(liq>=50000?24:0)+(cap>=50000&&cap<=100000?17:cap>100000&&cap<=250000?9:0);
    if((buys+sells)>=12)score+=10;
    if(buys>=8&&buys>=1.25*Math.max(1,sells))score+=13;
    if(volume>=10000)score+=5;
    if(change>=4&&change<=70)score+=5;
    if(sells>buys)score-=15;
    score=Math.max(0,Math.min(100,score));
    seen.add(address);
    candidates.push({asset_key:'solana:'+address,chain:'solana',address,
      symbol:token.symbol||at.name?.split('/')[0]?.trim()||'?',
      pool:poolAddress,price,liquidity:liq,market_cap:cap,
      buys_m5:Math.round(buys),sells_m5:Math.round(sells),tx_m5:Math.round(buys+sells),
      change_h1:change,volume_h24:volume,score,pool_created:at.pool_created_at||null,
      source:'GeckoTerminal'});
  }
  return candidates.sort((a,b)=>b.score-a.score||b.liquidity-a.liquidity).slice(0,limit);
}
export async function cronScan(env,fetcher=fetch){
  if(!env.DB)throw new Error('D1 binding is unavailable');
  const stamp=iso();
  try{
    const response=await fetcher(FEED,{headers:{accept:'application/json'}});
    if(!response.ok)throw new Error('GeckoTerminal HTTP '+response.status);
    const pools=parseNewPools(await response.json());
    const statements=[];
    for(const a of pools){
      statements.push(env.DB.prepare(`INSERT OR IGNORE INTO assets
        (asset_key,chain,address,symbol,pool,provider,status,risk_status,first_seen,updated_at,pool_created,
        score,price,liquidity,market_cap,buys_m5,sells_m5,tx_m5,change_h1,volume_h24,last_seen,last_action)
        VALUES(?,?,?,?,?,?,'STATIC','UNVERIFIED',?,?,?,?,?,?,?,?,?,?,?,?,?
        'WATCH_ONLY — public market data, not contract certified')`)
        .bind(a.asset_key,a.chain,a.address,a.symbol,a.pool,a.source,stamp,stamp,a.pool_created,
        a.score,a.price,a.liquidity,a.market_cap,a.buys_m5,a.sells_m5,a.tx_m5,a.change_h1,a.volume_h24,stamp));
      statements.push(env.DB.prepare(`UPDATE assets SET
        symbol=?,pool=?,provider=?,updated_at=?,last_seen=?,pool_created=COALESCE(pool_created,?),
        score=?,price=?,liquidity=?,market_cap=?,buys_m5=?,sells_m5=?,tx_m5=?,change_h1=?,volume_h24=?,
        observations=observations+1,misses=0
        WHERE asset_key=? AND status!='TRASH' AND updated_at<=?`)
        .bind(a.symbol,a.pool,a.source,stamp,stamp,a.pool_created,a.score,a.price,a.liquidity,a.market_cap,
        a.buys_m5,a.sells_m5,a.tx_m5,a.change_h1,a.volume_h24,a.asset_key,stamp));
      statements.push(env.DB.prepare(`INSERT OR IGNORE INTO observations
        (asset_key,seen_at,pool,provider,price,liquidity,buys_m5,sells_m5,score)
        SELECT ?,?,?,?,?,?,?,?,? WHERE EXISTS
        (SELECT 1 FROM assets WHERE asset_key=? AND status!='TRASH')`)
        .bind(a.asset_key,stamp,a.pool,a.source,a.price,a.liquidity,a.buys_m5,a.sells_m5,
        a.score,a.asset_key));
    }
    statements.push(env.DB.prepare(`INSERT INTO runs
      (started_at,completed_at,state,discovered,observed,provider_errors)
      VALUES(?,?,'SUCCESS',?,?,'[]')`).bind(stamp,iso(),pools.length,pools.length));
    await env.DB.batch(statements);
    console.log('BuyGuy Cloudflare light scan:',pools.length,'new-pool observations');
    return pools.length;
  }catch(error){
    const message=String(error).slice(0,250);
    console.error('BuyGuy Cloudflare light scan failed:',message);
    try{
      await env.DB.prepare(`INSERT INTO runs
        (started_at,completed_at,state,discovered,observed,provider_errors)
        VALUES(?,?,'ERROR',0,0,?)`).bind(stamp,iso(),JSON.stringify([message])).run();
    }catch(e){console.error('Unable to record scan failure:',String(e).slice(0,150))}
    throw error;
  }
}
