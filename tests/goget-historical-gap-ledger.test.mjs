import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
test('historical gap ledger is read-only, reconciles all three independent evidence sources',async()=>{
 const s=await readFile('scripts/goget-historical-gap-ledger.mjs','utf8');
 for(const source of ['goget_pre_signal_market_outcomes',
   'goget_historical_price_recovery',
   'goget_historical_pool_activity_audit',
   'goget_historical_native_ratio_audit'])assert.match(s,new RegExp(source));
 assert.match(s,/originalMissingPriceOutcomes/);
 assert.match(s,/currentNewUnassessedWindows/);
 assert.match(s,/invalidHistoricalPriceRecords/);
 assert.match(s,/invalidForensicActivityRecords/);
 assert.match(s,/nativeRatioInvalid/);
 assert.match(s,/smart_wallet_helius_gap_wave_coverage/);
 assert.match(s,/smart_wallet_helius_historical_replay/);
 assert.match(s,/replayWindowCount===21/);
 assert.match(s,/replayCompletedCount===21/);
 assert.match(s,/replayJournalCount===replaySourceCount/);
 assert.match(s,/ENHANCED_REPLAY_WINDOWS_COMPLETE/);
 assert.match(s,/COVERAGE_JOURNAL_MISMATCH/);
 assert.match(s,/sourceTotalAcrossHistoricalWaves/);
 assert.match(s,/RECONCILED_NEW_FORWARD_GAPS_PENDING/);
 assert.match(s,/RECONCILED_ALL_CURRENT_HISTORICAL_GAPS/);
 assert.match(s,/usd_price_reconstructed/);
 assert.match(s,/if\(\+\+n>7\|\|!sql\.trim\(\)\.startsWith\('SELECT'\)\)/);
 assert.doesNotMatch(s,/(?:UPDATE|DELETE|ALTER|DROP)\s+(?:goget_|smart_wallet_)/i);
});
