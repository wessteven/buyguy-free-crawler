// GOGET independent, one-hour, 10-pool stream experiment.
// NO trades, wallet signing, production source cursor changes, or quote substitution.
import {PILOT,validAddr,freezePoolRoster,subscribePayload,parseWsFrame,
  classifyActivity,classifyScheduled,rpcPageCoverage,minuteStart,pairedResult}
 from './goget-event-pilot-core.mjs';

export const EVENT_PILOT_BUILD='GOGET_EVENT_STREAM_PILOT_2026_11_07_V1';
const stamp=n=>new Date(n).toISOString();
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,
 headers:{'content-type':'application/json','cache-control':'no-store'}});
async function rows(db,sql,...args){
 const r=await db.prepare(sql).bind(...args).all();
 if(r?.success!==true||!Array.isArray(r.results))throw Error('PILOT_D1_READ_FAILED');
 return r.results;
}
async function write(db,sql,...args){
 const r=await db.prepare(sql).bind(...args).run();
 if(r?.success!==true||!Number.isSafeInteger(r.meta?.changes))
  throw Error('PILOT_D1_WRITE_FAILED');
 return r.meta.changes;
}
async function auth(request,key){
 if(typeof key!=='string'||key.length<40)return false;
 const supplied=(request.headers.get('authorization')||'').replace(/^Bearer /,'');
 const hash=async x=>new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(x)));
 const [a,b]=await Promise.all([hash(supplied),hash(key)]);
 let diff=0;for(let i=0;i<32;i++)diff|=a[i]^b[i];return diff===0;
}
function totalStats(sql){
 return Object.fromEntries(sql.exec('SELECT key,value FROM event_pilot_stats').toArray()
  .map(x=>[x.key,Number(x.value)]));
}
function incr(sql,key,amount=1){
 sql.exec('INSERT INTO event_pilot_stats(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=value+excluded.value',key,amount);
}
const asofSQL=`SELECT seen_at,price,buys_m5,sells_m5 FROM observations
 WHERE asset_key=? AND pool=? AND seen_at<=?
 ORDER BY seen_at DESC LIMIT 1`;
const rosterSQL=`SELECT a.pool,a.address AS mint,a.asset_key,o.seen_at AS quote_at
 FROM assets a JOIN observations o ON o.asset_key=a.asset_key AND o.pool=a.pool
 WHERE a.chain='solana' AND a.pool IS NOT NULL AND o.price>0
 AND o.seen_at>=? AND o.seen_at<=?
 ORDER BY a.pinned DESC,a.score DESC,o.seen_at DESC LIMIT 100`;
