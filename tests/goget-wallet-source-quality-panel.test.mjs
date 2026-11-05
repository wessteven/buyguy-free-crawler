import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {GAP_WALLETS} from '../src/goget-wallet-gap-wave.mjs';
import {WALLET_QUALITY_BOUNDS,walletSourceQuality,evaluateWalletSourceQuality}
 from '../src/goget-wallet-source-quality-panel.mjs';
import {expectedWebhookWallets} from '../src/goget-live-source-coverage.mjs';
import {evaluateUnattendedReport} from '../src/goget-unattended-acceptance.mjs';
import viewer from '../src/viewer.mjs';
const asOf='2026-11-05T06:55:00Z',at=Date.parse(asOf);
const journals=GAP_WALLETS.map((wallet,i)=>({wallet,legacy_cursor:'old-'+i,
 seed_head:'new-'+i,original_cursor_now:'old-'+i,
 old_found:1,seed_found:1,recovered:[173,887,300][i],
 original_live_matches:1,enhanced_historic_matches:[13,13,9][i],
 source_overlap:[127,153,99][i],
 status:'COMPLETE_HELIUS_SIGNATURE_BRIDGE',pages:[2,9,3][i],examined:[173,887,300][i]}));
const states=GAP_WALLETS.map(wallet=>({wallet,status:'CHECKPOINT_CONNECTED',last_checked_at:'2026-11-05T06:50:11Z'}));
const sourceCounts=GAP_WALLETS.map((wallet,i)=>({wallet,n:[130,154,100][i]}));
const decode=GAP_WALLETS.map((wallet,i)=>({wallet,n:[130,154,100][i],
 legacy_matches:1,historical_matches:[13,13,9][i],webhook_matches:[8,6,0][i]}));
const cycles=Array.from({length:4},(_,i)=>({slot_utc:new Date(Date.parse('2026-11-05T06:35:00Z')+i*300000).toISOString(),
 trigger:'cron',status:'SOURCES_ARCHIVED_GAPS_DISCLOSED',wallets_scanned:3,
 helius_calls:3,credits_reserved:30,source_gaps:0})).reverse();
const budget=[{day:'2026-11-05',reserved_credits:1880}],webhook=[{day:'2026-11-05',observed_deliveries:305}];
const market=[{sampled:300,missing_usd:130,historical_recovered:189,still_missing_usd:41}];
const marketGroups=[{status:'MISSING_FUTURE_USD_QUOTE_COVERAGE',horizon_min:60,n:130}];
const data={journals,states,cycles,sourceCounts,openGaps:[],budgets:budget,
 webhook,decode,market,marketGroups,asOf};
