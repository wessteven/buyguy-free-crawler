import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
test('historical replay never rewrites prospective price outcomes or promotes trades',async()=>{
 const script=await readFile('scripts/goget-historical-price-recover.mjs','utf8');
 const schema=await readFile('sql/goget-historical-price-recovery.sql','utf8');
 assert.match(script,/status='MISSING_FUTURE_USD_QUOTE_COVERAGE'/);
 assert.match(script,/INSERT OR IGNORE INTO goget_historical_price_recovery/);
 assert.doesNotMatch(script,/UPDATE goget_pre_signal_market_outcomes/i);
 assert.doesNotMatch(script,/DELETE FROM goget_pre_signal_market_outcomes/i);
 assert.match(schema,/PRIMARY KEY\(mint,bucket,horizon_min\)/);
 assert.match(script,/historicalOnly:true,heliusCalls:0,trades:0/);
 assert.match(script,/truncatedByRowCap:totalMissing>rows.length/);
 assert.match(script,/unattemptedPairs/);
});
