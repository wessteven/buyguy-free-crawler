import {ASSETS,ROBINHOOD,MIHAO,PRIORITIES} from './watchlist.mjs';
import {finite,validPools,pairRow,normalizeCandles,coverage} from './normalize.mjs';
 const DEX='https://api.dexscreener.com';
 const GECKO='https://api.geckoterminal.com/api/v2';
 const BS='https://robinhoodchain.blockscout.com/api/v2';
 const COLS='run_id,asset_id,chain,token_address,pool_id,dex,observed_at,price_usd,liquidity_usd,volume_m5_usd,volume_h1_usd,volume_h24_usd,buys_m5,sells_m5,buys_h1,sells_h1,buys_h24,sells_h24,change_m5_pct,change_h1_pct,change_h24_pct,source,quote_time_status';
 const Q='('+Array(23).fill('?').join(',')+')';
 const short=e=>String(e?.message||e).slice(0,180).replace(/https?:\/\/\S+/g,'[source]');
 export async function fetchJson(url,fetcher=fetch,timeout=8000){
  const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),timeout);
  try {
   const r=await fetcher(url,{signal:ctrl.signal,headers:{accept:'application/json','user-agent':'trackca-readonly-collector/0.2'}});
   if(!r.ok)throw Error('HTTP '+r.status+' '+new URL(url).hostname);
   return await r.json();
  } finally {clearTimeout(timer);}
 }
 async function batch(db,statements){for(let n=0;n<statements.length;n+=50)await db.batch(statements.slice(n,n+50));}
 const throttle=(ms)=>new Promise(done=>setTimeout(done,ms));
 // GeckoTerminal relationships, not token symbols, provide independent exact-contract identity.
 async function geoPairs(json,a){
  const out=[];
  for(const item of (Array.isArray(json?.data)?json.data:[])){
   const at=item?.attributes||{},rel=item?.relationships||{};
   const tokenId=k=>{const id=rel[k]?.data?.id||'';return id.startsWith(a.chain+'_')?id.slice(a.chain.length+1):null;};
   const base=tokenId('base_token'),quote=tokenId('quote_token');
   if(!base||!quote||!((a.chain==='solana'?base===a.address:base.toLowerCase()===a.address.toLowerCase())||(a.chain==='solana'?quote===a.address:quote.toLowerCase()===a.address.toLowerCase())))continue;
   const address=at.address||(item.id?.startsWith(a.chain+'_')?item.id.slice(a.chain.length+1):null);
   if(typeof address!=='string'||!(/^[a-zA-Z0-9]{20,}$/.test(address)))continue;
   const price=(a.chain==='solana'?base===a.address:base.toLowerCase()===a.address.toLowerCase())?at.base_token_price_usd:at.quote_token_price_usd;
   out.push({chainId:a.chain,pairAddress:address,dexId:rel.dex?.data?.id||'gecko',baseToken:{address:base},quoteToken:{address:quote},
    priceUsd:price,liquidity:{usd:at.reserve_in_usd},volume:at.volume_usd||{},txns:at.transactions||{},priceChange:at.price_change_percentage||{},source:'geckoterminal'});
  }
  return validPools(out,a);
 }
 async function market(chain,assets,ts,runId,db,fetcher,errors){
  const known=assets.filter(a=>a.address),map=new Map();
  if(!known.length)return {map,count:0};
  let dexBlocked=false;
  try{
   const all=await fetchJson(DEX+'/tokens/v1/'+chain+'/'+known.map(a=>a.address).join(','),fetcher);
   if(!Array.isArray(all))throw Error('invalid batch response');
   for(const a of known)map.set(a.id,validPools(all,a));
  }catch(e){errors.push(chain+' dex batch '+short(e));dexBlocked=/HTTP 429|HTTP 403/.test(short(e));}
  if(!dexBlocked)for(const a of known){
   if(map.get(a.id)?.length)continue;
   try{const result=await fetchJson(DEX+'/token-pairs/v1/'+chain+'/'+a.address,fetcher);map.set(a.id,validPools(result,a));}
   catch(e){errors.push(a.id+' dex pool '+short(e));if(/HTTP 429|HTTP 403/.test(short(e))){dexBlocked=true;break;}}
  }
  // One batch for previously grounded non-v4 pool IDs; unknown or v4 IDs get address-specific lookup.
  const missing=known.filter(a=>!map.get(a.id)?.length),seeds=missing.filter(a=>a.pool&&a.pool_kind!=='v4_pool_id');
  let geckoBlocked=false;
  if(seeds.length)try{
   const addresses=[...new Set(seeds.map(a=>a.pool))];
   const j=await fetchJson(GECKO+'/networks/'+chain+'/pools/multi/'+addresses.join(',')+'?include=base_token,quote_token,dex',fetcher);
   for(const a of seeds){const pairs=await geoPairs(j,a);if(pairs.length)map.set(a.id,pairs);}
  }catch(e){errors.push(chain+' gecko multi-pool '+short(e));geckoBlocked=/HTTP 429|HTTP 403/.test(short(e));}
  // Respect the 30/min public rate limit; stop immediately on 429/403 instead of retry storms.
  let previous=0;
  const pace=fetcher===fetch?2800:0;
  if(!geckoBlocked)for(const a of missing){
   if(map.get(a.id)?.length)continue;
   if(pace&&previous){await throttle(Math.max(0,pace-(Date.now()-previous)));}
   previous=Date.now();
   try{
    const j=await fetchJson(GECKO+'/networks/'+chain+'/tokens/'+encodeURIComponent(a.address)+'/pools?include=base_token,quote_token,dex',fetcher);
    const pairs=await geoPairs(j,a);map.set(a.id,pairs);
   }catch(e){errors.push(a.id+' gecko pool '+short(e));if(/HTTP 429|HTTP 403/.test(short(e))){geckoBlocked=true;break;}}
  }
  const stmts=[];
  for(const a of known){
   const pools=map.get(a.id)||[];
   map.set(a.id,pools);
   for(const p of pools){
    const row=pairRow(p,a,ts,runId);
    stmts.push(db.prepare('INSERT OR IGNORE INTO trackca_pair_snapshots ('+COLS+') VALUES '+Q).bind(...row));
   }
  }
  if(stmts.length)await batch(db,stmts);
  return {map,count:stmts.length};
 }
 async function mihaoCandles(map,db,fetcher,errors) {
  const pool=map.get('mihao')?.[0]?.pairAddress;
  if(!pool){errors.push('MIHAO exact pool unavailable');return 0;}
  const url=GECKO+'/networks/solana/pools/'+encodeURIComponent(pool)+'/ohlcv/minute?aggregate=1&limit=20&currency=usd&token='+encodeURIComponent(MIHAO.address);
  try{
   const rows=normalizeCandles(await fetchJson(url,fetcher),MIHAO,pool);
   const stmts=rows.map(row=>db.prepare('INSERT OR IGNORE INTO trackca_ohlcv (asset_id,chain,pool_id,minute_ts,open_usd,high_usd,low_usd,close_usd,volume_usd,source) VALUES (?,?,?,?,?,?,?,?,?,?)').bind(...row));
   if(stmts.length)await batch(db,stmts);
   return rows.length;
  }catch(e){errors.push('MIHAO candles '+short(e));return 0;}
 }
 async function chainMetrics(ts,runId,db,fetcher,errors){
  let v24=null,v7=null,c7=null,tvl=null;
  try {
   const j=await fetchJson('https://api.llama.fi/overview/dexs/robinhood-chain?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true',fetcher);
   v24=finite(j.total24h);v7=finite(j.total7d);c7=finite(j.change_7d);
  }catch(e){errors.push('chain DEX '+short(e));}
  try {
   const j=await fetchJson('https://api.llama.fi/v2/chains',fetcher);
   const x=Array.isArray(j)?j.find(c=>/robinhood\s*chain/i.test(c.name||'')):null;
   tvl=finite(x?.tvl);
  }catch(e){errors.push('chain TVL '+short(e));}
  await db.prepare('INSERT INTO trackca_chain_metrics (run_id,observed_at,volume_24h_usd,volume_7d_usd,change_7d_pct,tvl_usd,source,quality) VALUES (?,?,?,?,?,?,?,?)')
   .bind(runId,ts,v24,v7,c7,tvl,'defillama',v24!==null&&tvl!==null?'ROLLING_PUBLIC_AGGREGATES':'PARTIAL').run();
 }
 const holderNumber=(a,b)=>{
  for(const x of [a?.holders_count,b?.token_holders_count,b?.holders_count,b?.holders]){
   const n=finite(x);if(n!==null&&Number.isInteger(n)&&n>=0)return n;
  }return null;
 };
 async function chainEvidence(env,ts,fetcher,db,errors){
  const statuses=new Map();if(env.TRACKCA_BLOCKSCOUT_ENABLED==='false')return statuses;
  let blocked=false;
  for(const a of PRIORITIES) {
   if(blocked){statuses.set(a.id,{holder:'PROVIDER_BLOCKED',transfer:'PROVIDER_BLOCKED'});continue;}
   let holder='UNAVAILABLE',transfer='UNAVAILABLE';
   try{
    const [a1,a2]=await Promise.all([fetchJson(BS+'/tokens/'+a.address,fetcher),fetchJson(BS+'/tokens/'+a.address+'/counters',fetcher)]);
    const n=holderNumber(a1,a2);holder=n===null?'UNAVAILABLE':'EXPLORER_SNAPSHOT';
    await db.prepare('INSERT OR REPLACE INTO trackca_holder_snapshots (asset_id,observed_at,holders_count,source,status) VALUES (?,?,?,?,?)')
    .bind(a.id,ts,n,'blockscout',holder).run();
    }catch(e){errors.push(a.id+' holder '+short(e));if(/HTTP 403|HTTP 429/.test(short(e))){blocked=true;statuses.set(a.id,{holder:'PROVIDER_BLOCKED',transfer:'PROVIDER_BLOCKED'});continue;}}
   try{
    const j=await fetchJson(BS+'/tokens/'+a.address+'/transfers',fetcher);
    if(!Array.isArray(j.items))throw Error('no transfers array');
    const stmts=[];
    for(const t of j.items.slice(0,50)){
     const hash=t.transaction_hash||t.transaction?.hash||t.tx_hash;
     if(typeof hash!=='string'||!/^0x[\da-f]{64}$/i.test(hash))continue;
     const sender=t.from?.hash||null,receiver=t.to?.hash||null,raw=String(t.total?.value??t.value??'');
     const key=[a.id,hash,t.log_index??'',sender,receiver,raw,t.timestamp||''].join(':');
     stmts.push(db.prepare('INSERT OR IGNORE INTO trackca_transfer_events (event_key,asset_id,contract,tx_hash,observed_at,occurred_at,sender,recipient,raw_value,token_decimals,source,classification) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
     .bind(key,a.id,a.address,hash,ts,t.timestamp||null,sender,receiver,raw,finite(t.total?.decimals??t.token?.decimals),'blockscout','TRANSFER_NOT_SWAP'));
    }
    if(stmts.length)await batch(db,stmts);
    transfer='BOUNDED_TRANSFERS_NOT_VERIFIED_TRADES';
    }catch(e){errors.push(a.id+' transfers '+short(e));if(/HTTP 403|HTTP 429/.test(short(e)))blocked=true;}
   statuses.set(a.id,{holder,transfer});
  }
  return statuses;
 }
 export async function collect(env,{now=new Date(),fetcher=fetch}={}){
  if(!env.DB)throw Error('D1 binding missing');
  const bucket=Math.floor(now.getTime()/300000),runId='trackca-'+bucket,ts=now.toISOString(),errors=[];
  const check=await env.DB.prepare('INSERT OR IGNORE INTO trackca_runs (bucket,run_id,started_at,status,assets_total) VALUES (?,?,?,?,?)').bind(bucket,runId,ts,'RUNNING',ASSETS.length).run();
  if(check.meta?.changes===0)return {already_run:true,runId};
  try {
   const rh=await market('robinhood',ROBINHOOD,ts,runId,env.DB,fetcher,errors);
   const sol=await market('solana',[MIHAO],ts,runId,env.DB,fetcher,errors);
   const map=new Map([...rh.map,...sol.map]);
   const candles=await mihaoCandles(map,env.DB,fetcher,errors);
   await chainMetrics(ts,runId,env.DB,fetcher,errors);
   const holder=now.getUTCMinutes()<5?await chainEvidence(env,ts,fetcher,env.DB,errors):new Map();
   const statements=[];
   for(const a of ASSETS){
    const evidence=holder.get(a.id);
    const c=coverage(a,map.get(a.id)||[],evidence?.holder||'NOT_REFETCHED_THIS_RUN',evidence?.transfer||'NOT_REFETCHED_THIS_RUN');
    statements.push(env.DB.prepare('INSERT OR REPLACE INTO trackca_coverage (run_id,asset_id,token_address,identity_status,market_status,five_min_status,hour_status,day_status,unique_buyer_status,holder_status,wallet_status,whale_status,sell_depth_status,note) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .bind(runId,c.id,c.address,c.identity,c.market,c.five_min,c.hour,c.day,c.unique_buyers,c.holder,c.wallets,c.whales,c.executable_depth,c.note));
   }
   await batch(env.DB,statements);
   const known=ASSETS.filter(a=>a.address).length,covered=[...map.values()].filter(p=>p.length).length,count=rh.count+sol.count;
   // An incomplete deep scan is NOT a clean negative trading signal.
   await env.DB.prepare('UPDATE trackca_runs SET completed_at=?,status=?,assets_identified=?,assets_with_pools=?,snapshots_written=?,warnings=? WHERE bucket=?')
    .bind(new Date().toISOString(),'INCOMPLETE',known,covered,count,JSON.stringify(errors.slice(0,100)),bucket).run();
   return {runId,status:'INCOMPLETE',assets:ASSETS.length,known,covered,snapshots:count,mihaoCandles:candles,warnings:errors};
  } catch(e){
   errors.push('FATAL '+short(e));
   await env.DB.prepare('UPDATE trackca_runs SET completed_at=?,status=?,warnings=? WHERE bucket=?')
    .bind(new Date().toISOString(),'ERROR',JSON.stringify(errors.slice(0,100)),bucket).run();
   throw e;
  }
 }
 export async function getStatus(db){
  const run=await db.prepare('SELECT bucket,run_id,started_at,completed_at,status,assets_total,assets_identified,assets_with_pools,snapshots_written,warnings FROM trackca_runs ORDER BY bucket DESC LIMIT 1').first();
  if(!run)return {project:'trackCA',status:'NO_RUNS',assets:ASSETS.map(a=>({id:a.id,name:a.name,chain:a.chain,address:a.address}))};
  const cov=await db.prepare('SELECT * FROM trackca_coverage WHERE run_id=? LIMIT 50').bind(run.run_id).all();
  const pool=await db.prepare('SELECT asset_id,pool_id,dex,observed_at,price_usd,liquidity_usd,volume_m5_usd,volume_h1_usd,volume_h24_usd,quote_time_status FROM trackca_pair_snapshots WHERE run_id=? ORDER BY asset_id,liquidity_usd DESC LIMIT 100').bind(run.run_id).all();
  const chain=await db.prepare('SELECT * FROM trackca_chain_metrics WHERE run_id=?').bind(run.run_id).first();
  const candles=await db.prepare("SELECT minute_ts,pool_id,close_usd,volume_usd FROM trackca_ohlcv WHERE asset_id='mihao' ORDER BY minute_ts DESC LIMIT 20").all();
  return {project:'trackCA',status:run.status,run,chain,coverage:cov.results||[],pools:pool.results||[],mihaoCandles:candles.results||[],
   assets:ASSETS.map(a=>({id:a.id,name:a.name,chain:a.chain,address:a.address,priority:!!a.priority}))};
 }
 const HTML='<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>trackCA</title><style>body{font:15px system-ui;background:#0c1824;color:#eff5fa;padding:20px}main{max-width:1200px;margin:auto}table{border-collapse:collapse;width:100%}td,th{padding:10px;border-bottom:1px solid #344354;text-align:left}a{color:#9df}.sub{color:#aab6c6}.scroll{overflow:auto}</style></head><body><main><h1>trackCA · token tracker</h1><p class="sub">Read-only · independent Cloudflare Worker · Robinhood Chain + Solana MIHAO · five-minute collection</p><p id="summary">Loading...</p><div class="scroll"><table><thead><tr><th>Asset</th><th>Chain</th><th>Identity</th><th>Price</th><th>5m volume</th><th>1h volume</th><th>24h volume</th><th>Evidence</th></tr></thead><tbody id="rows"></tbody></table></div><p class="sub">DEX volume represents transactions, not distinct independent buyers. Quotes are observed snapshots, not executable exit estimates. Unverified risk checks remain incomplete.</p></main><script>const f=x=>x==null?"—":Number(x).toLocaleString(undefined,{maximumFractionDigits:6});async function load(){try{const d=await(await fetch("/api/status",{cache:"no-store"})).json();document.getElementById("summary").textContent="Last run: "+(d.run?.started_at||"none")+" · "+d.status+" · matched pools for "+(d.run?.assets_with_pools||0)+"/"+d.assets.length+" assets";document.getElementById("rows").innerHTML=d.assets.map(a=>{const p=d.pools?.find(x=>x.asset_id===a.id),c=d.coverage?.find(x=>x.asset_id===a.id);return "<tr><td>"+a.name+"</td><td>"+a.chain+"</td><td>"+(c?.identity_status|| (a.address?"known":"unresolved"))+"</td><td>"+f(p?.price_usd)+"</td><td>"+f(p?.volume_m5_usd)+"</td><td>"+f(p?.volume_h1_usd)+"</td><td>"+f(p?.volume_h24_usd)+"</td><td>"+(c?.market_status||"no run")+"</td></tr>"}).join("");}catch(e){document.getElementById("summary").textContent="Unavailable: "+e.message}}load();setInterval(load,60000);</script></body></html>';
 export default {
  async scheduled(_event,env,ctx){ctx.waitUntil(collect(env).then(r=>console.log('trackCA',JSON.stringify(r))).catch(e=>console.error('trackCA_error',short(e))));},
  async fetch(request,env){
   if(request.method!=='GET')return new Response('Method Not Allowed',{status:405});
   const p=new URL(request.url).pathname;
   if(p==='/')return new Response(HTML,{headers:{'content-type':'text/html;charset=utf-8','cache-control':'no-store'}});
   if(p==='/health'||p==='/api/status'){
    try{
     const result=await getStatus(env.DB);
     if(p==='/health')return Response.json({project:'trackCA',status:result.status,last_run_at:result.run?.started_at||null,covered:result.run?.assets_with_pools||0,total:ASSETS.length});
     return Response.json(result,{headers:{'cache-control':'no-store'}});
    }catch(e){return Response.json({project:'trackCA',status:'ERROR',message:'Storage unavailable'},{status:503});}
   }
   return new Response('Not Found',{status:404});
  }
 };
