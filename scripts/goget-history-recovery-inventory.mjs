#!/usr/bin/env node
// Evidence discovery before historical backfill. READ ONLY; never amends original outcomes.
import {writeFile} from 'node:fs/promises';
const env=name=>{const v=process.env[name];if(!v)throw Error('MISSING_'+name);return v;};
const b64=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const code=e=>/^D1_HTTP_\d+$/.test(e?.message||'')?e.message:'AUDIT_UNVERIFIED';
async function main(){
 const account=env('CF_ACCOUNT_ID'),db=env('CF_DATABASE_ID'),token=env('CF_D1_API_TOKEN');
 const url='https://api.cloudflare.com/client/v4/accounts/'+encodeURIComponent(account)+
  '/d1/database/'+encodeURIComponent(db)+'/query';
 let queries=0;
 const read=async(sql,args=[])=>{
  if(++queries>8)throw Error('READ_BUDGET_EXCEEDED');
  const r=await fetch(url,{method:'POST',headers:{authorization:'Bearer '+token,
    'content-type':'application/json'},body:JSON.stringify({sql,params:args}),
    signal:AbortSignal.timeout(14000)});
  if(!r.ok)throw Error('D1_HTTP_'+r.status);
  const v=await r.json();
  if(v?.success!==true||v?.result?.[0]?.success!==true||
     !Array.isArray(v?.result?.[0]?.results))throw Error('D1_READ_UNVERIFIED');
  return v.result[0].results;
 };
 // Read all historical signal reference and missing outcomes within a strict bounded set.
 // Historical OHLCV can only be replayed for a pool that was already recorded at signal time.
 const missing=await read(
  "SELECT o.mint,o.bucket,o.horizon_min,o.due_at,o.pool,o.reference_price_usd,o.status,s.sample_kind,s.category,s.distinct_wallets,s.recent_signatures FROM goget_pre_signal_market_outcomes o JOIN goget_pre_signal_snapshots s ON s.mint=o.mint AND s.bucket=o.bucket WHERE o.status='MISSING_FUTURE_USD_QUOTE_COVERAGE' AND o.due_at>=? ORDER BY o.due_at ASC LIMIT 220",
  ['2026-10-30T00:00:00.000Z']);
 const statuses=await read('SELECT horizon_min,status,COUNT(*) AS n FROM goget_pre_signal_market_outcomes GROUP BY horizon_min,status ORDER BY horizon_min,status LIMIT 24');
 const signals=await read("SELECT mint,MIN(bucket) AS first_at,MAX(bucket) AS last_at,COUNT(*) AS snapshots,MAX(distinct_wallets) AS max_wallets,MAX(recent_signatures) AS max_recent_signatures FROM goget_pre_signal_snapshots WHERE sample_kind='POTENTIAL_SIGNAL' GROUP BY mint ORDER BY snapshots DESC LIMIT 80");
 const poolRows=await read("SELECT o.pool,o.mint,COUNT(*) AS n,MIN(o.due_at) AS first_due,MAX(o.due_at) AS last_due FROM goget_pre_signal_market_outcomes o WHERE o.status='MISSING_FUTURE_USD_QUOTE_COVERAGE' GROUP BY o.pool,o.mint ORDER BY n DESC LIMIT 60");
 const recoveryRows=await read("SELECT name FROM sqlite_master WHERE type='table' AND name='goget_historical_price_recovery' LIMIT 1");
 const wallet=await read("SELECT wallet,COUNT(*) AS n,MIN(observed_at) AS earliest,MAX(observed_at) AS latest FROM smart_wallet_webhook_events WHERE observed_at>=? GROUP BY wallet ORDER BY n DESC LIMIT 20",['2026-11-03T00:00:00.000Z']);
 if(missing.length>220||signals.length>80||poolRows.length>60||statuses.length>24)throw Error('READ_SHAPE_LIMIT');
 const valid=missing.filter(x=>b64.test(x.mint)&&b64.test(x.pool)&&
    Number.isFinite(Date.parse(x.due_at))&&Number(x.reference_price_usd)>0);
 const distinct=[...new Set(valid.map(x=>x.pool))];
 const grouped=Object.values(valid.reduce((o,x)=>{
    const k=x.pool+'|'+x.mint;o[k]??={pool:x.pool,mint:x.mint,rows:0,firstDue:x.due_at,lastDue:x.due_at};
    const r=o[k];r.rows++;if(r.firstDue>x.due_at)r.firstDue=x.due_at;if(r.lastDue<x.due_at)r.lastDue=x.due_at;
    return o;
 },{})).sort((a,b)=>b.rows-a.rows);
 const report={at:new Date().toISOString(),mode:'READ_ONLY_HISTORICAL_RECOVERY_INVENTORY',
    missingRowsRead:missing.length,validRows:valid.length,
    distinctPools:distinct.length,alreadyRecoveredTable:recoveryRows.length===1,
    missingRows:valid,signalMintGroups:signals,missingPoolGroups:grouped,
    marketOutcomeStatuses:statuses,watchedWalletObservations:wallet,
    limits:{d1Reads:8,missingRows:220,signalGroups:80,providerRequests:0,writes:0},
    caveat:'NOT A PROFIT ANALYSIS; outcomes unavailable unless exact-pool contemporaneous historical candles are recovered; never overwrite forward metrics'};
 await writeFile('goget-history-recovery-inventory.json',JSON.stringify(report,null,2)+'\n');
 // Public mint and pool IDs, timestamps and references, but no private keys or source JSON.
 console.log('GOGET_HISTORY_RECOVERY_INVENTORY',JSON.stringify(report));
}
main().catch(e=>{console.error('GOGET_HISTORY_RECOVERY_ERROR',code(e));process.exitCode=1;});
