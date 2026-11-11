// Offline, deterministic GOGET micro-acceleration replay of existing Night Lab data.
// No RPC/API calls, D1 writes, accounts or credential access; historical only.
import {readFileSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
import {analyzeMicroAcceleration} from '../src/micro-acceleration-research.mjs';
const cases=[
 {label:'WISP',path:'data/night-lab/2026-10-20/2026-10-20T1518Z-cycle11-wisp-paginated-raw-swaps.json',field:'observations'},
 {label:'PIKA',path:'data/night-lab/2026-10-20/2026-10-20T1611Z-cycle12-pika-sampled-trades.json',field:'events'}
];
const result={mode:'READ_ONLY_HISTORICAL_EVENT_REPLAY',at:new Date().toISOString(),
 source:'Previously archived Helius enhanced transactions from 20 Oct 2026',
 thresholdStatus:'EXPERIMENTAL_NOT_CALIBRATED',cases:[]};
for(const item of cases){
 const raw=JSON.parse(readFileSync(item.path,'utf8'));
 const receipt=raw.retrieved_utc??raw.retrieved_at_utc??null;
 const report=analyzeMicroAcceleration(raw[item.field],raw.windows,{
  receivedAt:receipt,source:'HELIUS_NIGHT_LAB_ARCHIVE'});
 result.cases.push({
  symbol:item.label,pool:raw.pool,mint:raw.mint,
  historicFirstRecordedAt:raw.earliest_timestamp??null,
  originalArchiveRetrievedAt:receipt,
  sourceFile:item.path,rawEvents:report.rawCount,
  normalizedEvents:report.normalizedCount,duplicates:report.duplicates,
  conflicts:report.conflicts,rejected:report.rejected,
  confirmedCoverageWindows:report.sourceCompletenessWindows,
  evaluated30sWindows:report.evaluated30sWindows,
  rawHypothesisHits:report.rawHypothesisHits,episodeCount:report.episodeCount,
  researchSignals:report.episodes,
  sourceCoverage:'ONLY_REPORTED_PAGINATION_COMPLETE_FIVE_MINUTE_INTERVALS',
  observedLive:false,executableTradeVerified:false
 });
 console.log('MICRO_REPLAY',JSON.stringify({symbol:item.label,
  windows:report.evaluated30sWindows,hits:report.rawHypothesisHits,
  episodes:report.episodeCount,earliestChainOpportunity:
    report.episodes[0]?.earliestCausalCalculationAt??null,
  archiveReceipt:receipt}));
}
result.caveats=[
 'This is replay on 20 Oct archive: observed data availability was later than the underlying chain timestamps.',
 'Earliest causal calculation timestamps are NOT actual GOGET historical notification timestamps.',
 'Fee-payer diversity does not establish independent beneficial buyers; wash trading cannot be excluded.',
 'Only 5m windows flagged complete by recorded source are eligible. No gap filling.',
 'No mint/pool birth proof, liquid executable exit, SOL quote freshness or profitability inferred.',
 'Thresholds are initial hypotheses, not calibrated on a representative cohort.'
];
await mkdir('micro-acceleration-proof',{recursive:true});
await writeFile('micro-acceleration-proof/report.json',JSON.stringify(result,null,2)+'\n');
if(result.cases.some(x=>x.evaluated30sWindows<10))throw Error('INSUFFICIENT_RECORDED_COMPLETE_WINDOWS');
