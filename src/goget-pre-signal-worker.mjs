// GOGET prospective signal lab: independent 24/7 evidence collection on existing D1.
// No Helius requests, no LLM, no wallet signing, no order execution.
import {detectSignalWindows,attachAsOfQuotes,SIGNAL_LIMITS} from './goget-pre-signal-features.mjs';

export const SIGNAL_WORKER_LIMITS=Object.freeze({
  cronMinutes:5,leaseMs:240000,maxOutcomeChecks:20,
  maxWritesPerInvocation:50,maxQuoteCandidates:40,
  horizonsMinutes:[5,60,360,1440],modelCalls:0,heliusCalls:0,tradeCalls:0
});
const MIN=60000;
const json=(obj,status=200)=>new Response(JSON.stringify(obj),{
  status,headers:{'content-type':'application/json','cache-control':'no-store'}});
const exception=x=>{
  const allowed=['D1_UNAVAILABLE','D1_READ_FAILED','D1_WRITE_FAILED',
    'D1_WRITE_BUDGET','INVALID_CLOCK','INVALID_OUTCOME_QUOTE','SCHEDULE_DISABLED'];
  return allowed.includes(x?.message)?x.message:'PRE_SIGNAL_RESEARCH_UNAVAILABLE';
};
async function read(db,sql,...p){
  const a=await db.prepare(sql).bind(...p).all();
  if(a?.success!==true||!Array.isArray(a.results))throw Error('D1_READ_FAILED');
  return a.results;
}
async function write(db,sql,...p){
  const a=await db.prepare(sql).bind(...p).run();
  if(a?.success!==true||!Number.isSafeInteger(a?.meta?.changes))throw Error('D1_WRITE_FAILED');
  return a.meta.changes;
}
function batches(rows,size){
  const result=[];
  for(let i=0;i<rows.length;i+=size)result.push(rows.slice(i,i+size));
  return result;
}
function boundInsert(table,columns,rows){
  const names=columns.join(',');
  const placeholders=rows.map(()=> '('+columns.map(()=>'?').join(',')+')').join(',');
  return {sql:'INSERT OR IGNORE INTO '+table+'('+names+') VALUES '+placeholders,
    params:rows.flat()};
}
function snapshotRows(items,bucket,now,coverage){
  return items.map(x=>[
    x.mint,bucket,new Date(now).toISOString(),x.firstRecentAt,x.lastRecentAt,
    x.recentSignatures,x.priorSignatures,x.distinctWallets,x.feePayerWallets,
    x.intensity,x.category,x.sampleKind,x.quote?.pool??null,x.quote?.minute??null,
    x.quote?.priceSol??null,coverage,JSON.stringify({
      source:'BOUNDED_HELIUS_RECEIPT_WINDOW',recentMinutes:15,baselineMinutes:75,
      evidenceKind:x.evidenceKind,independentlyVerifiedBuy:false,
      marketData:x.quoteStatus,tradeEligible:false,sourceObservations:x.sourceObservations
    })
  ]);
}
const snapshotColumns=[
  'mint','bucket','created_at','first_recent_at','last_recent_at',
  'recent_signatures','prior_signatures','distinct_wallets','fee_payer_wallets',
  'intensity_ratio','category','sample_kind','pool','quote_minute',
  'quote_price_sol','coverage','findings_json'
];
const outcomeColumns=['mint','bucket','horizon_min','due_at',
  'pool','reference_price_sol','status'];
const quoteAsOfSQL=[
  'SELECT a.address AS mint,a.pool,s.minute,s.price_sol',
  'FROM assets a JOIN chain_radar_samples s ON s.chain=? AND s.pool=a.pool',
  'WHERE a.chain=? AND a.address IN (%%MINTS%%)',
  'AND s.minute>=? AND s.minute<=? ORDER BY s.minute DESC LIMIT 250'
].join(' ');
const sourceSQL=[
  'SELECT wallet,signature,observed_at,fee_payer_observed,evidence_json',
  'FROM smart_wallet_webhook_events WHERE observed_at>=? AND observed_at<=?',
  'ORDER BY observed_at DESC LIMIT ?'
].join(' ');
const outcomeSQL=[
  'SELECT mint,bucket,horizon_min,due_at,pool,reference_price_sol',
  'FROM goget_pre_signal_outcomes WHERE status=? AND due_at<=?',
  'ORDER BY due_at ASC,mint ASC LIMIT ?'
].join(' ');