export class GogetEventPilot {
 constructor(ctx,env){
  this.ctx=ctx;this.env=env;this.ws=null;this.subToPool=new Map();
  this.requestToPool=new Map();this.ready=false;
  const sql=ctx.storage.sql;
  sql.exec('CREATE TABLE IF NOT EXISTS event_pilot_events(pool TEXT NOT NULL,signature TEXT NOT NULL,slot INTEGER NOT NULL,received_ms INTEGER NOT NULL,failed INTEGER NOT NULL,PRIMARY KEY(pool,signature))');
  sql.exec('CREATE INDEX IF NOT EXISTS event_pilot_events_time ON event_pilot_events(pool,received_ms)');
  sql.exec('CREATE TABLE IF NOT EXISTS event_pilot_segments(start_ms INTEGER PRIMARY KEY,end_ms INTEGER)');
  sql.exec('CREATE TABLE IF NOT EXISTS event_pilot_stats(key TEXT PRIMARY KEY,value INTEGER NOT NULL)');
 }
 sql(){return this.ctx.storage.sql;}
 async fetch(request){
  const path=new URL(request.url).pathname;
  try{
   if(path==='/start'&&request.method==='POST')return reply(await this.start());
   if(path==='/tick'&&request.method==='POST')return reply(await this.tick());
   if(path==='/stop'&&request.method==='POST')return reply(await this.finish('MANUAL_STOP'));
   if(path==='/status'&&request.method==='GET'){
    const r=await this.ctx.storage.get('pilot_run');
    return reply({run:r?{id:r.id,status:r.status,startedAt:stamp(r.start),endsAt:stamp(r.end),
      pools:r.pools.length,lastFlushed:r.nextMinute?stamp(r.nextMinute):null}:null,
      metrics:totalStats(this.sql()),build:EVENT_PILOT_BUILD});
   }
   return reply({error:'NOT_FOUND'},404);
  }catch(e){
   console.error('GOGET_EVENT_PILOT_DO_ERROR',String(e.message||'UNKNOWN').slice(0,100));
   return reply({error:'PILOT_OPERATION_UNVERIFIED',code:/^PILOT_[A-Z0-9_]+$/.test(e.message)?e.message:'UNKNOWN'},503);
  }
 }
 async start(){
  if(this.env?.GOGET_EVENT_PILOT_ENABLED!=='true')throw Error('PILOT_NOT_ARMED');
  if(!this.env?.DB||typeof this.env.HELIUS_API_KEY!=='string'||this.env.HELIUS_API_KEY.length<12)
    throw Error('PILOT_CONFIG_MISSING');
  const previous=await this.ctx.storage.get('pilot_run');
  if(previous)throw Error('PILOT_ALREADY_STARTED_NO_REARM');
  const now=Date.now(),today=stamp(now).slice(0,10);
  const candidates=await rows(this.env.DB,rosterSQL,stamp(now-10*60000),stamp(now));
  const roster=freezePoolRoster(candidates,now);
  if((await rows(this.env.DB,'SELECT run_id FROM goget_event_pilot_runs WHERE utc_day=?',today)).length)
    throw Error('PILOT_UTC_DAY_ALREADY_RUN');
  // Atomically reserve Helius capacity in the ORIGINAL shared 9k RPC ledger.
  // Protect all outstanding five-minute 3-wallet source cycles AND the
  // independent decode research budget; never bypass the webhook ARMED latch.
  const future=Math.ceil((Date.parse(today+'T00:00:00Z')+86400000-now)/300000)*30;
  await write(this.env.DB,
    'INSERT OR IGNORE INTO goget_rpc_source_budget(day,reserved_credits) VALUES(?,0)',today);
  const granted=await write(this.env.DB,
    'UPDATE goget_rpc_source_budget SET reserved_credits=reserved_credits+? WHERE day=?'+
    ' AND reserved_credits+?+?+COALESCE((SELECT reserved_credits FROM goget_rpc_decode_budget WHERE day=?),0)<=?'+
    ' AND reserved_credits+?+COALESCE((SELECT observed_deliveries FROM smart_wallet_webhook_credit_estimates WHERE day=?),0)<=?'+
    " AND EXISTS(SELECT 1 FROM smart_wallet_webhook_control WHERE id='owned' AND state='ARMED')",
    PILOT.reserveHeliusCredits,today,PILOT.reserveHeliusCredits,future,today,
    PILOT.sharedRpcDailyCap,PILOT.reserveHeliusCredits,today,PILOT.localHeliusDailyCap);
  if(granted!==1)throw Error('PILOT_SHARED_BUDGET_PROTECTED');
  const id=crypto.randomUUID(),end=now+PILOT.durationMs;
  await write(this.env.DB,
    'INSERT INTO goget_event_pilot_runs(run_id,utc_day,started_at,ends_at,status,requested_pools,armed_pools,reserved_credits) VALUES(?,?,?,?,?,?,?,?)',
    id,today,stamp(now),stamp(end),'ARMING',PILOT.pools,roster.length,PILOT.reserveHeliusCredits);
  for(const p of roster)await write(this.env.DB,
    'INSERT INTO goget_event_pilot_roster(run_id,pool,mint,asset_key) VALUES(?,?,?,?)',
    id,p.pool,p.mint,p.assetKey);
  const run={id,status:'ACTIVE',start:now,end,pools:roster,nextMinute:minuteStart(now)+60000,
    hasGap:false,reconnects:0,rpcAttempts:0};
  await this.ctx.storage.put('pilot_run',run);
  await write(this.env.DB,'UPDATE goget_event_pilot_runs SET status=? WHERE run_id=?','ACTIVE',id);
  await this.ctx.storage.setAlarm(end);
  this.connect(run);
  return {status:'ARMED_STREAM_CONNECTING',runId:id,requestedPools:PILOT.pools,
    selectedPools:roster.length,endsAt:stamp(end),reservedHeliusCredits:PILOT.reserveHeliusCredits,
    proof:'ACKS_AND_RPC_RECONCILIATION_PENDING',tradeCertified:false};
 }
 connect(run){
  if(Date.now()>=run.end||run.status!=='ACTIVE')return;
  if(this.ws&&(this.ws.readyState===0||this.ws.readyState===1))return;
  this.subToPool.clear();this.requestToPool.clear();this.ready=false;
  let ws;
  try{ws=new WebSocket('wss://mainnet.helius-rpc.com/?api-key='+encodeURIComponent(this.env.HELIUS_API_KEY));}
  catch{incr(this.sql(),'ws_connect_errors');return;}
  this.ws=ws;incr(this.sql(),'ws_connections');
  ws.addEventListener('open',()=>{
   run.pools.forEach((p,i)=>{
    const id=i+1;this.requestToPool.set(id,p.pool);
    ws.send(JSON.stringify(subscribePayload(id,p.pool)));
   });
  });
  ws.addEventListener('message',event=>{
   try{
    const raw=event.data;
    if(typeof raw!=='string'||raw.length>PILOT.maxEventBytes)throw Error('PILOT_STREAM_MESSAGE_OVERSIZE');
    incr(this.sql(),'streamed_bytes',raw.length);
    const stat=totalStats(this.sql());
    if((stat.streamed_bytes||0)>PILOT.maxWsBytes){
     incr(this.sql(),'limit_breaches');this.drop('WS_BYTE_CAP');return;
    }
    const parsed=parseWsFrame(raw,this.subToPool,Date.now());
    if(parsed.kind==='ACK'){
     const pool=this.requestToPool.get(parsed.id);
     if(!pool)throw Error('PILOT_UNKNOWN_SUBSCRIPTION_ACK');
     this.subToPool.set(parsed.subscription,pool);
     if(this.subToPool.size===run.pools.length&&!this.ready){
      this.ready=true;
      this.sql().exec('INSERT INTO event_pilot_segments(start_ms,end_ms) VALUES(?,NULL)',Date.now());
     }
    }else if(parsed.kind==='SUBSCRIPTION_REJECTED'){
     incr(this.sql(),'subscription_rejections');this.drop('SUBSCRIPTION_REJECTED');
    }else if(parsed.kind==='EVENT'){
     if(!this.ready)throw Error('PILOT_PRE_READY_EVENT');
     this.sql().exec('INSERT OR IGNORE INTO event_pilot_events(pool,signature,slot,received_ms,failed) VALUES(?,?,?,?,?)',
      parsed.pool,parsed.signature,parsed.slot,parsed.receivedMs,parsed.failed?1:0);
     const changed=this.sql().exec('SELECT changes() AS n').one().n;
     incr(this.sql(),changed===1?'unique_events':'duplicate_events');
     if((totalStats(this.sql()).unique_events||0)>=PILOT.maxUniqueEvents){
      incr(this.sql(),'limit_breaches');this.drop('EVENT_CAP');
     }
    }else incr(this.sql(),'other_messages');
   }catch(e){incr(this.sql(),'stream_parse_errors');this.drop('STREAM_VALIDATION_FAILED');}
  });
  ws.addEventListener('close',()=>this.drop('WEBSOCKET_CLOSED',false));
  ws.addEventListener('error',()=>this.drop('WEBSOCKET_ERROR',false));
 }
 drop(reason,close=true){
  if(!this.ws&&!this.ready)return;
  const hadSegment=this.ready;
  this.ready=false;this.subToPool.clear();
  if(hadSegment)this.sql().exec('UPDATE event_pilot_segments SET end_ms=? WHERE end_ms IS NULL',Date.now());
  incr(this.sql(),'disconnects');
  this.sql().exec('INSERT INTO event_pilot_stats(key,value) VALUES(?,1) ON CONFLICT(key) DO UPDATE SET value=1','has_gap');
  if(close&&this.ws&&this.ws.readyState<2){try{this.ws.close(1000,reason.slice(0,50));}catch{}}
  this.ws=null;
 }
 async tick(){
  const run=await this.ctx.storage.get('pilot_run');
  if(!run)return {status:'NOT_STARTED'};
  if(run.status!=='ACTIVE')return {status:run.status};
  const now=Date.now(),end=Math.min(now,run.end);
  // The last partial minute is excluded; every pool receives a row, including zero activity.
  const last=minuteStart(end);
  let persisted=0;
  while(run.nextMinute<last&&persisted<PILOT.pools*6){
   const cutoff=run.nextMinute+60000,minute=stamp(run.nextMinute);
   const covered=this.sql().exec(
     'SELECT COUNT(*) AS n FROM event_pilot_segments WHERE start_ms<=? AND (end_ms IS NULL OR end_ms>=?)',
     run.nextMinute,cutoff).one().n>0;
   for(const p of run.pools){
    const recent=this.sql().exec(
      'SELECT COUNT(*) AS n FROM event_pilot_events WHERE pool=? AND received_ms>=? AND received_ms<? AND failed=0',
      p.pool,run.nextMinute,cutoff).one().n;
    const prior=this.sql().exec(
      'SELECT COUNT(*) AS n FROM event_pilot_events WHERE pool=? AND received_ms>=? AND received_ms<? AND failed=0',
      p.pool,run.nextMinute-240000,run.nextMinute).one().n;
    const eventSignal=classifyActivity({recent,prior4:prior,covered});
    const quote=(await rows(this.env.DB,asofSQL,p.assetKey,p.pool,stamp(cutoff)))[0];
    const scheduled=classifyScheduled({buys:quote?.buys_m5,sells:quote?.sells_m5,
      quoteAt:quote?.seen_at,asOf:cutoff});
    const eligibleQuote=Number(quote?.price)>0&&Number.isFinite(Date.parse(quote.seen_at))&&
      cutoff-Date.parse(quote.seen_at)<=10*60000;
    const streamStatus=eventSignal.triggered===null?null:Number(eventSignal.triggered);
    const scheduledStatus=scheduled.triggered===null?null:Number(scheduled.triggered);
    await write(this.env.DB,
     'INSERT OR IGNORE INTO goget_event_pilot_windows(run_id,pool,mint,minute,cutoff_at,coverage,raw_mentions,prior_four_minutes,stream_trigger,scheduled_trigger,scheduled_status,scheduled_quote_at,scheduled_price,scheduled_buys_m5,scheduled_sells_m5) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      run.id,p.pool,p.mint,minute,stamp(cutoff),
      covered?'CONTINUOUS_STREAM':'STREAM_COVERAGE_UNVERIFIED',recent,prior,
      streamStatus,scheduledStatus,scheduled.status,
      eligibleQuote?quote.seen_at:null,eligibleQuote?Number(quote.price):null,
      scheduledStatus===null?null:quote.buys_m5,scheduledStatus===null?null:quote.sells_m5);
    if(eligibleQuote&&covered&&scheduledStatus!==null){
     for(const horizon of PILOT.horizons){
      await write(this.env.DB,
       'INSERT OR IGNORE INTO goget_event_pilot_outcomes(run_id,pool,minute,horizon_min,due_at,start_price,status) VALUES(?,?,?,?,?,?,?)',
        run.id,p.pool,minute,horizon,stamp(cutoff+horizon*60000),
        Number(quote.price),'PENDING');
     }
    }
    persisted++;
   }
   run.nextMinute+=60000;
   await this.ctx.storage.put('pilot_run',run);
  }
  const stats=totalStats(this.sql());
  await write(this.env.DB,
   'UPDATE goget_event_pilot_runs SET streamed_bytes=?,unique_events=?,duplicate_events=?,streamed_estimated_credits=?,ws_connections=?,stream_gap_count=? WHERE run_id=?',
   stats.streamed_bytes||0,stats.unique_events||0,stats.duplicate_events||0,
   Math.ceil((stats.streamed_bytes||0)/100000)*2,stats.ws_connections||0,stats.disconnects||0,run.id);
  if(now>=run.end||stats.limit_breaches)return this.finish(stats.limit_breaches?'LIMIT_REACHED':'TIMED_END');
  if(!this.ws||this.ws.readyState>1){
   this.drop('RECONNECT_REQUIRED',false);
   this.connect(run);
  }
  return {status:'COLLECTING',runId:run.id,streamedBytes:stats.streamed_bytes||0,
    uniqueEvents:stats.unique_events||0,persistedWindows:persisted,coverage:this.ready?'ACKED_NOW':'NOT_ACKED'};
 }
 async finish(reason){
  const run=await this.ctx.storage.get('pilot_run');
  if(!run)return {status:'NOT_STARTED'};
  if(run.status!=='ACTIVE')return {status:run.status};
  if(this.ws&&this.ws.readyState<2)try{this.ws.close(1000,'pilot-ended');}catch{}
  this.ws=null;
  if(this.ready)this.sql().exec('UPDATE event_pilot_segments SET end_ms=? WHERE end_ms IS NULL',Date.now());
  this.ready=false;
  // Do not trust WebSocket receipt counts alone: independently get the
  // latest up-to-100 confirmed signatures for EVERY frozen original pool.
  // Full pages within the window are censored, never called complete.
  let attempted=0,full=0,unknown=0;
  const ended=Math.min(Date.now(),run.end);
  for(const p of run.pools){
   attempted++;
   let status='RPC_PROVIDER_UNVERIFIED',result=null,error=null,pageSize=null;
   try{
    const response=await fetch('https://mainnet.helius-rpc.com/?api-key='+encodeURIComponent(this.env.HELIUS_API_KEY),{
     method:'POST',headers:{'content-type':'application/json'},
     body:JSON.stringify({jsonrpc:'2.0',id:1,method:'getSignaturesForAddress',
       params:[p.pool,{limit:PILOT.maxRpcPage,commitment:'confirmed'}]}),
     signal:AbortSignal.timeout(10000)});
    if(!response.ok)throw Error('RPC_HTTP_'+response.status);
    const text=await response.text();
    if(text.length>PILOT.maxRpcBytes)throw Error('RPC_OVERSIZE');
    const data=JSON.parse(text);
    if(!Array.isArray(data.result)||data.error)throw Error('RPC_SHAPE');
    pageSize=data.result.length;
    const seen=new Set(this.sql().exec(
     'SELECT signature FROM event_pilot_events WHERE pool=? AND received_ms>=? AND received_ms<=?',
     p.pool,run.start,ended).toArray().map(x=>x.signature));
    result=rpcPageCoverage(data.result,run.start,ended,seen);
    status=result.status;
    if(result.complete)full++;else unknown++;
   }catch(e){unknown++;error='RPC_UNVERIFIED';}
   await write(this.env.DB,
    'INSERT OR REPLACE INTO goget_event_pilot_reconciliation(run_id,pool,checked_at,status,rpc_in_window,websocket_matched,missing,recall,page_size,provider_error) VALUES(?,?,?,?,?,?,?,?,?,?)',
    run.id,p.pool,stamp(Date.now()),status,result?.rpcInWindow??null,
    result?.websocketMatched??null,result?.missed??null,result?.recall??null,pageSize,error);
  }
  const stats=totalStats(this.sql()),estimatedWs=Math.ceil((stats.streamed_bytes||0)/100000)*2;
  const audit=await rows(this.env.DB,
   'SELECT COUNT(*) AS total,SUM(CASE WHEN coverage=? THEN 0 ELSE 1 END) AS incomplete FROM goget_event_pilot_windows WHERE run_id=?',
   'CONTINUOUS_STREAM',run.id);
  const fullWindows=Number(audit[0]?.total||0)>=PILOT.pools*58&&Number(audit[0]?.incomplete||0)===0;
  run.status=reason==='TIMED_END'&&full===PILOT.pools&&fullWindows&&
    (stats.disconnects||0)===0&&(stats.stream_parse_errors||0)===0&&
    (stats.subscription_rejections||0)===0?
    'RECORDED_WITH_BOUNDED_RPC_COVERAGE':'PARTIAL_OR_UNVERIFIED_COVERAGE';
  await this.ctx.storage.put('pilot_run',run);
  await write(this.env.DB,
   'UPDATE goget_event_pilot_runs SET status=?,completed_at=?,streamed_bytes=?,unique_events=?,duplicate_events=?,streamed_estimated_credits=?,rpc_attempts=?,ws_connections=?,stream_gap_count=?,stop_reason=?,notes=? WHERE run_id=?',
   run.status,stamp(Date.now()),stats.streamed_bytes||0,stats.unique_events||0,
   stats.duplicate_events||0,estimatedWs,attempted,stats.ws_connections||0,
   stats.disconnects||0,reason,'WS estimated credits not Helius invoice; raw logs not swap proof',run.id);
  return {status:run.status,runId:run.id,requestedPools:PILOT.pools,
   reconciledCompletePools:full,unverifiedPools:unknown,wsEstimatedCredits:estimatedWs,
   rpcEstimatedCredits:attempted*10,reservedCredits:PILOT.reserveHeliusCredits,
   providerBilledCredits:null,cloudflareBilledUsd:null,tradeCertified:false};
 }
 async alarm(){try{await this.tick();}catch(e){console.error('GOGET_EVENT_PILOT_ALARM_FAILURE',String(e.message).slice(0,60));}}
}

