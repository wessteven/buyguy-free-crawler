import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
test('incremental recovery selects ONLY source rows absent from both historical repairs',async()=>{
 const source=await readFile('scripts/goget-historical-price-recover.mjs','utf8');
 assert.match(source,/LEFT JOIN goget_historical_price_recovery p ON p\.mint=o\.mint/);
 assert.match(source,/LEFT JOIN goget_historical_pool_activity_audit a ON a\.mint=o\.mint/);
 assert.match(source,/p\.mint IS NULL AND a\.mint IS NULL ORDER BY o\.due_at ASC/);
 assert.match(source,/preexistingHistoricalPrices:preexistingPrices/);
 assert.match(source,/preexistingForensicClassifications:preexistingForensics/);
 assert.match(source,/unassessedAtStart/);
 assert.match(source,/truncatedByRowCap:unassessedAtStart>rows\.length/);
 assert.match(source,/remainingUnassessedFromThisPass=unassessedAtStart-report\.matched/);
 assert.match(source,/sourceReconciliationValid/);
 assert.match(source,/INSERT OR IGNORE INTO goget_historical_price_recovery/);
 assert.doesNotMatch(source,/(?:UPDATE|DELETE|ALTER|DROP)\s+(?:goget_pre_signal_market_outcomes|smart_wallet_live_cursors)/i);
});
