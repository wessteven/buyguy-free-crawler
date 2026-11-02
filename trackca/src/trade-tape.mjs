
import {PRIORITIES} from './watchlist.mjs';
import {finite} from './normalize.mjs';

const TX='INSERT OR IGNORE INTO trackca_attributed_trades (asset_id,trade_id,observed_at,occurred_at_ms,tx_hash,pool_id,side,attributed_trader,signer,executor,value_usd,block_height,provider) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)';
const SNAP='INSERT OR REPLACE INTO trackca_trade_windows (run_id,asset_id,started_at,window_start_ms,window_end_ms,status,buys,sells,unique_buyer_traders,unique_seller_traders,unattributed_count,buy_volume_usd,sell_volume_usd,large_sell_volume_usd,large_seller_traders,trade_rows,provider) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)';
const ethAddress=v=>typeof v==='string'&&/^0x[a-f0-9]{40}$/i.test(v)?v.toLowerCase():null;
const txHash=v=>typeof v==='string'&&/^0x[a-f0-9]{64}$/i.test(v)?v.toLowerCase():null;
const pause=ms=>new Promise(r=>setTimeout(r,ms));

export function parseTradeWindow(body,asset,nowMs){
 if(!Array.isArray(body?.data))throw Error('trade tape data absent');
 const from=nowMs-60*60*1000;
 const trades=[],buyer=new Set(),seller=new Set(),largeSellers=new Set();
 let buys=0,sells=0,buyUSD=0,sellUSD=0,largeSellUSD=0,unattributed=0;
 for(const t of body.data){
  const when=finite(t?.ts);
  if(when===null||when<from||when>nowMs+60000)continue;
  const side=t.type==='buy'?'buy':t.type==='sell'?'sell':null;
  const usd=finite(t.value_usd);
  if(!side||usd===null||usd<0)continue;
  const id=String(t.id||'');
  if(!/^[A-Za-z0-9-]{1,120}$/.test(id))continue;
  const trader=ethAddress(t.trader),signer=ethAddress(t.signer),executor=ethAddress(t.executor);
  // The attributed trader comes from the provider. It is not proof of independent funding.
  const row={id,ts:Math.trunc(when),tx:txHash(t.tx),pool:typeof t.pool==='string'?t.pool.slice(0,80):null,
    side,trader,signer,executor,usd,block:finite(t.block)};
  trades.push(row);
  if(!trader)unattributed++;
  if(side==='buy'){buys++;buyUSD+=usd;if(trader)buyer.add(trader);}
  else{sells++;sellUSD+=usd;if(trader)seller.add(trader);
   if(usd>=1000){largeSellUSD+=usd;if(trader)largeSellers.add(trader);}}
 }
 const capped=body.data.length>=200||!!body?.meta?.next_cursor;
 return {trades,summary:{status:capped?'CAPPED_PAGE_NOT_EXHAUSTIVE':'PROVIDER_ATTRIBUTED_NOT_FUNDING_VERIFIED',
  from,to:nowMs,buys,sells,uniqueBuyerTraders:buyer.size,uniqueSellerTraders:seller.size,unattributed,
  buyUSD,sellUSD,largeSellUSD,largeSellerTraders:largeSellers.size,total:trades.length}};
}

export async function samplePriorityTrades({now,runId,db,fetchJson,fetcher,errors}){
 // The parent Cron runs every five minutes; this source runs once per UTC hour.
 if(now.getUTCMinutes()>=5)return new Set();
 const nowMs=now.getTime();
 const ok=new Set();let blocked=false;
 for(const a of PRIORITIES){
  if(blocked){errors.push(a.id+' trade tape provider blocked');continue;}
  try{
   const url='https://api.crius.sh/v1/robinhood/token/'+a.address+'/trades?limit=200&from_ts='+(nowMs-3600000)+'&to_ts='+nowMs;
   const parsed=parseTradeWindow(await fetchJson(url,fetcher),a,nowMs);
   const rows=parsed.trades.map(t=>db.prepare(TX).bind(a.id,t.id,now.toISOString(),t.ts,t.tx,t.pool,t.side,t.trader,t.signer,t.executor,t.usd,t.block,'crius'));
   for(let i=0;i<rows.length;i+=50)await db.batch(rows.slice(i,i+50));
   const s=parsed.summary;
   await db.prepare(SNAP).bind(runId,a.id,now.toISOString(),s.from,s.to,s.status,s.buys,s.sells,
    s.uniqueBuyerTraders,s.uniqueSellerTraders,s.unattributed,s.buyUSD,s.sellUSD,
    s.largeSellUSD,s.largeSellerTraders,s.total,'crius').run();
   ok.add(a.id);
   if(s.status==='CAPPED_PAGE_NOT_EXHAUSTIVE')errors.push(a.id+' trade tape truncated to first 200');
  }catch(e){
   const reason=String(e?.message||e).slice(0,140);
   errors.push(a.id+' trade tape '+reason);
   if(/HTTP (403|429)/.test(reason))blocked=true;
  }
  if(fetcher===fetch)await pause(550);
 }
 return ok;
}
