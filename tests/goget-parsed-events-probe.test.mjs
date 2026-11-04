import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
test('Helius Parsed Events schema probe uses one bounded immutable exact signature read',async()=>{
 const s=await readFile('scripts/goget-parsed-events-probe.mjs','utf8');
 assert.match(s,/https:\/\/mainnet\.helius-rpc\.com\/v1\/parsed-events\/transactions/);
 assert.match(s,/JSON\.stringify\(\{transactions:signatures\}\)/);
 assert.match(s,/ORDER BY a\.due_at LIMIT 1/);
 assert.match(s,/signatures\.length>3/);
 assert.match(s,/RESPONSE_TOO_LARGE/);
 assert.doesNotMatch(s,/UPDATE goget_pre_signal_market_outcomes/i);
 assert.doesNotMatch(s,/INSERT INTO goget_historical_price_recovery/i);
 assert.doesNotMatch(s,/console\.log\(.+payload\)/i);
});
