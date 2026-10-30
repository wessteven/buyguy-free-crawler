// GOGET: isolated Helius event-driven wallet *observation* receiver.
// NEVER exports a verified buy, order or paper fill. No keys, swaps or RPC send methods.
const ADDRESS=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const SIGNATURE=/^[1-9A-HJ-NP-Za-km-z]{64,88}$/;
export const WEBHOOK_LIMITS=Object.freeze({
  bodyBytes:96000,eventsPerRequest:30,storedEventsPerDay:1200,
  maxWallets:3,deadline:'2026-11-02T00:00:00Z'
});
const enc=new TextEncoder();
const json=(obj,status=200)=>new Response(JSON.stringify(obj),{
  status,headers:{'content-type':'application/json','cache-control':'no-store',
  'x-content-type-options':'nosniff'}});
const integer=x=>Number.isSafeInteger(x)&&x>0;
function normalizeList(value){
  if(!Array.isArray(value)||value.length===0||value.length>WEBHOOK_LIMITS.maxWallets)return null;
  const set=new Set();
  for(const x of value){if(typeof x!=='string'||!ADDRESS.test(x)||set.has(x))return null;set.add(x);}
  return set;
}
export async function verifyBearer(input,secret){
  if(typeof secret!=='string'||secret.length<40)return false;
  const supplied=typeof input==='string'&&input.startsWith('Bearer ')?input.slice(7):'';
  const [a,b]=await Promise.all([crypto.subtle.digest('SHA-256',enc.encode(supplied)),
    crypto.subtle.digest('SHA-256',enc.encode(secret))]);
  const x=new Uint8Array(a),y=new Uint8Array(b);
  if(typeof crypto.subtle.timingSafeEqual==='function')return crypto.subtle.timingSafeEqual(x,y);
  let bad=0;for(let i=0;i<x.length;i++)bad|=x[i]^y[i];
  return bad===0; // fixed-sized digest comparison fallback for Node tests
}
export async function boundedText(request,max=WEBHOOK_LIMITS.bodyBytes) {
  const contentLength=request.headers.get('content-length');
  if(contentLength!==null&&(!/^\d+$/.test(contentLength)||Number(contentLength)>max))
    return {ok:false,reason:'BODY_LIMIT'};
  if(!request.body)return {ok:false,reason:'BODY_EMPTY'};
  const reader=request.body.getReader();let bytes=0;
  const chunks=[];
  try {
    while(true){
      const x=await reader.read();
      if(x.done)break;
      bytes+=x.value.byteLength;
      if(bytes>max){await reader.cancel();return {ok:false,reason:'BODY_LIMIT'};}
      chunks.push(x.value);
    }
  }finally{reader.releaseLock();}
  const data=new Uint8Array(bytes);let offset=0;
  for(const c of chunks){data.set(c,offset);offset+=c.length;}
  return {ok:true,text:new TextDecoder('utf-8',{fatal:true}).decode(data)};
}
export function summarizeHeliusBatch(body,watched,receivedAt){
  const reasonCounts={},rows=[],seen=new Set();
  if(!Array.isArray(body))return {ok:false,error:'BODY_NOT_ARRAY'};
  if(body.length>WEBHOOK_LIMITS.eventsPerRequest)return {ok:false,error:'BATCH_TOO_LARGE'};
  const reject=why=>reasonCounts[why]=(reasonCounts[why]||0)+1;
  for(const tx of body){
    if(!tx||typeof tx!=='object'||!SIGNATURE.test(tx.signature||'')||
      !integer(tx.slot)||!integer(tx.timestamp)||tx.timestamp<1577836800||
      !Number.isFinite(tx.timestamp*1000)||tx.timestamp*1000>Date.parse(receivedAt)+300000){reject('BAD_TRANSACTION_IDENTITY');continue;}
    if(tx.transactionError!==null){reject('TX_FAILURE_OR_ERROR_UNKNOWN');continue;}
    const referenced=new Set();
    // Fee payer is a candidate signal only; user-owned transfer references may be separate.
    if(watched.has(tx.feePayer))referenced.add(tx.feePayer);
    for(const t of Array.isArray(tx.tokenTransfers)?tx.tokenTransfers.slice(0,100):[]){
      if(watched.has(t?.fromUserAccount))referenced.add(t.fromUserAccount);
      if(watched.has(t?.toUserAccount))referenced.add(t.toUserAccount);
    }
    if(!referenced.size){reject('NO_EXPLICIT_WALLET_OWNER_EVIDENCE');continue;}
    const transferHints=(Array.isArray(tx.tokenTransfers)?tx.tokenTransfers:[])
      .filter(t=>ADDRESS.test(t?.mint||'')).slice(0,8)
      .map(t=>({mint:t.mint,from:t.fromUserAccount||null,to:t.toUserAccount||null}));
    for(const wallet of referenced){
      const key=wallet+':'+tx.signature;
      if(seen.has(key))continue;seen.add(key);
      // Helius timestamps are typically seconds; this is latency vs timestamp, not network SLA.
      const delayMs=Date.parse(receivedAt)-tx.timestamp*1000;
      const status=tx.type==='SWAP'?'UNVERIFIED_ENHANCED_SWAP':'OTHER_TRANSACTION';
      rows.push({wallet,signature:tx.signature,slot:tx.slot,
        blockTime:new Date(tx.timestamp*1000).toISOString(),observedAt:receivedAt,
        feePayerObserved:tx.feePayer===wallet,
        status,delayMs:Number.isFinite(delayMs)?delayMs:null,source:tx.source||'UNKNOWN',
        evidence:JSON.stringify({source:'HELIUS_ENHANCED_WEBHOOK',type:tx.type||null,
          feePayerIsWallet:tx.feePayer===wallet,transferHints,
          warning:'NOT_SIGNER_VERIFIED_NOT_EXECUTABLE_NOT_TRADE_ELIGIBLE'}).slice(0,1750)});
    }
  }
  return {ok:true,rows,reasonCounts,received:body.length};
}

