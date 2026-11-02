
import {ASSETS,ROBINHOOD,MIHAO} from './watchlist.mjs';
import {finite} from './normalize.mjs';

// A quote is a token-level indicative observation. Never promote it to proof of pool
// trade volume, independent buying, executable depth, or verified whale behaviour.
export const QUOTE_SQL='INSERT OR IGNORE INTO trackca_token_quotes (run_id,asset_id,chain,token_address,observed_at,provider_asof,price_usd,liquidity_usd,change_24h_pct,aggregate_volume_m5_usd,aggregate_volume_h1_usd,aggregate_volume_h24_usd,source_pool,confidence,source,quality,block_height) VALUES ('+Array(17).fill('?').join(',')+')';

export function parseCrius(j,assets,ts,runId){
 const entries=j&&j.data&&typeof j.data==='object'&&!Array.isArray(j.data)?j.data:{};
 const keyed=new Map(Object.entries(entries).map(([k,v])=>[k.toLowerCase(),v]));
 const block=finite(j?.meta?.block);
 const millis=finite(j?.meta?.block_ts);
 const validMillis=millis!==null&&millis>1e12&&millis<1e15?millis:null;
 const asof=validMillis===null?null:new Date(validMillis).toISOString();
 const delta=validMillis===null?null:Date.parse(ts)-validMillis;
 const quality=delta===null?'BLOCK_TIME_UNKNOWN':delta<0||delta>600000?'STALE_BLOCK':'BLOCK_STAMPED_PROVIDER_PRICE';
 const rows=[];
 for(const a of assets){
  if(!a.address)continue;
  const d=keyed.get(a.address.toLowerCase());
  const p=finite(d?.usd);
  if(p===null||p<=0)continue;
  const pool=d?.source_pool;
  const safePool=typeof pool==='string'&&/^0x(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(pool)?pool.toLowerCase():null;
  rows.push([runId,a.id,a.chain,a.address,ts,asof,p,finite(d?.liquidity_usd),
   finite(d?.change_24h_pct),null,null,null,safePool,
   typeof d?.confidence==='string'?d.confidence.slice(0,32):null,'crius',quality,block]);
 }
 return rows;
}

export function parseMIHAO(j,asset,ts,runId){
 // Solana base58 addresses are case-sensitive: reject a same-symbol wrong mint.
 if(!j||j.id!==asset.address||j.chain!=='solana')return null;
 const s=j.summary||j.price_stats;
 const price=finite(s?.price_usd??j.price_usd);
 if(price===null||price<=0)return null;
 const parsed=Date.parse(j.last_updated||'');
 const asof=Number.isFinite(parsed)?new Date(parsed).toISOString():null;
 const delta=asof===null?null:Date.parse(ts)-parsed;
 const quality=delta===null?'QUOTE_TIME_UNKNOWN':delta<0||delta>600000?'STALE_QUOTE':'TOKEN_AGGREGATE_PROVIDER';
 return [runId,asset.id,asset.chain,asset.address,ts,asof,price,finite(s?.liquidity_usd),
  finite(s?.['24h']?.last_price_usd_change),
  finite(s?.['5m']?.volume_usd),finite(s?.['1h']?.volume_usd),finite(s?.['24h']?.volume_usd),
  null,null,'dexpaprika',quality,null];
}

export async function sampleQuotes({bucket,ts,runId,db,fetchJson,fetcher,errors}){
 const out=new Map();
 // No-key usage is budgeted at at most 144 requests per provider per day.
 if(bucket%2!==0)return out;
 const known=ROBINHOOD.filter(a=>a.address);
 try{
  const url='https://api.crius.sh/v1/robinhood/prices?tokens='+known.map(a=>a.address).join(',');
  const rows=parseCrius(await fetchJson(url,fetcher),known,ts,runId);
  if(rows.length){
   await db.batch(rows.map(row=>db.prepare(QUOTE_SQL).bind(...row)));
   for(const row of rows)out.set(row[1],'TOKEN_PRICE_ONLY');
  }else errors.push('Crius no matched exact-address prices');
 }catch(e){errors.push('Crius price batch '+String(e?.message||e).slice(0,130));}
 try{
  const j=await fetchJson('https://api.dexpaprika.com/networks/solana/tokens/'+MIHAO.address,fetcher);
  const row=parseMIHAO(j,MIHAO,ts,runId);
  if(row){
   await db.prepare(QUOTE_SQL).bind(...row).run();
   out.set('mihao','TOKEN_AGGREGATE_ONLY');
  }else errors.push('MIHAO DexPaprika mint or price absent');
 }catch(e){errors.push('MIHAO DexPaprika '+String(e?.message||e).slice(0,130));}
 return out;
}
