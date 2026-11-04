// Helius Enhanced webhook deliveries are documented at one credit per event.
// This GOGET-specific budget is an ESTIMATE from authenticated incoming payloads,
// not account-wide Helius metering. Other projects, API requests, webhook management,
// retries and delayed scheduled guard runs can consume additional provider credits.
export const WEBHOOK_BUDGET_GUARD=Object.freeze({
  maxUtcDayEstimatedWebhookCredits:20000,
  maxUtcDayAttemptedReservations:20000
});
export function assessWebhookBudget({lastHour,dayAttempted,dayDeliveryCredits}={}){
  if(!Number.isSafeInteger(lastHour)||lastHour<0||
    !Number.isSafeInteger(dayAttempted)||dayAttempted<0||
    !Number.isSafeInteger(dayDeliveryCredits)||dayDeliveryCredits<0)
    return {safe:false,action:'UNKNOWN_DATA_MANUAL_REVIEW',reasons:['COUNTS_NOT_VERIFIED']};
  const reasons=[];
  // No separate low hourly auto-suspension: user's budget is 20,000/day.
  // Keep hourly observation count for reporting and burst diagnosis only.
  if(dayDeliveryCredits>=WEBHOOK_BUDGET_GUARD.maxUtcDayEstimatedWebhookCredits)
    reasons.push('DAILY_ESTIMATED_WEBHOOK_CREDITS');
  // A transaction may mention two watched wallets: preserve normalized source
  // D1 storage cap without confusing it with provider-delivered event credits.
  if(dayAttempted>=WEBHOOK_BUDGET_GUARD.maxUtcDayAttemptedReservations)
    reasons.push('DAILY_NORMALIZED_STORAGE_RESERVATIONS');
  return {safe:!reasons.length,
    action:reasons.length?'SUSPEND_OWN_HELIUS_WEBHOOK':'MONITOR',reasons,
    thresholds:WEBHOOK_BUDGET_GUARD,
    source:'LOCAL_AUTHENTICATED_DELIVERIES_ESTIMATE_NOT_HELIUS_ACCOUNT_BILLING'};
}
