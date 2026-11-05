// Standalone Cloudflare real-time confirmed Solana signature archive.
// EXACT 3 original RPC wallets. Never edits historical records, old pilot cursors,
// the 12-wallet webhook, anything market-facing, or executes transactions.
import {GAP_WALLETS} from './goget-wallet-gap-wave.mjs';
import {LIVE_RPC_BOUNDS,validateSourceWallets,validateSignaturePage,interpretPage}
 from './goget-cloudflare-live-rpc.mjs';
export const GOGET_RPC_BUILD='GOGET_2026_11_05_SOURCE_CYCLE_V1';
const WALLETS=validateSourceWallets([...GAP_WALLETS]);
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,
 headers:{'content-type':'application/json','cache-control':'no-store'}});
const safeError=e=>/^(RPC_[A-Z0-9_]+|RPC_HTTP_\d+)$/.test(e?.message||'')?
 e.message:'SOURCE_UNVERIFIED';
async function read(db,sql,...params){
 const r=await db.prepare(sql).bind(...params).all();
 if(r?.success!==true||!Array.isArray(r.results))throw Error('RPC_D1_READ_UNVERIFIED');
 return r.results;
}
async function write(db,sql,...params){
 const r=await db.prepare(sql).bind(...params).run();
 if(r?.success!==true||!Number.isSafeInteger(r.meta?.changes)||
   r.meta.changes<0)throw Error('RPC_D1_WRITE_UNVERIFIED');
 return r.meta.changes;
}
async function provider(key,wallet,{fetchFn=fetch}={}){
 if(typeof key!=='string'||key.length<12)throw Error('RPC_KEY_UNAVAILABLE');
 const url='https://mainnet.helius-rpc.com/?api-key='+encodeURIComponent(key);
 const r=await fetchFn(url,{method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({jsonrpc:'2.0',id:1,method:'getSignaturesForAddress',
      params:[wallet,{limit:LIVE_RPC_BOUNDS.perWalletSignatureLimit,commitment:'confirmed'}]}),
    signal:AbortSignal.timeout(13000)});
 if(!r.ok)throw Error('RPC_HTTP_'+r.status);
 const len=Number(r.headers?.get?.('content-length'));
 if(Number.isFinite(len)&&len>LIVE_RPC_BOUNDS.maxResponseBytes)
   throw Error('RPC_SOURCE_TOO_LARGE');
 const text=await r.text();
 if(text.length>LIVE_RPC_BOUNDS.maxResponseBytes)throw Error('RPC_SOURCE_TOO_LARGE');
 let body;
 try{body=JSON.parse(text);}catch{throw Error('RPC_SOURCE_JSON_UNVERIFIED');}
 if(body?.error)throw Error('RPC_PROVIDER_REJECTED');
 return body?.result;
}
async function saveRows(db,wallet,rows,at,dbCounter){
 let saved=0;
 for(let i=0;i<rows.length;i+=LIVE_RPC_BOUNDS.maxRowsPerInsert){
  const batch=rows.slice(i,i+LIVE_RPC_BOUNDS.maxRowsPerInsert);
  if(++dbCounter.writes>LIVE_RPC_BOUNDS.maxDbWrites)
    throw Error('RPC_D1_WRITE_CAP');
  const sql='INSERT OR IGNORE INTO goget_rpc_source_signatures(wallet,signature,slot,block_time,failed,observed_at,source) VALUES'+
    batch.map(()=>' (?,?,?,?,?,?,?)').join(',');
  const params=batch.flatMap(x=>[wallet,x.signature,x.slot,x.blockTime,x.failed,at,
     'HELIUS_CONFIRMED_RPC_LIVE_SOURCE']);
  const count=await write(db,sql,...params);
  if(count>batch.length)throw Error('RPC_D1_COUNT_UNVERIFIED');
  saved+=count;
 }
 return saved;
}
export async function collectLiveRpcSources(env,{
 now=Date.now(),scheduledAt=now,trigger='manual',fetchFn=fetch
}={}){
 const bounds=LIVE_RPC_BOUNDS;
 if(env?.GOGET_RPC_ENABLED!=='true')
  return {status:'DISABLED',heliusCalls:0,creditsReserved:0};
 const stop=Date.parse(env?.GOGET_RPC_STOP_AT||'');
 if(!Number.isFinite(stop)||stop!==Date.parse(bounds.stopAt))
  throw Error('RPC_CUTOFF_INVALID');
 if(now>=stop)return {status:'PILOT_EXPIRED',heliusCalls:0,creditsReserved:0};
 if(!env?.DB)throw Error('RPC_D1_UNAVAILABLE');
 const db=env.DB,at=new Date(now).toISOString(),slot=new Date(
   Math.floor(scheduledAt/bounds.scheduleMs)*bounds.scheduleMs).toISOString();
 const day=at.slice(0,10),owner=crypto.randomUUID();
 const numbers={reads:0,writes:0,helius:0},reports=[];
 const dbRead=async(sql,...params)=>{
  if(++numbers.reads>bounds.maxDbReads)throw Error('RPC_D1_READ_CAP');
  return read(db,sql,...params);
 };
 const dbWrite=async(sql,...params)=>{
  if(++numbers.writes>bounds.maxDbWrites)throw Error('RPC_D1_WRITE_CAP');
  return write(db,sql,...params);
 };
 const leased=await dbWrite(
  "UPDATE goget_rpc_source_lease SET owner=?,until_ms=? WHERE id='runner' AND until_ms<?",
  owner,now+bounds.leaseMs,now);
 if(leased!==1)return {status:'LEASE_BUSY',heliusCalls:0,creditsReserved:0};
 let cycle=false,creditsReserved=0,result=null;
 try{
  const claimed=await dbWrite(
   'INSERT OR IGNORE INTO goget_rpc_source_cycles(slot_utc,trigger,started_at,status) VALUES(?,?,?,?)',
    slot,trigger==='cron'?'cron':'manual',at,'RUNNING');
  if(claimed!==1)return {status:'SLOT_ALREADY_RECORDED',slot,heliusCalls:0,creditsReserved:0};
  cycle=true;
  const states=await dbRead(
   'SELECT wallet,head_signature,gaps FROM goget_rpc_source_wallets WHERE wallet IN (?,?,?) LIMIT 3',
   ...WALLETS);
  if(states.length>3||states.some(x=>!WALLETS.includes(x.wallet))||
    new Set(states.map(x=>x.wallet)).size!==states.length)
    throw Error('RPC_STATE_UNVERIFIED');
  const stateMap=new Map(states.map(x=>[x.wallet,x]));
  // An atomic local reservation is recorded BEFORE all three billable
  // archival RPC calls. It never resets the original webhook's control latch.
  await dbWrite('INSERT OR IGNORE INTO goget_rpc_source_budget(day,reserved_credits) VALUES(?,0)',day);
  const increment=bounds.maxHeliusCallsPerRun*bounds.archiveCreditCost;
  const granted=await dbWrite(
   'UPDATE goget_rpc_source_budget SET reserved_credits=reserved_credits+?'+
   ' WHERE day=? AND reserved_credits+?<=?'+
   ' AND reserved_credits+?+COALESCE((SELECT observed_deliveries'+
   ' FROM smart_wallet_webhook_credit_estimates WHERE day=?),0)<=?'+
   " AND EXISTS(SELECT 1 FROM smart_wallet_webhook_control WHERE id='owned' AND state='ARMED')",
   increment,day,increment,bounds.maxUtcDayReservedCredits,
   increment,day,bounds.combinedLocalDayCredits);
  if(granted!==1){
    result={status:'BUDGET_OR_WEBHOOK_CONTROL_DEFERRED',walletsExpected:3,
      walletsScanned:0,heliusCalls:0,creditsReserved:0,sourceGaps:0,
      details:'No Helius calls: local combined cap or original webhook suspension.'};
  }else{
    creditsReserved=increment;
    for(const wallet of WALLETS){
     const previous=stateMap.get(wallet)?.head_signature??null;
     const record={wallet,status:'UNKNOWN',fetched:0,saved:0,gap:false,sourceHeadKnown:!!previous};
     reports.push(record);
     try{
      if(numbers.helius>=bounds.maxHeliusCallsPerRun)
       throw Error('RPC_CALL_CAP');
      // Count attempted calls including HTTP failures; credits are conservatively reserved.
      numbers.helius++;
      const response=await provider(env.HELIUS_API_KEY,wallet,{fetchFn});
      const rows=validateSignaturePage(response,at);
      const info=interpretPage(rows,previous);
      record.fetched=rows.length;record.gap=info.gap;
      record.saved=await saveRows(db,wallet,info.newRows,at,numbers);
      // No cursor movement before all source rows have been acknowledged by D1.
      if(info.gap){
       if(!info.head||!previous)throw Error('RPC_GAP_IDENTITY_UNKNOWN');
       await dbWrite('INSERT OR IGNORE INTO goget_rpc_source_gaps'+
         '(wallet,previous_head,new_head,first_noted_at,scanned_page_size,reason,status)'+
         ' VALUES(?,?,?,?,?,?,?)',
         wallet,previous,info.head,at,rows.length,'PREVIOUS_HEAD_NOT_IN_BOUNDED_100','UNRESOLVED');
      }
      if(info.head){
       const status=info.gap?'GAP_RECORDED':info.status;
       const n=await dbWrite('INSERT INTO goget_rpc_source_wallets'+
         '(wallet,head_signature,last_checked_at,last_connected_at,gaps,status)'+
         ' VALUES(?,?,?,?,?,?) ON CONFLICT(wallet) DO UPDATE SET'+
         ' head_signature=excluded.head_signature,last_checked_at=excluded.last_checked_at,'+
         ' last_connected_at=excluded.last_connected_at,'+
         ' gaps=goget_rpc_source_wallets.gaps+?,status=excluded.status',
         wallet,info.head,at,info.anchored?at:null,info.gap?1:0,status,info.gap?1:0);
       if(n!==1)throw Error('RPC_CHECKPOINT_WRITE_UNVERIFIED');
      }
      record.status=info.gap?'GAP_RECORDED':
        info.baseline?'BASELINE_HISTORY_UNVERIFIED':info.status;
     }catch(error){
      record.status='SOURCE_FAILED';record.error=safeError(error);
      // Every original wallet remains represented, including failed sources.
     }
    }
    const allSuccessful=reports.length===3&&reports.every(x=>x.status!=='SOURCE_FAILED');
    result={status:allSuccessful?'SOURCES_ARCHIVED_GAPS_DISCLOSED':'PARTIAL_SOURCE_FAILURE',
      walletsExpected:3,walletsScanned:reports.filter(x=>x.status!=='SOURCE_FAILED').length,
      heliusCalls:numbers.helius,creditsReserved,
      signaturesSaved:reports.reduce((n,x)=>n+x.saved,0),
      sourceGaps:reports.filter(x=>x.gap).length,sourceReports:reports};
  }
  const summary=JSON.stringify(result);
  if(summary.length>3600)throw Error('RPC_REPORT_TOO_LARGE');
  const changed=await dbWrite('UPDATE goget_rpc_source_cycles SET completed_at=?,status=?,'+
    'helius_calls=?,credits_reserved=?,wallets_scanned=?,signatures_saved=?,source_gaps=?,'+
    'summary_json=? WHERE slot_utc=?',
    at,result.status,result.heliusCalls,result.creditsReserved,
    result.walletsScanned,result.signaturesSaved??0,result.sourceGaps,summary,slot);
  if(changed!==1)throw Error('RPC_CYCLE_NOT_PERSISTED');
  console.log('GOGET_RPC_SOURCE_CYCLE',JSON.stringify({slot,status:result.status,
   walletsExpected:3,walletsScanned:result.walletsScanned,
   calls:result.heliusCalls,creditsReserved:result.creditsReserved,
   saved:result.signaturesSaved??0,gaps:result.sourceGaps,d1Writes:numbers.writes,
   mode:'SOURCE_ONLY_NO_EXECUTABLE_TRADE',trades:0}));
  return {...result,slot,dbWrites:numbers.writes,dbReads:numbers.reads,
    sourceOnly:true,tradeEligible:false,trades:0};
 }catch(e){
  if(cycle){
   try{await write(db,'UPDATE goget_rpc_source_cycles SET completed_at=?,status=?,'+
     'helius_calls=?,credits_reserved=? WHERE slot_utc=?',
     at,'SOURCE_OR_STORAGE_UNVERIFIED',numbers.helius,creditsReserved,slot);}
   catch{console.error('GOGET_RPC_CYCLE_FAILURE_LEDGER_UNAVAILABLE');}
  }
  throw Error(safeError(e));
 }finally{
  try{await write(db,"UPDATE goget_rpc_source_lease SET owner='',until_ms=0 WHERE id='runner' AND owner=?",owner);}
  catch{console.error('GOGET_RPC_LEASE_RELEASE_UNVERIFIED');}
 }
}
async function authorized(headers,key){
 if(typeof key!=='string'||key.length<40)return false;
 const bearer=headers.get('authorization')||'';
 const supplied=bearer.startsWith('Bearer ')?bearer.slice(7):'';
 const [a,b]=await Promise.all([
  crypto.subtle.digest('SHA-256',new TextEncoder().encode(supplied)),
  crypto.subtle.digest('SHA-256',new TextEncoder().encode(key))]);
 const x=new Uint8Array(a),y=new Uint8Array(b);let diff=0;
 for(let i=0;i<x.length;i++)diff|=x[i]^y[i];
 return diff===0;
}
export default {
 async fetch(request,env){
  const path=new URL(request.url).pathname;
  if(path==='/health'&&request.method==='GET')return json({
   build:GOGET_RPC_BUILD,sourceOnly:true,trades:0,
   originalWebhookWalletsPreserved:12,rpcWallets:3,
   archiveCreditsPerRunMax:30,rpcDailyEstimatedCreditCap:9000,
   schedule:'*/5 * * * *',enabled:env?.GOGET_RPC_ENABLED==='true'});
  if(path!=='/run'||request.method!=='POST')return json({error:'NOT_FOUND'},404);
  if(!await authorized(request.headers,env?.GOGET_RPC_CONTROL_TOKEN))
   return json({error:'UNAUTHORIZED'},401);
  try{const result=await collectLiveRpcSources(env);
   return json(result,result.status==='SOURCES_ARCHIVED_GAPS_DISCLOSED'?200:503);
  }catch(e){console.error('GOGET_RPC_SOURCE_FAILURE',safeError(e));
   return json({error:'SOURCE_UNVERIFIED'},503);}
 },
 async scheduled(controller,env){
  try{await collectLiveRpcSources(env,{
    scheduledAt:Number.isFinite(controller?.scheduledTime)?controller.scheduledTime:Date.now(),
    trigger:'cron'});
  }catch(e){console.error('GOGET_RPC_SOURCE_CRON_FAILED',safeError(e));throw e;}
 }
};
