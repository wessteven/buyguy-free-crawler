// Isolated 30-second market-data lane. No ranking, trading or discovery writes.
import {CLEAN_SLATE_AT} from './clean-slate.mjs';
export const INTERVAL_MS=30000;
export const TARGET_LIMIT=5;
export const DAILY_WRITE_BUDGET=25000; // sample rows + SQLite index writes; reserve for existing app
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
const valid=(chain,address)=>chain==='solana'?/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address):chain==='robinhood'&&/^0x[0-9a-fA-F]{40}$/.test(address);
const same=(chain,a,b)=>typeof a==='string'&&typeof b==='string'&&(chain==='robinhood'?a.toLowerCase()===b.toLowerCase():a===b);
const positive=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))&&Number(v)>0?Number(v):null;
const optional=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))&&Number(v)>=0?Number(v):null;
export function exactDexQuotes(pairs,targets,receivedAt){
 if(!Array.isArray(pairs))throw Error('MALFORMED_DEX_RESPONSE');
 return targets.flatMap(t=>{
  const p=pairs.find(p=>p?.chainId===t.chain&&same(t.chain,p.baseToken?.address,t.address)&&same(t.chain,p.pairAddress,t.pool));
  const price=positive(p?.priceUsd),liquidity=positive(p?.liquidity?.usd);
  if(!price||!liquidity)return [];
  return [{asset_key:t.asset_key,chain:t.chain,address:t.address,symbol:t.symbol,pool:t.pool,
   provider:'DEX Screener',received_at:receivedAt,source_at:null,price,liquidity,
   market_cap:optional(p.marketCap),fdv:optional(p.fdv),volume_m5:optional(p.volume?.m5),
   buys_m5:optional(p.txns?.m5?.buys),sells_m5:optional(p.txns?.m5?.sells),unique_buyers:null,
   evidence:'AGGREGATE_QUOTE_NOT_EXECUTION',freshness:'RECEIPT_ONLY'}];
 });
}
export function exactGeckoQuote(data,target,receivedAt){
 // Only Solana until other network mapping is explicitly verified.
 const p=data?.data,at=p?.attributes,base=p?.relationships?.base_token?.data?.id;
 if(target.chain!=='solana'||!same('solana',at?.address,target.pool)||base!=='solana_'+target.address)return null;
 const price=positive(at.base_token_price_usd),liquidity=positive(at.reserve_in_usd);
 if(!price||!liquidity)return null;
 return {...target,provider:'GeckoTerminal',received_at:receivedAt,source_at:null,price,liquidity,
  market_cap:optional(at.market_cap_usd),fdv:optional(at.fdv_usd),volume_m5:optional(at.volume_usd?.m5),
  buys_m5:optional(at.transactions?.m5?.buys),sells_m5:optional(at.transactions?.m5?.sells),unique_buyers:null,
  evidence:'AGGREGATE_QUOTE_NOT_EXECUTION',freshness:'RECEIPT_ONLY'};
}
export function retryDelay(response,now){
 const h=response.headers?.get('retry-after');
 const seconds=h===null||h===undefined?NaN:Number(h);
 const retry=Number.isFinite(seconds)?seconds*1000:Date.parse(h)-now;
 return Math.max(30*60*1000,Number.isFinite(retry)?retry:0);
}
export function sampleStatement(db,q){
 const minute=q.received_at.slice(0,16)+':00.000Z';
 return db.prepare(`INSERT OR IGNORE INTO radar_samples
 (chain,pool,asset_key,minute,provider,received_at,source_at,price,liquidity,market_cap,fdv,volume_m5,buys_m5,sells_m5,unique_buyers)
 VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(q.chain,q.pool,q.asset_key,minute,q.provider,q.received_at,q.source_at,q.price,q.liquidity,q.market_cap,q.fdv,q.volume_m5,q.buys_m5,q.sells_m5,null);
}
export class FastRadar {
 constructor(state,env){this.state=state;this.env=env;this.data={enabled:false,targets:[],quotes:[],providers:{},day:'',writes:0,sampleMinute:null,last_tick:null,error:null,samples_reserved:0};
  state.blockConcurrencyWhile(async()=>{this.data={...this.data,...await state.storage.get('radar')}});
 }
 async save(){await this.state.storage.put('radar',this.data)}
 async publishProof(){
  try{await this.env.DB.prepare(`INSERT INTO leases(name,expires_at,token) VALUES(?,?,?)
   ON CONFLICT(name) DO UPDATE SET expires_at=excluded.expires_at,token=excluded.token`)
   .bind('fast-radar:trial-proof',Date.now()+600000,JSON.stringify(this.data)).run()}catch{}
 }
 async fetch(request){
  const path=new URL(request.url).pathname;
  if(path==='/snapshot')return json({...this.data,target_interval_seconds:30,server_now:new Date().toISOString()});
  if(request.method!=='POST')return json({error:'method_not_allowed'},405);
  return this.state.blockConcurrencyWhile(async()=>{
   if(path==='/stop'){this.data.enabled=false;await this.state.storage.deleteAlarm();await this.save();await this.publishProof();return json({enabled:false})}
   if(path!=='/start')return json({error:'not_found'},404);
   if(this.env.FAST_RADAR_ENABLED!=='true')return json({error:'FAST_RADAR_NOT_ENABLED'},409);
   this.data.enabled=true;this.data.trial_started_at=Date.now();this.data.proof_ticks=[];await this.save();await this.state.storage.setAlarm(Date.now()+1);
   return json({enabled:true,target_interval_seconds:30});
  });
 }
 async provider(name,url,now){
  const state=this.data.providers[name]||{};
  if(state.next_at>now)return null;
  try{
   const response=await (this.env.FAST_RADAR_FETCH||fetch)(url,{headers:{accept:'application/json'},signal:AbortSignal.timeout(8000)});
   if(!response.ok){
    this.data.providers[name]={next_at:now+(response.status===429?retryDelay(response,now):Math.min(30*60*1000,60000*2**Math.min(state.failures||0,4))),failures:(state.failures||0)+1,status:response.status};
    if(response.status===429){
     await this.save(); // persist backoff even if the D1 cooldown write fails
     await this.env.DB.prepare(`INSERT INTO leases(name,expires_at,token) VALUES(?,?,?)
      ON CONFLICT(name) DO UPDATE SET expires_at=MAX(leases.expires_at,excluded.expires_at),token=excluded.token`)
      .bind(name==='dex'?'fast-radar:dex-quotes':'discovery-provider:'+name,this.data.providers[name].next_at,'FAST_RADAR_HTTP_429').run();
    }
    return null;
   }
   const payload=await response.json();
   this.data.providers[name]={next_at:now+(name==='gecko'?60000:30000),failures:0,status:200};
   return payload;
  }catch{
   this.data.providers[name]={next_at:Math.max(this.data.providers[name]?.next_at||0,now+60000),failures:(state.failures||0)+1,status:'UNAVAILABLE'};return null;
  }
 }
 async tick(now=Date.now()){
  const d=this.data,stamp=new Date(now).toISOString(),day=stamp.slice(0,10);
  if(d.day!==day){d.day=day;d.writes=0}
  if(!d.targets_at||now-d.targets_at>=300000){
   d.targets_at=now; // back off target reads even if D1 is unavailable
   const rows=(await this.env.DB.prepare(`SELECT a.asset_key,a.chain,a.address,a.symbol,a.pool FROM assets a
    WHERE a.status IN ('ALIVE','STATIC') AND a.last_seen>=? AND a.pool IS NOT NULL
    ORDER BY a.score DESC,a.asset_key LIMIT ?`).bind(CLEAN_SLATE_AT,TARGET_LIMIT).all()).results||[];
   d.targets=rows.filter(t=>valid(t.chain,t.address)&&valid(t.chain,t.pool));d.targets_at=now;
  }
  // Respect cooldowns recorded by the existing discovery lane as well.
  const shared=(await this.env.DB.prepare('SELECT name,expires_at,token FROM leases WHERE name IN (?,?,?)')
   .bind('discovery-provider:dex','discovery-provider:gecko','fast-radar:dex-quotes').all()).results||[];
  for(const row of shared){
   const name=row.name==='fast-radar:dex-quotes'?'dex':row.name.split(':')[1];
   if(Number(row.expires_at)<=now)continue;
   if(row.name==='discovery-provider:dex'){
    // DEX documents profiles (60/min) and token quotes (300/min) separately.
    // Legacy leases omit the endpoint. Only an exact timestamp-matched error
    // can prove this cooldown is profile-only; unknown scopes remain blocked.
    const recent=(await this.env.DB.prepare('SELECT started_at,provider_errors FROM runs ORDER BY id DESC LIMIT 32').all()).results||[];
    const limited=recent.find(r=>Date.parse(r.started_at)===Number(row.expires_at)-1800000);
    if(limited&&/DEX Screener profiles HTTP 429/.test(limited.provider_errors)&&!/DEX Screener quotes HTTP 429/.test(limited.provider_errors)){
     d.discovery_profile_cooldown_until=Number(row.expires_at);
     if(d.providers.dex?.status==='SHARED_COOLDOWN'&&d.providers.dex.next_at===Number(row.expires_at))delete d.providers.dex;
     continue;
    }
   }
   d.providers[name]={...d.providers[name],next_at:Math.max(d.providers[name]?.next_at||0,Number(row.expires_at)),status:'SHARED_COOLDOWN'};
  }
  const found=[];
  for(const chain of ['solana','robinhood']){
   const targets=d.targets.filter(t=>t.chain===chain);
   if(!targets.length)continue;
   // One global per-provider budget: batch BOTH chains within a single admitted cycle.
   if((d.providers.dex?.next_at||0)>now)break;
   const payload=await this.provider('dex','https://api.dexscreener.com/tokens/v1/'+chain+'/'+targets.map(t=>t.address).join(','),now);
   if(payload){found.push(...exactDexQuotes(payload,targets,stamp));}
   // Do not bypass a 429 for the second chain. Successful first batch can share cycle.
   if(d.providers.dex?.status===200&&chain==='solana')d.providers.dex.next_at=now;
  }
  if(d.providers.dex?.status===200)d.providers.dex.next_at=now+INTERVAL_MS;
  // Budget one exact-pool fallback per minute; rotate gaps so one bad pool cannot monopolize it.
  const missing=d.targets.filter(t=>t.chain==='solana'&&!found.some(q=>q.asset_key===t.asset_key));
  if(missing.length){
   const t=missing[Math.floor(now/60000)%missing.length];
   const payload=await this.provider('gecko','https://api.geckoterminal.com/api/v2/networks/solana/pools/'+t.pool,now);
   if(payload){const q=exactGeckoQuote(payload,t,stamp);if(q)found.push(q)}
  }
  const wanted=new Set(d.targets.map(t=>t.chain+':'+t.pool));
  d.quotes=d.quotes.filter(q=>wanted.has(q.chain+':'+q.pool));
  for(const q of found){d.quotes=d.quotes.filter(old=>old.chain!==q.chain||old.pool!==q.pool);d.quotes.push(q)}
  d.last_tick=stamp;d.updated_quotes=found.length;d.error=null;
  // Cached snapshots do not write assets or rankings. One sample per exact pool/minute.
  const minute=stamp.slice(0,16);
  if(found.length&&d.sampleMinute!==minute&&d.writes+TARGET_LIMIT*3<=DAILY_WRITE_BUDGET&&d.samples_reserved+TARGET_LIMIT<=200000){
   // Reserve before issuing D1 writes; a timeout cannot cause unlimited retries.
   d.writes+=TARGET_LIMIT*3;d.samples_reserved+=TARGET_LIMIT;d.sampleMinute=minute;await this.save();
   const results=await this.env.DB.batch(found.map(q=>sampleStatement(this.env.DB,q)));
   d.last_sample_rows_written=results.reduce((n,r)=>n+(r.meta?.rows_written||0),0);
  }
  d.history_paused=d.writes+TARGET_LIMIT*3>DAILY_WRITE_BUDGET||d.samples_reserved+TARGET_LIMIT>200000;
 }
 async alarm(){
  await this.state.blockConcurrencyWhile(async()=>{
   if(!this.data.enabled||this.env.FAST_RADAR_ENABLED!=='true')return;
   const started=Date.now();
   if(this.data.trial_started_at&&started-this.data.trial_started_at>=600000){
    this.data.enabled=false;this.data.error='TRIAL_COMPLETE';await this.save();await this.publishProof();return;
   }
   try{await this.tick(started)}catch{this.data.error='FAST_RADAR_DATA_UNAVAILABLE'}
   finally{
    this.data.proof_ticks=[...(this.data.proof_ticks||[]),{tick:new Date(started).toISOString(),updated_quotes:this.data.updated_quotes||0,error:this.data.error}].slice(-6);
    await this.save();
    await this.publishProof();
    if(this.data.enabled)await this.state.storage.setAlarm(Math.max(started+INTERVAL_MS,Date.now()+1000))}
  });
 }
}
