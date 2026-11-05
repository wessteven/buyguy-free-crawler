// Authenticated dashboard only: bounded, read-only D1 evidence for 3 historic RPC bridges
// and Cloudflare 5-minute source cycles. No Helius RPC, market providers, orders or writes.
import {GAP_WALLETS} from './goget-wallet-gap-wave.mjs';
export const WALLET_QUALITY_BOUNDS=Object.freeze({
  wallets:3,maxD1Reads:10,cronRows:72,marketRows:300,
  maxGroupedMarketRows:32,heliusCalls:0,trades:0
});
const number=x=>Number.isSafeInteger(Number(x))&&Number(x)>=0?Number(x):null;
const age=(at,now)=>{
 const t=Date.parse(at||'');return Number.isFinite(t)&&t<=now?Math.ceil((now-t)/60000):null;
};
function requireRows(results){
 if(results?.success!==true||!Array.isArray(results.results))
  throw Error('WALLET_SOURCE_D1_READ_UNVERIFIED');
 return results.results;
}
async function read(db,sql,params,used){
 if(++used.count>WALLET_QUALITY_BOUNDS.maxD1Reads)throw Error('WALLET_SOURCE_READ_CAP');
 const stmt=db.prepare(sql);
 return requireRows(await stmt.bind(...params).all());
}
export function evaluateWalletSourceQuality({journals,states,cycles,sourceCounts,openGaps,
 budgets,webhook,decode,market,marketGroups,asOf}){
 const arrays=[journals,states,cycles,sourceCounts,openGaps,budgets,webhook,decode,market,marketGroups];
 if(!arrays.every(Array.isArray)||journals.length>3||states.length>3||
   cycles.length>WALLET_QUALITY_BOUNDS.cronRows||!Number.isFinite(Date.parse(asOf)))
  throw Error('WALLET_SOURCE_INPUT_INVALID');
 const now=Date.parse(asOf),indexed=a=>new Map(a.map(x=>[x.wallet,x]));
 const J=indexed(journals),S=indexed(states),T=indexed(sourceCounts),
       G=indexed(openGaps),D=indexed(decode);
 const unexpected=[...new Set([...J.keys(),...S.keys(),...T.keys(),...G.keys(),...D.keys()])]
  .filter(x=>!GAP_WALLETS.includes(x));
 const wallets=GAP_WALLETS.map(wallet=>{
  const j=J.get(wallet),s=S.get(wallet),t=T.get(wallet),g=G.get(wallet),d=D.get(wallet);
  const anchorsVerified=!!j&&j.status==='COMPLETE_HELIUS_SIGNATURE_BRIDGE'&&
    j.legacy_cursor!==null&&j.seed_head!==null&&
    j.original_cursor_now===j.legacy_cursor&&
    number(j.old_found)===1&&number(j.seed_found)===1&&
    number(j.recovered)>0;
  return {wallet,
   historical:{state:j?.status??'NOT_VERIFIED',bridgeComplete:anchorsVerified,
    originalCursor:j?.legacy_cursor??null,seedSignature:j?.seed_head??null,
    pagesRead:number(j?.pages),signaturesExamined:number(j?.examined),
    archivedHistoricalSignatures:number(j?.recovered),
    originalCursorStillPreserved:j?.original_cursor_now===j?.legacy_cursor,
    legacyAnchorStillArchived:number(j?.old_found)===1,
    seedHeadStillArchived:number(j?.seed_found)===1,
    exactOriginalRpcEventMatches:number(j?.original_live_matches),
    exactHistoricalEnhancedMatches:number(j?.enhanced_historic_matches),
    exactNewCloudflareOverlap:number(j?.source_overlap),
    recoveryJournalIsRetrospective:true},
   forward:{state:s?.status??'NO_CHECKPOINT',lastCheckedAt:s?.last_checked_at??null,
     lastCheckedAgeMinutes:age(s?.last_checked_at,now),
     archivedSignatures:number(t?.n),unresolvedGapWindows:number(g?.n??0),
     recordType:'CONFIRMED_SIGNATURE_RECEIPTS_NOT_DECODED_TRANSACTIONS'},
   decoding:{newSourceSignatureDenominator:number(d?.n),
    originalRpcDecodedMatches:number(d?.legacy_matches),
    historicalEnhancedParsedMatches:number(d?.historical_matches),
    liveEnhancedWebhookMatches:number(d?.webhook_matches),
    fullyDecodedNewSourceSignaturesUnverified:true,
    pricesAndOneMinuteCandlesNotMeasured:true}
  };
 });
 const cron=cycles.filter(x=>x.trigger==='cron');
 let gaps=0,maxMin=null,prior=null;
 for(const c of [...cron].reverse()){
  const when=Date.parse(c.slot_utc||'');
  if(!Number.isFinite(when))throw Error('WALLET_SOURCE_CRON_TIME_INVALID');
  if(prior!==null){
   const d=when-prior;if(d<0)throw Error('WALLET_SOURCE_CRON_ORDER_INVALID');
   gaps+=Math.max(0,Math.round(d/300000)-1);
   maxMin=Math.max(maxMin??0,Math.round(d/60000));
  }
  prior=when;
 }
 const full=cron.filter(x=>x.status==='SOURCES_ARCHIVED_GAPS_DISCLOSED'&&
  number(x.wallets_scanned)===3&&number(x.helius_calls)===3&&
  number(x.credits_reserved)===30&&number(x.source_gaps)===0).length;
 const currentDay=asOf.slice(0,10),rpcToday=budgets.find(x=>x.day===currentDay),
   webhookToday=webhook.find(x=>x.day===currentDay),m=market[0]??{};
 const marketSample=number(m.sampled);
 const validSample=marketSample!==null&&marketSample<=WALLET_QUALITY_BOUNDS.marketRows;
 const marketBreakdown=marketGroups.map(x=>({
  outcomeStatus:x.status??'UNKNOWN',horizonMinutes:number(x.horizon_min),
  rows:number(x.n)}));
 const allHistorical=wallets.every(x=>x.historical.bridgeComplete);
 const allForward=wallets.every(x=>x.forward.state==='CHECKPOINT_CONNECTED'&&
  x.forward.lastCheckedAgeMinutes!==null&&x.forward.lastCheckedAgeMinutes<=15);
 const status=unexpected.length||wallets.some(x=>x.forward.archivedSignatures===null)||
  !validSample?'SCOPE_OR_D1_EVIDENCE_UNVERIFIED':
  !allHistorical?'HISTORICAL_SIGNATURE_BRIDGES_INCOMPLETE':
  !allForward||full<cron.length||gaps>0||
   wallets.some(x=>x.forward.unresolvedGapWindows>0)?
    'FORWARD_SOURCE_COVERAGE_INCOMPLETE':'HISTORICAL_BRIDGES_AND_SAMPLED_FORWARD_SOURCE_OBSERVED';
 return {asOf,status,walletsExpected:3,wallets,unrecognizedSourceWallets:unexpected,
  historicalBridgesComplete:wallets.filter(x=>x.historical.bridgeComplete).length,
  historicalRecoveryIsLiveContinuity:false,forwardSource:{
   sampledCronCycles:cron.length,completeThreeWalletCronCycles:full,
   missingBetweenSampledCronReceipts:gaps,
   longestObservedIntervalMinutes:maxMin,
   lastRecordedCronAt:cron[0]?.slot_utc??null,
   lastRecordedCronAgeMinutes:age(cron[0]?.slot_utc,now),
   cronSampleCap:WALLET_QUALITY_BOUNDS.cronRows,
   note:'Recent recorded D1 cycles are not chain-complete and cannot validate pre-baseline intervals.'},
  budgets:{utcDay:currentDay,allRpcReserved:number(rpcToday?.reserved_credits),
   estimatedWebhookDelivered:number(webhookToday?.observed_deliveries),
   rpcDailyCap:9000,webhookOriginalGuard:20000,
   accountWideActualCreditsUnavailable:true},
  decodedTransactions:{denominator:'NEW_SOURCE_CONFIRMED_SIGNATURE_RECEIPTS',
   note:'Matching a signature in an older decoded/Enhanced table proves exact identity only. Nonmatches are NOT necessarily missing transactions; full decoded getTransaction coverage is unverified.'},
  marketCandles:{outcomeSampled:marketSample,
   missingFutureUsdStatusRows:number(m.missing_usd),
   exactHistoricalCandleMatches:number(m.historical_recovered),
   stillMissingUsdInSample:number(m.still_missing_usd),
   outcomeStatuses:marketBreakdown,
   minuteOhlcvContinuityVerified:false,
   note:'Historical candle close matches are retrospective, not a raw continuous 1-minute OHLCV series, executable prices, or wallet-specific trade PnL.'},
  d1Reads:WALLET_QUALITY_BOUNDS.maxD1Reads,
  heliusCalls:0,d1Writes:0,trades:0,
  limitations:[
   'Three original pilot RPC wallets only; does not replace the independently audited 12-wallet webhook roster.',
   'Historical signature bridges independently require saved original cursor equality, archived old-signature and archived seed-signature identities; do not relabel as forward live observations.',
   'Source archive retains signatures/slots/status, not a decoded transaction body or 1-minute candles.',
   'A signed wallet action and a profitable buy cannot be inferred from source signature counts.',
   'Latest 72 recorded cycles and 300 sampled market outcomes; all-time/whole-chain coverage is not certified.',
   'Helius estimated reservations are local, not provider account billing.'
  ]};
}
export async function walletSourceQuality(db,{now=Date.now()}={}){
 if(!db||!Number.isFinite(now))throw Error('WALLET_SOURCE_DB_MISSING');
 const w=GAP_WALLETS,day=new Date(now).toISOString().slice(0,10),used={count:0};
 const [journals,states,cycles,sourceCounts,openGaps,budgets,webhook,decode,market,marketGroups]
  =await Promise.all([
   read(db,[
    'SELECT j.wallet,j.legacy_cursor,j.seed_head,j.status,j.pages,j.examined,',
    'l.last_signature AS original_cursor_now,',
    '(SELECT COUNT(*) FROM goget_legacy_rpc_replay_signatures a WHERE a.wallet=j.wallet AND a.signature=j.legacy_cursor) AS old_found,',
    '(SELECT COUNT(*) FROM goget_rpc_source_signatures b WHERE b.wallet=j.wallet AND b.signature=j.seed_head) AS seed_found,',
    '(SELECT COUNT(*) FROM goget_legacy_rpc_replay_signatures c WHERE c.wallet=j.wallet) AS recovered,',
    '(SELECT COUNT(*) FROM goget_legacy_rpc_replay_signatures d JOIN smart_wallet_live_events e ON e.wallet=d.wallet AND e.signature=d.signature WHERE d.wallet=j.wallet) AS original_live_matches,',
    '(SELECT COUNT(*) FROM goget_legacy_rpc_replay_signatures d JOIN smart_wallet_helius_historical_replay h ON h.wallet=d.wallet AND h.signature=d.signature WHERE d.wallet=j.wallet) AS enhanced_historic_matches,',
    '(SELECT COUNT(*) FROM goget_legacy_rpc_replay_signatures d JOIN goget_rpc_source_signatures x ON x.wallet=d.wallet AND x.signature=d.signature WHERE d.wallet=j.wallet) AS source_overlap',
    'FROM goget_legacy_rpc_replay_journal j',
    'LEFT JOIN smart_wallet_live_cursors l ON l.wallet=j.wallet',
    'WHERE j.wallet IN (?,?,?) LIMIT 3'
   ].join(' '),w,used),
   read(db,'SELECT wallet,status,last_checked_at FROM goget_rpc_source_wallets WHERE wallet IN (?,?,?) LIMIT 3',w,used),
   read(db,'SELECT slot_utc,trigger,status,wallets_scanned,helius_calls,credits_reserved,source_gaps FROM goget_rpc_source_cycles ORDER BY slot_utc DESC LIMIT 72',[],used),
   read(db,'SELECT wallet,COUNT(*) AS n FROM goget_rpc_source_signatures WHERE wallet IN (?,?,?) GROUP BY wallet LIMIT 3',w,used),
   read(db,"SELECT wallet,COUNT(*) AS n FROM goget_rpc_source_gaps WHERE status='UNRESOLVED' AND wallet IN (?,?,?) GROUP BY wallet LIMIT 3",w,used),
   read(db,'SELECT day,reserved_credits FROM goget_rpc_source_budget WHERE day=? LIMIT 1',[day],used),
   read(db,'SELECT day,observed_deliveries FROM smart_wallet_webhook_credit_estimates WHERE day=? LIMIT 1',[day],used),
   read(db,'SELECT s.wallet,COUNT(*) AS n,SUM(CASE WHEN l.signature IS NOT NULL THEN 1 ELSE 0 END) AS legacy_matches,SUM(CASE WHEN h.signature IS NOT NULL THEN 1 ELSE 0 END) AS historical_matches,SUM(CASE WHEN e.signature IS NOT NULL THEN 1 ELSE 0 END) AS webhook_matches FROM goget_rpc_source_signatures s LEFT JOIN smart_wallet_live_events l ON l.wallet=s.wallet AND l.signature=s.signature LEFT JOIN smart_wallet_helius_historical_replay h ON h.wallet=s.wallet AND h.signature=s.signature LEFT JOIN smart_wallet_webhook_events e ON e.wallet=s.wallet AND e.signature=s.signature WHERE s.wallet IN (?,?,?) GROUP BY s.wallet LIMIT 3',w,used),
   read(db,"WITH recent AS (SELECT mint,bucket,horizon_min,status,due_at FROM goget_pre_signal_market_outcomes ORDER BY due_at DESC LIMIT 300) SELECT COUNT(*) AS sampled,SUM(CASE WHEN x.status='MISSING_FUTURE_USD_QUOTE_COVERAGE' THEN 1 ELSE 0 END) AS missing_usd,SUM(CASE WHEN r.mint IS NOT NULL THEN 1 ELSE 0 END) AS historical_recovered,SUM(CASE WHEN x.status='MISSING_FUTURE_USD_QUOTE_COVERAGE' AND r.mint IS NULL THEN 1 ELSE 0 END) AS still_missing_usd FROM recent x LEFT JOIN goget_historical_price_recovery r ON x.mint=r.mint AND x.bucket=r.bucket AND x.horizon_min=r.horizon_min",[],used),
   read(db,'SELECT status,horizon_min,COUNT(*) AS n FROM (SELECT status,horizon_min FROM goget_pre_signal_market_outcomes ORDER BY due_at DESC LIMIT 300) GROUP BY status,horizon_min ORDER BY n DESC LIMIT 32',[],used)
 ]);
 const report=evaluateWalletSourceQuality({journals,states,cycles,sourceCounts,openGaps,
  budgets,webhook,decode,market,marketGroups,asOf:new Date(now).toISOString()});
 report.d1Reads=used.count;
 return report;
}