export async function processPreSignalCycle(env,{now=Date.now(),trigger='manual',runId=null}={}){
  if(!Number.isSafeInteger(now)||now<0)throw Error('INVALID_CLOCK');
  if(env?.PRE_SIGNAL_ENABLED!=='true')return {status:'DISABLED'};
  if(!env?.DB)throw Error('D1_UNAVAILABLE');
  const db=env.DB,id=runId??crypto.randomUUID(),stamp=new Date(now).toISOString();
  let usedWrites=0;
  const boundedWrite=async(sql,...params)=>{
    if(++usedWrites>SIGNAL_WORKER_LIMITS.maxWritesPerInvocation)throw Error('D1_WRITE_BUDGET');
    return write(db,sql,...params);
  };
  const locked=await boundedWrite(
    "UPDATE goget_pre_signal_lease SET owner=?,until_ms=? WHERE id='runner' AND until_ms<?",
    id,now+SIGNAL_WORKER_LIMITS.leaseMs,now);
  if(locked!==1)return {status:'LEASE_BUSY'};
  try{
    const from=new Date(now-SIGNAL_LIMITS.lookbackMinutes*MIN).toISOString();
    const rows=await read(db,sourceSQL,from,stamp,SIGNAL_LIMITS.sourceLimit);
    const base=detectSignalWindows(rows,{now});
    const incomplete=rows.length>=SIGNAL_LIMITS.sourceLimit;
    let enriched=[],inserted=0,createdJobs=0;
    if(!incomplete){
      let quoteRows=[];
      if(base.snapshots.length){
        const mints=base.snapshots.map(x=>x.mint);
        const sql=quoteAsOfSQL.replace('%%MINTS%%',mints.map(()=>'?').join(','));
        quoteRows=await read(db,sql,'solana','solana',...mints,
          new Date(now-3*MIN).toISOString(),stamp);
      }
      enriched=attachAsOfQuotes(base.snapshots,quoteRows,{now});
      const source=snapshotRows(enriched,base.bucket,now,base.sourceCoverage);
      for(const group of batches(source,4)){
        const q=boundInsert('goget_pre_signal_snapshots',snapshotColumns,group);
        inserted+=await boundedWrite(q.sql,...q.params);
      }
      // Prospective outcome tasks exist only for a price anchored BEFORE signal time.
      // No retrospective price substitution, no inferred missed-data equals 0 return.
      const jobs=[];
      for(const x of enriched){
        if(!x.quote)continue;
        for(const horizon of SIGNAL_WORKER_LIMITS.horizonsMinutes)
          jobs.push([x.mint,base.bucket,horizon,
            new Date(now+horizon*MIN).toISOString(),
            x.quote.pool,x.quote.priceSol,'PENDING']);
      }
      for(const group of batches(jobs,10)){
        const q=boundInsert('goget_pre_signal_outcomes',outcomeColumns,group);
        createdJobs+=await boundedWrite(q.sql,...q.params);
      }
    }
    let labeled=0,missingCoverage=0;
    const due=await read(db,outcomeSQL,'PENDING',stamp,SIGNAL_WORKER_LIMITS.maxOutcomeChecks);
    for(const o of due){
      const dueAt=Date.parse(o.due_at);
      if(!Number.isFinite(dueAt))continue;
      const until=Math.min(now,dueAt+10*MIN);
      const quotes=await read(db,
        'SELECT minute,price_sol FROM chain_radar_samples WHERE chain=? AND pool=? AND minute>=? AND minute<=? ORDER BY minute ASC LIMIT 1',
        'solana',o.pool,o.due_at,new Date(until).toISOString());
      const matched=quotes.find(q=>Number(q.price_sol)>0&&Number.isFinite(Number(q.price_sol)));
      const expired=now>=dueAt+10*MIN;
      if(!matched&&!expired)continue;
      const marketStatus=matched?'OBSERVED_MATCHED_POOL_PRICE':'MISSING_FUTURE_QUOTE_COVERAGE';
      const pct=matched?(Number(matched.price_sol)/Number(o.reference_price_sol)-1)*100:null;
      const updated=await boundedWrite(
        'UPDATE goget_pre_signal_outcomes SET status=?,checked_at=?,future_quote_minute=?,future_price_sol=?,change_pct=? WHERE mint=? AND bucket=? AND horizon_min=? AND status=?',
        marketStatus,stamp,matched?.minute??null,matched?Number(matched.price_sol):null,
        Number.isFinite(pct)?Math.round(pct*10000)/10000:null,
        o.mint,o.bucket,o.horizon_min,'PENDING');
      if(updated===1){if(matched)labeled++;else missingCoverage++;}
    }
    const summary={status:incomplete?'INCOMPLETE_SOURCE_WINDOW':'OK',
      runId:id,trigger:trigger==='cron'?'cron':'manual',at:stamp,
      observedSourceRows:rows.length,observedMints:base.observedTokenMints,
      storedSnapshots:inserted,sampledSnapshots:enriched.length,
      potentialSignalCount:enriched.filter(x=>x.sampleKind==='POTENTIAL_SIGNAL').length,
      controlCount:enriched.filter(x=>x.sampleKind==='CONTROL').length,
      freshExactPoolQuotes:enriched.filter(x=>x.quote).length,
      prospectiveOutcomeJobsCreated:createdJobs,observedOutcomes:labeled,
      missingFuturePriceCoverage:missingCoverage,
      modelCalls:0,heliusCalls:0,trades:0,paidModelCalls:0};
    await boundedWrite(
      'INSERT INTO goget_pre_signal_runs(run_id,at,trigger,status,observed_rows,stored_snapshots,summary_json) VALUES(?,?,?,?,?,?,?)',
      id,stamp,summary.trigger,summary.status,rows.length,inserted,JSON.stringify(summary));
    console.log('GOGET_PRE_EXPLOSION_RESEARCH',JSON.stringify(summary));
    return summary;
  }finally{
    try{await write(db,"UPDATE goget_pre_signal_lease SET owner='',until_ms=0 WHERE id='runner' AND owner=?",id);}
    catch{console.error('GOGET_PRE_SIGNAL_LEASE_RELEASE_UNVERIFIED');}
  }
}
async function authorized(request,secret){
  if(typeof secret!=='string'||secret.length<40)return false;
  const supplied=(request.headers.get('authorization')||'').replace(/^Bearer /,'');
  const digest=async x=>new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(x)));
  const [a,b]=await Promise.all([digest(supplied),digest(secret)]);let diff=0;
  for(let i=0;i<a.length;i++)diff|=a[i]^b[i];
  return diff===0;
}
export default {
  async fetch(request,env){
    const path=new URL(request.url).pathname;
    if(path==='/health'&&request.method==='GET')
      return json({service:'goget-pre-signal',mode:'RESEARCH_ONLY',
        cron:'FIVE_MINUTES',enabled:env?.PRE_SIGNAL_ENABLED==='true'});
    if(path!=='/run'||request.method!=='POST')return json({error:'NOT_FOUND'},404);
    if(typeof env?.PRE_SIGNAL_CONTROL_TOKEN!=='string'||env.PRE_SIGNAL_CONTROL_TOKEN.length<40)
      return json({error:'NOT_CONFIGURED'},503);
    if(!await authorized(request,env.PRE_SIGNAL_CONTROL_TOKEN))return json({error:'UNAUTHORIZED'},401);
    try{return json(await processPreSignalCycle(env));}
    catch(e){const c=exception(e);console.error('GOGET_PRE_SIGNAL_MANUAL_FAILED',c);return json({error:c},503);}
  },
  async scheduled(controller,env){
    try{await processPreSignalCycle(env,{now:Number.isFinite(controller?.scheduledTime)?controller.scheduledTime:Date.now(),trigger:'cron'});}
    catch(e){console.error('GOGET_PRE_SIGNAL_CRON_FAILED',exception(e));throw e;}
  }
};
