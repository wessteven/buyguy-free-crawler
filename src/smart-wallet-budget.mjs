// Helius credit protection for GOGET unvetted-wallet research, not a billing guarantee.
export const WEBHOOK_BUDGET_GUARD=Object.freeze({
  maxRecentHourEvents:350,
  maxUtcDayAttemptedReservations:2200
});
export function assessWebhookBudget({lastHour,dayAttempted}={}){
  if(!Number.isSafeInteger(lastHour)||lastHour<0||
    !Number.isSafeInteger(dayAttempted)||dayAttempted<0)
    return {safe:false,action:'UNKNOWN_DATA_MANUAL_REVIEW',reasons:['COUNTS_NOT_VERIFIED']};
  const reasons=[];
  if(lastHour>=WEBHOOK_BUDGET_GUARD.maxRecentHourEvents)reasons.push('HOURLY_EVENT_VELOCITY');
  if(dayAttempted>=WEBHOOK_BUDGET_GUARD.maxUtcDayAttemptedReservations)reasons.push('DAILY_ATTEMPTED_STORAGE_QUOTA');
  return {safe:!reasons.length,action:reasons.length?'SUSPEND_OWN_HELIUS_WEBHOOK':'MONITOR',reasons,
    thresholds:WEBHOOK_BUDGET_GUARD};
}
