import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
test('historical native ratio collector is bounded, distinct and cannot change forward USD outcomes',async()=>{
 const s=await readFile('scripts/goget-historical-native-ratio.mjs','utf8');
 const schema=await readFile('sql/goget-historical-native-ratio.sql','utf8');
 assert.match(s,/calls>=8/);
 assert.match(s,/a.classification='HELIUS_LABELED_SWAP_POOL_AND_MINT_HINT'/);
 assert.match(s,/signature===s/);
 assert.match(s,/INTO goget_historical_native_ratio_audit/);
 assert.doesNotMatch(s,/UPDATE goget_pre_signal_market_outcomes/i);
 assert.doesNotMatch(s,/UPDATE goget_historical_price_recovery/i);
 assert.doesNotMatch(s,/INSERT INTO smart_wallet_webhook_events/i);
 assert.match(s,/usdPricesReconstructed:0/);
 assert.match(schema,/usd_price_reconstructed INTEGER NOT NULL DEFAULT 0/);
 assert.match(schema,/PRIMARY KEY\(mint,bucket,horizon_min\)/);
});