test('exact 3 legacy wallet bridges and 5m source cover independent truth states',()=>{
 const r=evaluateWalletSourceQuality(data);
 assert.equal(r.walletsExpected,3);
 assert.equal(r.historicalBridgesComplete,3);
 assert.equal(r.historicalRecoveryIsLiveContinuity,false);
 assert.equal(r.forwardSource.sampledCronCycles,4);
 assert.equal(r.forwardSource.completeThreeWalletCronCycles,4);
 assert.equal(r.forwardSource.missingBetweenSampledCronReceipts,0);
 assert.equal(r.wallets[1].historical.signaturesExamined,887);
 assert.equal(r.wallets[1].historical.archivedHistoricalSignatures,887);
 assert.equal(r.wallets[1].historical.legacyAnchorStillArchived,true);
 assert.equal(r.wallets[1].historical.seedHeadStillArchived,true);
 assert.equal(r.wallets[1].historical.exactOriginalRpcEventMatches,1);
 assert.equal(r.wallets[1].historical.exactHistoricalEnhancedMatches,13);
 assert.equal(r.wallets[1].historical.exactNewCloudflareOverlap,153);
 assert.equal(r.wallets[0].decoding.newSourceSignatureDenominator,130);
 assert.equal(r.wallets[0].decoding.fullyDecodedNewSourceSignaturesUnverified,true);
 assert.equal(r.marketCandles.minuteOhlcvContinuityVerified,false);
 assert.equal(r.marketCandles.stillMissingUsdInSample,41);
 assert.equal(r.status,'HISTORICAL_BRIDGES_AND_SAMPLED_FORWARD_SOURCE_OBSERVED');
 assert.equal(r.trades,0);
});
test('no backwards relabeling or false-green on incomplete bridge, stale source or missing cron',()=>{
 assert.equal(evaluateWalletSourceQuality({...data,
  journals:journals.map((j,i)=>i===1?{...j,status:'INCOMPLETE_PAGE_CAP'}:j)})
  .status,'HISTORICAL_SIGNATURE_BRIDGES_INCOMPLETE');
 assert.equal(evaluateWalletSourceQuality({...data,
  states:states.map((s,i)=>i===1?{...s,last_checked_at:'2026-11-05T05:00:00Z'}:s)})
  .status,'FORWARD_SOURCE_COVERAGE_INCOMPLETE');
 assert.equal(evaluateWalletSourceQuality({...data,cycles:[cycles[0],cycles[2],cycles[3]]})
  .forwardSource.missingBetweenSampledCronReceipts,1);
 const issue=evaluateWalletSourceQuality({...data,openGaps:[{wallet:GAP_WALLETS[0],n:1}]});
 assert.equal(issue.status,'FORWARD_SOURCE_COVERAGE_INCOMPLETE');
});
test('a single false claimed 3-wallet cycle is never counted complete',()=>{
 const bad=[{...cycles[0],wallets_scanned:2,source_gaps:1},...cycles.slice(1)];
 const r=evaluateWalletSourceQuality({...data,cycles:bad});
 assert.equal(r.forwardSource.completeThreeWalletCronCycles,3);
 assert.equal(r.status,'FORWARD_SOURCE_COVERAGE_INCOMPLETE');
});
test('unknown wallets and missing forward counts refuse a verified-scope status',()=>{
 assert.equal(evaluateWalletSourceQuality({...data,sourceCounts:sourceCounts.slice(1)})
 .status,'SCOPE_OR_D1_EVIDENCE_UNVERIFIED');
 const r=evaluateWalletSourceQuality({...data,decode:[...decode,{wallet:'unknown-wallet',n:1}]});
 assert.equal(r.status,'SCOPE_OR_D1_EVIDENCE_UNVERIFIED');
});
function mockDb(){
 const sql=[],responses=[
 journals,states,cycles,sourceCounts,[],budget,webhook,decode,market,marketGroups
 ];
 return {sql,prepare(query){const index=sql.push(query)-1;return{
  bind(...args){assert.ok(Array.isArray(args));return this;},
  async all(){return {success:true,results:responses[index]??[]};}
 }}};
}
test('dashboard source report is read only, bounded to 10 D1 reads and original three wallets',async()=>{
 const db=mockDb();
 const report=await walletSourceQuality(db,{now:at});
 assert.equal(db.sql.length,10);
 assert.equal(report.d1Reads,10);
 assert.equal(report.heliusCalls,0);
 assert.equal(report.d1Writes,0);
 assert.ok(db.sql.every(q=>/^(SELECT|WITH)\s/i.test(q)));
 assert.ok(db.sql.every(q=>/LIMIT (?:1|3|32|72|300)\b/i.test(q)));
 assert.equal(report.wallets.length,3);
 assert.deepEqual(report.wallets.map(x=>x.wallet),GAP_WALLETS);
});
test('authenticated source endpoint rejects anonymous and POST without spending D1',async()=>{
 let calls=0;
 const env={ADMIN_TOKEN:'test-dashboard-password',DB:{prepare(){calls++;throw Error('should not execute')}}};
 const anonymous=await viewer.fetch(new Request('https://go.test/api/wallet-source-quality'),env);
 assert.equal(anonymous.status,401);assert.equal(calls,0);
 const wrongMethod=await viewer.fetch(new Request('https://go.test/api/wallet-source-quality',
  {method:'POST',headers:{authorization:'Bearer test-dashboard-password'}}),env);
 assert.equal(wrongMethod.status,405);assert.equal(calls,0);
});
test('authenticated GET reports exact separate coverage; D1 errors are sanitized',async()=>{
 const headers={authorization:'Bearer test-dashboard-password'};
 const env={ADMIN_TOKEN:'test-dashboard-password',DB:mockDb()};
 const response=await viewer.fetch(new Request('https://go.test/api/wallet-source-quality',{headers}),env);
 assert.equal(response.status,200);
 const result=await response.json();
 assert.equal(result.historicalBridgesComplete,3);
 assert.equal(result.forwardSource.completeThreeWalletCronCycles,4);
 const invalid=await viewer.fetch(new Request('https://go.test/api/wallet-source-quality',{headers}),
  {ADMIN_TOKEN:env.ADMIN_TOKEN,DB:{prepare(){throw Error('secret API key leaked internally!')}}});
 assert.equal(invalid.status,503);
 assert.deepEqual(await invalid.json(),{error:'wallet_source_quality_unavailable'});
 const capped=await viewer.fetch(new Request('https://go.test/api/wallet-source-quality',{headers}),
  {ADMIN_TOKEN:env.ADMIN_TOKEN,DB:{prepare(){throw Error('daily row read limit exceeded')}}});
 assert.equal(capped.status,503);
 assert.equal((await capped.json()).error,'D1_READ_QUOTA');
});
test('new source tab content is present, on demand, explicitly separate live/historical/market',async()=>{
 const response=await viewer.fetch(new Request('https://go.test/dashboard'),{});
 const html=await response.text();
 assert.match(html,/id="walletSourceLoad"/);
 assert.match(html,/id="walletSourceSummary"/);
 assert.match(html,/api\/wallet-source-quality/);
 assert.match(html,/TRANSACTION DECODING/);
 assert.match(html,/Continuous 1-minute OHLCV coverage remains UNVERIFIED/);
 assert.match(html,/HISTORICAL BRIDGES/);
});
test('unattended subscription script demands exactly the subscribed 12 of original 14',async()=>{
 const cohort=JSON.parse(await readFile('research/smart-wallet-webhook-cohort.json','utf8'));
 const config=await readFile('wrangler.smart-wallet.toml','utf8');
 assert.equal(cohort.length,14);
 const expected=expectedWebhookWallets(cohort,config);
 assert.equal(expected.length,12);
 const script=await readFile('scripts/goget-source-control-audit.mjs','utf8');
 assert.match(script,/expectedWebhookWallets\(cohort/);
 assert.match(script,/expectedWallets:subscribed/);
 assert.doesNotMatch(script,/expectedWallets:cohort\.map/);
});
test('incomplete 72-hour acceptance stays incomplete although workflow execution succeeds',async()=>{
 const script=await readFile('scripts/goget-unattended-status.mjs','utf8');
 assert.match(script,/GOGET_UNATTENDED_EVIDENCE_INCOMPLETE/);
 assert.doesNotMatch(script,/if\(acceptance.status!=='SAMPLED_WINDOW_PASS'\)process.exitCode=1/);
 const now=Date.parse('2026-11-05T06:53:00Z');
 const window={from:new Date(now-72*3600000).toISOString(),to:new Date(now).toISOString(),
  hours:72,expectedSlots:864,observedSlots:863,missingSlots:1,
  eligibleSlots:176,degradedSlots:629,uninstrumentedSlots:58,duplicateRuns:0,
  readCapped:false,observationGate:'INCOMPLETE'};
 const result=evaluateUnattendedReport({latest:{ok:false,asOf:new Date(now).toISOString()},window},{now});
 assert.equal(result.status,'INCOMPLETE');
 assert.equal(result.continuousCoverageVerified,false);
 assert.ok(result.reasons.includes('WINDOW_DEGRADED_SLOTS'));
});

test('historical bridge completed label alone cannot pass: independent old cursor, archived old signature and new seed are required',()=>{
 for(const altered of [{original_cursor_now:'changed'},
  {old_found:0},{seed_found:0},{recovered:0}]){
  const result=evaluateWalletSourceQuality({...data,journals:journals.map((j,i)=>
   i===1?{...j,...altered}:j)});
  assert.equal(result.historicalBridgesComplete,2);
  assert.equal(result.status,'HISTORICAL_SIGNATURE_BRIDGES_INCOMPLETE');
 }
});
test('dashboard provides independently recovered overlap fields and candle status by horizon',async()=>{
 const response=await viewer.fetch(new Request('https://go.test/dashboard'),{});
 const html=await response.text();
 assert.match(html,/exactHistoricalEnhancedMatches/);
 assert.match(html,/exactNewCloudflareOverlap/);
 assert.match(html,/Both original anchors independently reverified/);
 assert.match(html,/RECORDED market outcome state/);
});
