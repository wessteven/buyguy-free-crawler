import {selectRefreshTargets} from './token-tiers.mjs';
import {collectSocialLinks} from './social-links.mjs';
// Independent price refresh of known assets and any open paper positions.
// Token identity is exact. Never infer same-ticker equivalence or executable liquidity.
const root='https://api.dexscreener.com/tokens/v1/';
const evm=/^0x[0-9a-fA-F]{40}$/,sol=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const n=v=>{const x=Number(v);return Number.isFinite(x)?x:0};
const identity=(chain,addr)=>chain+':'+(chain==='robinhood'?addr.toLowerCase():addr);
export function parseQuoteRefresh(pairs,tracked,nowMs=Date.now()){
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
    let created=null;
    if(Number.isFinite(p.pairCreatedAt) && p.pairCreatedAt>0){
      const dt=new Date(p.pairCreatedAt);
      if(Number.isFinite(dt.getTime()))created=dt.toISOString();
    }
    if(!created && old.pool_created && Number.isFinite(Date.parse(old.pool_created))){
      created=old.pool_created;
    }
    if(created){
      const age=nowMs-Date.parse(created);
      if(age>=0 && age<=24*3600000)score+=18;
    }
    score=Math.min(100,Math.max(0,score));
    result.set(id,{asset_key:id,chain,address:addr,symbol:p.baseToken.symbol||old.symbol,
      pool:p.pairAddress,matchedPool,price,liquidity:liq,market_cap:cap,
      buys_m5:Math.round(buys),sells_m5:Math.round(sells),tx_m5:Math.round(buys+sells),
      change_h1:change,volume_h24:volume,pool_created:created,
      score,status:(old.status==='DEAD'&&
       !(score>=60&&liq>=50000&&buys>=8&&buys+sells>=12&&
        buys>=1.2*Math.max(1,sells)&&change>-15&&
        !['MINT_CONTROL_RISK','HOLDER_CONCENTRATION_RISK'].includes(old.risk_status)))?
         'DEAD':((score>=62&&liq>=50000)?'ALIVE':'STATIC'),
      socials:collectSocialLinks(p.info)});
  }
  return [...result.values()];
}
export async function refreshKnownQuotes(env,{fetcher=fetch,now=new Date().toISOString(),limit=20}={}){
  if(!env?.DB)throw Error('Missing D1 DB');
  const max=Math.max(1,Math.min(25,limit));
  const fields="a.asset_key,a.chain,a.address,a.symbol,a.pool,a.pool_created,"+
    "a.status,a.risk_status,a.score,a.price,a.liquidity,a.buys_m5,a.sells_m5,"+
    "a.change_h1,a.last_seen,a.pinned,"+
    "CASE WHEN EXISTS (SELECT 1 FROM paper_positions p WHERE p.asset_key=a.asset_key "+
    "AND p.status='OPEN') THEN 1 ELSE 0 END AS has_position";
  // Pull the full retained research universe, including dormant DEAD tokens.
  // HOT, pinned and background NOT queues each receive fair rotating slots.
  const all=(await env.DB.prepare("SELECT "+fields+" FROM assets a "+
    "WHERE a.status!='TRASH' AND "+
    "(a.status IN ('ALIVE','STATIC','DEAD') OR a.pinned=1 OR "+
    "EXISTS (SELECT 1 FROM paper_positions p WHERE p.asset_key=a.asset_key AND p.status='OPEN')) "+
    "ORDER BY a.asset_key LIMIT ?").bind(500).all()).results||[];
  const tracked=selectRefreshTargets(all,{now,limit:max});
  const accepted=[],failures=[];
  for(const chain of ['solana','robinhood']){
    const items=tracked.filter(t=>t.chain===chain&&
      (chain==='solana'?sol.test(t.address):evm.test(t.address)));
    if(!items.length)continue;
    try{
      const url=root+chain+'/'+items.map(x=>x.address).join(',');
      const response=await fetcher(url,{headers:{accept:'application/json'}});
      if(!response.ok)throw Error('DEX refresh HTTP '+response.status);
      accepted.push(...parseQuoteRefresh(await response.json(),items,Date.parse(now)));
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
        score=?,status=?,observations=observations+1,misses=0,
        last_action=CASE WHEN status='DEAD' AND ?!='DEAD'
          THEN 'REACTIVATED: fresh verified buyer momentum' ELSE last_action END
        WHERE asset_key=? AND status!='TRASH'`)
        .bind(q.symbol,q.pool,now,now,q.pool_created,q.price,q.liquidity,q.market_cap,
          q.buys_m5,q.sells_m5,q.tx_m5,q.change_h1,q.volume_h24,q.score,q.status,q.status,q.asset_key));
      stmts.push(env.DB.prepare(`INSERT OR IGNORE INTO observations
        (asset_key,seen_at,pool,provider,price,liquidity,buys_m5,sells_m5,score)
        VALUES(?,?,?,'DEX Screener',?,?,?,?,?)`)
        .bind(q.asset_key,now,q.pool,q.price,q.liquidity,q.buys_m5,q.sells_m5,q.score));
      if(q.socials.length){
        const socials=JSON.stringify(q.socials);
        stmts.push(env.DB.prepare(`INSERT INTO research_events(at,asset_key,kind,note)
          SELECT ?,?,'TOKEN_SOCIALS',?
          WHERE COALESCE((SELECT note FROM research_events
            WHERE asset_key=? AND kind='TOKEN_SOCIALS' ORDER BY id DESC LIMIT 1),'') != ?`)
          .bind(now,q.asset_key,socials,q.asset_key,socials));
      }
    }
    await env.DB.batch(stmts);
  }
  return {tracked:tracked.length,eligible:all.length,refreshed:accepted.length,failedProviders:failures};
}
