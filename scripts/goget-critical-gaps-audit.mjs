#!/usr/bin/env node
// Critical GOGET failure triage: bounded D1 reads, no Helius, no Gecko, no writes.
// Read independently; do not turn a missing archive or sparse quote into green.
import {writeFile} from 'node:fs/promises';
const need=k=>{const x=process.env[k];if(!x)throw Error('TRIAGE_MISSING_'+k);return x};
const u='https://api.cloudflare.com/client/v4/accounts/'+encodeURIComponent(need('CF_ACCOUNT_ID'))+
'/d1/database/'+encodeURIComponent(need('CF_DATABASE_ID'))+'/query';
const key=need('CF_D1_API_TOKEN'),now=new Date().toISOString(),from=new Date(Date.now()-72*3600000).toISOString();
let reads=0;
async function q(sql,args=[]){
 if(++reads>10||!/^(SELECT|WITH)\s/i.test(sql))throw Error('TRIAGE_READ_LIMIT');
 const r=await fetch(u,{method:'POST',headers:{authorization:'Bearer '+key,'content-type':'application/json'},
  body:JSON.stringify({sql,params:args}),signal:AbortSignal.timeout(18000)});
 if(!r.ok)throw Error('TRIAGE_HTTP_'+r.status+'_SQL_'+sql.slice(0,62).replace(/[^A-Za-z0-9]+/g,'_'));
 const j=await r.json(),v=j?.result?.[0];
 if(j?.success!==true||v?.success!==true||!Array.isArray(v.results))throw Error('TRIAGE_D1_UNVERIFIED');
 return v.results;
}
const report={asOf:now,scope:'12_HELIUS_WEBHOOK_AND_3_CLOUDFLARE_RPC_PLUS_MARKET',reads:0,
 heliusCalls:0,marketCalls:0,d1Writes:0,trades:0,exactStatus:'EVIDENCE_INCOMPLETE'};
try{
 const [rawHealth,rawBudget,archiveSample,delivery,normalized,source,fast,marketMissing,marketRecovered]=await Promise.all([
  q('SELECT day,attempted_records,recovered_records,degraded_requests,still_failed_records,failed_batches,last_error_code,last_at FROM smart_wallet_webhook_raw_health ORDER BY day DESC LIMIT 4'),
  q('SELECT day,bytes_reserved FROM smart_wallet_webhook_raw_budget ORDER BY day DESC LIMIT 4'),
  q(`WITH recent AS (SELECT wallet,signature,observed_at FROM smart_wallet_webhook_events
     WHERE observed_at>=? ORDER BY observed_at DESC LIMIT 2400),
    uniq AS (SELECT signature,MAX(observed_at) AS observed_at FROM recent GROUP BY signature)
   SELECT COUNT(*) AS sampled_unique,MIN(observed_at) AS oldest,
     MAX(observed_at) AS newest,
     SUM(CASE WHEN r.signature IS NULL THEN 1 ELSE 0 END) AS no_original_raw,
     SUM(CASE WHEN r.signature IS NOT NULL THEN 1 ELSE 0 END) AS original_raw
   FROM uniq LEFT JOIN smart_wallet_webhook_raw r ON r.signature=uniq.signature`,[from]),
  q('SELECT day,observed_deliveries,last_at FROM smart_wallet_webhook_credit_estimates ORDER BY day DESC LIMIT 3'),
  q('SELECT MAX(observed_at) AS last_normalized,COUNT(*) AS sampled FROM (SELECT observed_at FROM smart_wallet_webhook_events WHERE observed_at>=? ORDER BY observed_at DESC LIMIT 2400)',[from]),
  q('SELECT slot_utc,status,wallets_scanned,helius_calls,credits_reserved,source_gaps FROM goget_rpc_source_cycles ORDER BY slot_utc DESC LIMIT 6'),
  q("SELECT token,expires_at FROM leases WHERE name='fast-radar:trial-proof' LIMIT 1"),
  q("SELECT horizon_min,COUNT(*) AS n FROM (SELECT horizon_min FROM goget_pre_signal_market_outcomes WHERE status='MISSING_FUTURE_USD_QUOTE_COVERAGE' ORDER BY due_at DESC LIMIT 500) GROUP BY horizon_min ORDER BY horizon_min"),
  q('SELECT COUNT(*) AS n FROM (SELECT mint FROM goget_historical_price_recovery ORDER BY recovered_at DESC LIMIT 500)')
 ]);
 report.rawHealth=rawHealth;report.rawBudget=rawBudget;
 report.archiveSample=archiveSample[0]??null;
 report.providerDeliveryEstimate=delivery;
 report.lastNormalized=normalized[0]??null;
 report.forwardSourceRecent=source;
 report.marketMissingByHorizonSample=marketMissing;
 report.historicalPriceRecoveredSample=marketRecovered[0]??null;
 if(fast.length===1){
  let item;try{item=JSON.parse(fast[0].token)}catch{item={error:'UNPARSEABLE_PERSISTED_FAST_RADAR'}};
  report.fastRadar={
   leaseExpired:Date.parse(now)>Number(fast[0].expires_at),
   mode:item.mode??null,enabled:item.enabled??null,error:item.error??null,
   supportedPoolTargets:Array.isArray(item.targets)?item.targets.length:null,
   targetIdentifiers:(item.targets||[]).slice(0,5).map(x=>({chain:x.chain,pool:x.pool,assetKey:x.asset_key})),
   unsupported:(item.unsupported||[]).slice(0,7),
   registrySize:Array.isArray(item.registry)?item.registry.length:null,
   updatedQuotes:item.updated_quotes??null,sourceSlot:item.current_slot??null,
   lastTick:item.last_tick??null,selectionRowsRead:item.selection_rows_read??null,
   providers:item.providers??{},
   proofTicks:(item.proof_ticks||[]).slice(-7),
   snapshotQuotes:(item.quotes||[]).slice(0,5).map(x=>({pool:x.pool,assetKey:x.asset_key,
    receivedAt:x.received_at,slot:x.slot,pricePositive:Number(x.price_sol??x.price)>0})),
   lastSampleRowsWritten:item.last_sample_rows_written??null,
   rpcAttempted:item.metrics?.rpc_calls??null
  };
 }else report.fastRadar={status:'NO_RECORDED_TRIAL_LEASE'};
 report.reads=reads;
 console.log('GOGET_CRITICAL_GAP_TRIAGE',JSON.stringify(report));
 await writeFile('goget-critical-gap-triage.json',JSON.stringify(report,null,2)+'\n');
}catch(e){
 report.reads=reads;
 report.error=/^TRIAGE_[A-Z0-9_]+$/.test(e?.message||'')?e.message:'PRODUCTION_SOURCE_UNKNOWN';
 console.error('GOGET_CRITICAL_GAP_TRIAGE_FAILED',JSON.stringify(report));process.exitCode=1;
}