export async function serveSmartWalletWebhook(request,env,now=Date.now()){
  const path=new URL(request.url).pathname;
  if(path==='/health'&&request.method==='GET')return json({service:'goget-wallet-webhook',state:'watch_only'});
  if(path!=='/webhook'&&path!=='/ready')return json({error:'NOT_FOUND'},404);
  if(path==='/webhook'&&request.method!=='POST')return json({error:'METHOD_NOT_ALLOWED'},405);
  if(path==='/ready'&&request.method!=='GET')return json({error:'METHOD_NOT_ALLOWED'},405);
  if(!env||typeof env.WALLET_WEBHOOK_SECRET!=='string'||env.WALLET_WEBHOOK_SECRET.length<40)
    return json({error:'RECEIVER_NOT_CONFIGURED'},503);
  if(!await verifyBearer(request.headers.get('authorization'),env.WALLET_WEBHOOK_SECRET))
    return json({error:'UNAUTHORIZED'},401);
  if(path==='/ready')return json({ready:!!env.DB,mode:'WATCH_ONLY',tradeEligible:false},env.DB?200:503);
  // Expiration blocks new events even if Helius webhook disablement lags.
  const deadline=Date.parse(env.WALLET_WEBHOOK_STOP_AT||WEBHOOK_LIMITS.deadline);
  if(!Number.isFinite(deadline)||now>=deadline||env.WALLET_WEBHOOK_ENABLED!=='true')
    return json({error:'RECEIVER_DISABLED_OR_EXPIRED'},410);
  if(!env.DB)return json({error:'DATABASE_UNAVAILABLE'},503);
  if(!(request.headers.get('content-type')||'').toLowerCase().startsWith('application/json'))
    return json({error:'UNSUPPORTED_CONTENT_TYPE'},415);
  const watched=normalizeList((env.WALLET_WATCHED_ADDRESSES||'').split(',').filter(Boolean));
  if(!watched)return json({error:'WATCHLIST_NOT_CONFIGURED'},503);
  let body;
  try{
    const read=await boundedText(request);
    if(!read.ok)return json({error:read.reason},413);
    body=JSON.parse(read.text);
  }catch{return json({error:'BAD_JSON_OR_ENCODING'},400);}
  const receivedAt=new Date(now).toISOString();
  const batch=summarizeHeliusBatch(body,watched,receivedAt);
  if(!batch.ok)return json({error:batch.error},413);
  if(!batch.rows.length)return json({ok:true,accepted:0,duplicates:0,rejected:batch.reasonCounts,tradeEligible:false});
  const day=receivedAt.slice(0,10);
  try{
    await env.DB.prepare('INSERT OR IGNORE INTO smart_wallet_webhook_budget(day,reserved) VALUES(?,0)').bind(day).run();
    const quota=await env.DB.prepare('UPDATE smart_wallet_webhook_budget SET reserved=reserved+? WHERE day=? AND reserved+?<=?')
      .bind(batch.rows.length,day,batch.rows.length,WEBHOOK_LIMITS.storedEventsPerDay).run();
    if((quota.meta?.changes??0)!==1)return json({error:'DAILY_PERSISTENCE_BUDGET_EXHAUSTED'},429);
    const statements=batch.rows.map(row=>env.DB.prepare(
      'INSERT OR IGNORE INTO smart_wallet_webhook_events(wallet,signature,observed_at,block_time,slot,classification,delay_ms,fee_payer_observed,evidence_json) VALUES(?,?,?,?,?,?,?,?,?)'
    ).bind(row.wallet,row.signature,row.observedAt,row.blockTime,row.slot,row.status,
      row.delayMs,row.feePayerObserved?1:0,row.evidence));
    const persisted=await env.DB.batch(statements);
    // All statements must succeed or fail request; event identity is idempotent.
    if(!persisted.every(v=>v.success===true))return json({error:'PERSISTENCE_UNVERIFIED'},503);
    const inserted=persisted.reduce((n,r)=>n+(r.meta?.changes??0),0);
    return json({ok:true,received:batch.received,accepted:inserted,
      duplicates:batch.rows.length-inserted,rejected:batch.reasonCounts,
      mode:'WATCH_ONLY',tradeEligible:false});
  }catch{return json({error:'PERSISTENCE_UNAVAILABLE'},503);}
}
export default {fetch:(request,env)=>serveSmartWalletWebhook(request,env)};
