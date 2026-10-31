import test from 'node:test';
import assert from 'node:assert/strict';
import {assessWebhookBudget,WEBHOOK_BUDGET_GUARD} from '../src/smart-wallet-budget.mjs';
test('unknown usage does not authorize spending expansion or automatic deletion',()=>{
 const r=assessWebhookBudget({lastHour:null,dayAttempted:0});
 assert.equal(r.action,'UNKNOWN_DATA_MANUAL_REVIEW');assert.equal(r.safe,false);
});
test('under-budget webhook is safe with explicit cutoff',()=>{
 assert.equal(assessWebhookBudget({lastHour:1,dayAttempted:90}).action,'MONITOR');
});
test('hour or day threshold suspends exact GOGET webhook',()=>{
 const h=assessWebhookBudget({lastHour:WEBHOOK_BUDGET_GUARD.maxRecentHourEvents,dayAttempted:20});
 const d=assessWebhookBudget({lastHour:0,dayAttempted:WEBHOOK_BUDGET_GUARD.maxUtcDayAttemptedReservations});
 assert.equal(h.action,'SUSPEND_OWN_HELIUS_WEBHOOK');
 assert.equal(d.action,'SUSPEND_OWN_HELIUS_WEBHOOK');
 assert.ok(h.reasons.includes('HOURLY_EVENT_VELOCITY'));
 assert.ok(d.reasons.includes('DAILY_ATTEMPTED_STORAGE_QUOTA'));
});