export async function settlePilotOutcomes(db,now=Date.now()){
 if(!db)throw Error('PILOT_D1_UNAVAILABLE');
 const pending=await rows(db,'SELECT run_id,pool,minute,horizon_min,due_at,start_price FROM goget_event_pilot_outcomes WHERE status=? AND due_at<=? ORDER BY due_at ASC LIMIT ?',
  'PENDING',stamp(now),PILOT.maxDuePerCycle);
 let seen=0,expired=0;
 for(const o of pending){
  const due=Date.parse(o.due_at);
  if(!Number.isFinite(due)||!(Number(o.start_price)>0))continue;
  const quotes=await rows(db,
   'SELECT seen_at,price FROM observations WHERE pool=? AND seen_at>=? AND seen_at<=? AND price>0 ORDER BY seen_at ASC LIMIT 1',
   o.pool,o.due_at,stamp(Math.min(now,due+PILOT.missToleranceMs)));
  const q=quotes[0],valid=q&&Number.isFinite(Number(q.price))&&Number(q.price)>0;
  if(!valid&&now<due+PILOT.missToleranceMs)continue;
  const status=valid?'OBSERVED_EXACT_POOL':'MISSING_FUTURE_PRICE_COVERAGE';
  const ret=valid?(Number(q.price)/Number(o.start_price)-1)*100:null;
  const n=await write(db,
   'UPDATE goget_event_pilot_outcomes SET status=?,checked_at=?,outcome_quote_at=?,outcome_price=?,return_pct=?,source=? WHERE run_id=? AND pool=? AND minute=? AND horizon_min=? AND status=?',
   status,stamp(now),valid?q.seen_at:null,valid?Number(q.price):null,valid?ret:null,
   valid?'GOGET_SCHEDULED_OBSERVATION_EXACT_POOL':null,
   o.run_id,o.pool,o.minute,o.horizon_min,'PENDING');
  if(n){if(valid)seen++;else expired++;}
 }
 return {examined:pending.length,observed:seen,missingFutureCoverage:expired};
}
export async function pilotSummary(db,runId){
 const runs=await rows(db,'SELECT * FROM goget_event_pilot_runs WHERE run_id=?',runId);
 const samples=await rows(db,
  'SELECT w.stream_trigger,w.scheduled_trigger,w.coverage,o.status AS outcome_status,o.return_pct FROM goget_event_pilot_windows w JOIN goget_event_pilot_outcomes o ON o.run_id=w.run_id AND o.pool=w.pool AND o.minute=w.minute AND o.horizon_min=60 WHERE w.run_id=? LIMIT 1200',runId);
 const coverage=await rows(db,
  'SELECT status,COUNT(*) AS n FROM goget_event_pilot_reconciliation WHERE run_id=? GROUP BY status',runId);
 return {run:runs[0]||null,coverage,researchOneHour:pairedResult(samples),
  interpretation:'One-hour comparable exact-pool outcomes only, no fee-adjusted fills or causal inference'};
}
export default {
 async fetch(request,env){
  const path=new URL(request.url).pathname;
  if(path==='/health'&&request.method==='GET')return reply({build:EVENT_PILOT_BUILD,
    enabled:env.GOGET_EVENT_PILOT_ENABLED==='true',maxPools:PILOT.pools,
    durationMinutes:60,trades:0,originalServicesUnchanged:true});
  if(!['/start','/stop','/status'].includes(path))return reply({error:'NOT_FOUND'},404);
  if(!await auth(request,env.GOGET_EVENT_PILOT_CONTROL_TOKEN))
   return reply({error:'UNAUTHORIZED'},401);
  try{
   const stub=env.EVENT_PILOT.get(env.EVENT_PILOT.idFromName('goget-independent-stream-pilot-v1'));
   if(path==='/status'){
    const state=await stub.fetch('https://pilot.internal/status');
    const data=await state.json();
    if(data.run?.id)data.comparison=await pilotSummary(env.DB,data.run.id);
    return reply(data,state.status);
   }
   if(request.method!=='POST')return reply({error:'METHOD_NOT_ALLOWED'},405);
   return stub.fetch('https://pilot.internal'+path,{method:'POST'});
  }catch(e){console.error('GOGET_EVENT_PILOT_REQUEST_FAILED',String(e.message).slice(0,70));
   return reply({error:'PILOT_REQUEST_FAILED'},503);}
 },
 async scheduled(controller,env){
  // Always mature pending outcomes after the stream stops, including 24h labels.
  if(env.GOGET_EVENT_PILOT_ENABLED!=='true')return;
  const stub=env.EVENT_PILOT.get(env.EVENT_PILOT.idFromName('goget-independent-stream-pilot-v1'));
  const state=await stub.fetch('https://pilot.internal/tick',{method:'POST'});
  if(!state.ok)console.error('GOGET_EVENT_PILOT_TICK_UNVERIFIED');
  await settlePilotOutcomes(env.DB,Date.now());
 }
};
