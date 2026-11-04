import test from 'node:test';
import assert from 'node:assert/strict';
import {assessWebhookBudget,WEBHOOK_BUDGET_GUARD} from '../src/smart-wallet-budget.mjs';
const check=(lastHour,dayAttempted,dayDeliveryCredits)=>
  assessWebhookBudget({lastHour,dayAttempted,dayDeliveryCredits});
test('new 20,000 daily webhook credit estimate replaces old 2,200 storage shutoff',()=>{
 assert.equal(WEBHOOK_BUDGET_GUARD.maxUtcDayEstimatedWebhookCredits,20000);
 assert.equal(WEBHOOK_BUDGET_GUARD.maxUtcDayAttemptedReservations,20000);
 assert.equal(check(350,2200,2200).action,'MONITOR');
 assert.equal(check(2000,19800,19999).action,'MONITOR');
});
test('no silent restrictive 350/hour threshold; daily budget remains binding',()=>{
 const result=check(10000,5000,5000);
 assert.equal(result.safe,true);
 assert.equal(result.action,'MONITOR');
 assert.equal(result.reasons.length,0);
});
test('20,000 authenticated delivery estimates suspend exactly at the threshold',()=>{
 const hit=check(500,2000,20000);
 assert.equal(hit.safe,false);
 assert.equal(hit.action,'SUSPEND_OWN_HELIUS_WEBHOOK');
 assert.ok(hit.reasons.includes('DAILY_ESTIMATED_WEBHOOK_CREDITS'));
});
test('20,000 normalized D1 attempted writes also suspends without pretending they are provider events',()=>{
 const hit=check(100,20000,10000);
 assert.equal(hit.action,'SUSPEND_OWN_HELIUS_WEBHOOK');
 assert.ok(hit.reasons.includes('DAILY_NORMALIZED_STORAGE_RESERVATIONS'));
});
test('invalid or missing delivery metering fails closed before creating a subscription',()=>{
 assert.equal(assessWebhookBudget({lastHour:1,dayAttempted:100}).action,'UNKNOWN_DATA_MANUAL_REVIEW');
 assert.equal(check(0,10,-1).safe,false);
 assert.equal(check(NaN,10,5).safe,false);
});
test('fresh UTC day zeroes usage only from new D1 day record; no automatic unlatching',()=>{
 assert.equal(check(0,0,0).action,'MONITOR');
 assert.equal(check(0,20000,20000).action,'SUSPEND_OWN_HELIUS_WEBHOOK');
 assert.match(check(0,0,0).source,/NOT_HELIUS_ACCOUNT_BILLING/);
});
