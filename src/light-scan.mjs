import {collectSocialLinks} from './social-links.mjs';
import {dexFallback} from './dex-fallback.mjs';
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
      source:'GeckoTerminal',socials:collectSocialLinks(token,at)});
  }
  return candidates.sort((a,b)=>b.score-a.score||b.liquidity-a.liquidity).slice(0,limit);
}
// Shared provider cooldowns use the existing D1 leases table, no migration.
// They are advisory: inability to read/write a lease must not suppress research.
export const PROVIDER_COOLDOWN_MS=30*60*1000;
async function cooldownRemaining(db,provider,now){
  try{
    const stmt=db.prepare('SELECT expires_at FROM leases WHERE name=?').bind('discovery-provider:'+provider);
    if(typeof stmt.first!=='function')return 0; // lightweight test doubles
    const row=await stmt.first();
    return Math.max(0,Number(row?.expires_at||0)-now);
  }catch(error){
    console.warn('Discovery provider cooldown lookup unavailable:',provider,error?.name||'Error');
    return 0;
  }
}
async function markProviderLimited(db,provider,now){
  try{
    const stmt=db.prepare("INSERT INTO leases(name,expires_at,token) VALUES(?,?,?) ON CONFLICT(name) DO UPDATE SET expires_at=MAX(leases.expires_at,excluded.expires_at),token=excluded.token")
      .bind('discovery-provider:'+provider,now+PROVIDER_COOLDOWN_MS,'HTTP_429');
    await stmt.run();
  }catch(error){
    console.warn('Discovery provider cooldown persistence unavailable:',provider,error?.name||'Error');
  }
}
export async function cronScan(env,fetcher=fetch){
  if(!env.DB)throw new Error('D1 binding is unavailable');
  const stamp=iso();
  try{
    let pools=[],warnings=[];
    const now=Date.parse(stamp);
    const geckoWait=await cooldownRemaining(env.DB,'gecko',now);
    if(geckoWait>0){
      warnings.push('GeckoTerminal cooldown '+Math.ceil(geckoWait/1000)+'s');
    }else{
      try{
        const response=await fetcher(FEED,{headers:{accept:'application/json'}});
        if(!response.ok)throw new Error('GeckoTerminal HTTP '+response.status);
        pools=parseNewPools(await response.json());
      }catch(error){
        const message=String(error).slice(0,120);
        warnings.push(message);
        if(/GeckoTerminal HTTP 429/.test(message))await markProviderLimited(env.DB,'gecko',now);
      }
    }
    if(warnings.length){
      const dexWait=await cooldownRemaining(env.DB,'dex',now);
      if(dexWait>0){
        warnings.push('DEX Screener cooldown '+Math.ceil(dexWait/1000)+'s');
        throw Error('DISCOVERY_PROVIDERS_COOLDOWN');
      }
      try{
        pools=await dexFallback(fetcher);
      }catch(error){
        const message=String(error).slice(0,120);
        if(/DEX Screener (profiles|quotes) HTTP 429/.test(message))
          await markProviderLimited(env.DB,'dex',now);
        throw error;
      }
    }
    const statements=[];
    for(const a of pools){
      const revival=Number(a.score)>=60&&Number(a.liquidity)>=50000&&
        Number(a.buys_m5)>=8&&Number(a.tx_m5)>=12&&
        a.buys_m5>=1.2*Math.max(1,a.sells_m5)&&Number(a.change_h1)>-15?1:0;
      statements.push(env.DB.prepare(`INSERT OR IGNORE INTO assets
        (asset_key,chain,address,symbol,pool,provider,status,risk_status,first_seen,updated_at,pool_created,
        score,price,liquidity,market_cap,buys_m5,sells_m5,tx_m5,change_h1,volume_h24,last_seen,last_action)
        VALUES(?,?,?,?,?,?,'STATIC','UNVERIFIED',?,?,?,?,?,?,?,?,?,?,?,?,?,
        'WATCH_ONLY — public market data, not contract certified')`)
        .bind(a.asset_key,a.chain,a.address,a.symbol,a.pool,a.source,stamp,stamp,a.pool_created,
        a.score,a.price,a.liquidity,a.market_cap,a.buys_m5,a.sells_m5,a.tx_m5,a.change_h1,a.volume_h24,stamp));
      statements.push(env.DB.prepare(`UPDATE assets SET
        symbol=?,pool=?,provider=?,updated_at=?,last_seen=?,pool_created=COALESCE(pool_created,?),
        score=?,price=?,liquidity=?,market_cap=?,buys_m5=?,sells_m5=?,tx_m5=?,change_h1=?,volume_h24=?,
        observations=observations+1,misses=0,
        status=CASE WHEN status='DEAD' AND ?=1 AND risk_status NOT IN ('MINT_CONTROL_RISK','HOLDER_CONCENTRATION_RISK') THEN 'ALIVE' ELSE status END,
        last_action=CASE WHEN status='DEAD' AND ?=1 AND risk_status NOT IN ('MINT_CONTROL_RISK','HOLDER_CONCENTRATION_RISK') THEN 'REACTIVATED: fresh verified buyer momentum' ELSE last_action END
        WHERE asset_key=? AND status!='TRASH' AND updated_at<=?`)
        .bind(a.symbol,a.pool,a.source,stamp,stamp,a.pool_created,a.score,a.price,a.liquidity,a.market_cap,
        a.buys_m5,a.sells_m5,a.tx_m5,a.change_h1,a.volume_h24,revival,revival,a.asset_key,stamp));
      statements.push(env.DB.prepare(`INSERT OR IGNORE INTO observations
        (asset_key,seen_at,pool,provider,price,liquidity,buys_m5,sells_m5,score)
        SELECT ?,?,?,?,?,?,?,?,? WHERE EXISTS
        (SELECT 1 FROM assets WHERE asset_key=? AND status!='TRASH')`)
        .bind(a.asset_key,stamp,a.pool,a.source,a.price,a.liquidity,a.buys_m5,a.sells_m5,
        a.score,a.asset_key));
      if(a.socials?.length){
        const socials=JSON.stringify(a.socials);
        statements.push(env.DB.prepare(`INSERT INTO research_events(at,asset_key,kind,note)
          SELECT ?,?,'TOKEN_SOCIALS',?
          WHERE EXISTS (SELECT 1 FROM assets WHERE asset_key=? AND status!='TRASH')
          AND COALESCE((SELECT note FROM research_events WHERE asset_key=?
            AND kind='TOKEN_SOCIALS' ORDER BY id DESC LIMIT 1),'') != ?`)
          .bind(stamp,a.asset_key,socials,a.asset_key,a.asset_key,socials));
      }
    }
    statements.push(env.DB.prepare(`INSERT INTO runs
      (started_at,completed_at,state,discovered,observed,provider_errors)
      VALUES(?,?,?,?,?,?)`).bind(stamp,iso(),warnings.length?'PARTIAL':'SUCCESS',
      pools.length,pools.length,JSON.stringify(warnings)));
    await env.DB.batch(statements);
    console.log('BuyGuy Cloudflare light scan:',pools.length,'observations; provider:',pools[0]?.source||'none',
      '; warnings:',warnings.length);
    return pools.length;
  }catch(error){
    const message=String(error).slice(0,250);
    // Both public providers can independently return 429. Distinguish quota
    // exhaustion from a scanner defect; do not fabricate observations.
    const providerLimited=/DEX Screener profiles HTTP 429|DEX Screener quotes HTTP 429|DISCOVERY_PROVIDERS_COOLDOWN/.test(message);
    const state=providerLimited?'RATE_LIMITED':'ERROR';
    console.error('BuyGuy Cloudflare light scan '+state+':',message);
    try{
      await env.DB.prepare(`INSERT INTO runs
        (started_at,completed_at,state,discovered,observed,provider_errors)
        VALUES(?,?,?,0,0,?)`).bind(stamp,iso(),state,JSON.stringify([message])).run();
    }catch(e){console.error('Unable to record scan failure:',String(e).slice(0,150))}
    if(providerLimited)return 0; // No invented observations; independent scheduled phases continue.
    throw error;
  }
}
