// Independent source heartbeat assessment. Not a wallet-profit signal or proof of complete chain coverage.
export const SOURCE_WATCHDOG_BOUNDS=Object.freeze({
 scheduleMinutes:5,expectedWebhooks:12,expectedRpcWallets:3,
 maxD1Reads:6,maxD1Writes:1,providerStaleMinutes:90,rpcStaleMinutes:15,
 maxSummaryBytes:3600,heliusCalls:0,trades:0
});
const time=x=>typeof x==='string'&&Number.isFinite(Date.parse(x))?Date.parse(x):null;
export function assessSourceHeartbeat({at,control,deliveries,events,cursors,priorCron,walletsSeen24h,expectedRpcWallets}){
 const now=time(at);
 if(now===null||!Array.isArray(control)||!Array.isArray(deliveries)||
  !Array.isArray(events)||!Array.isArray(cursors)||!Array.isArray(priorCron)||
  !Number.isSafeInteger(walletsSeen24h)||walletsSeen24h<0||
  !Array.isArray(expectedRpcWallets)||expectedRpcWallets.length!==SOURCE_WATCHDOG_BOUNDS.expectedRpcWallets)
   throw Error('HEARTBEAT_INPUT_UNVERIFIED');
 const delivered=deliveries[0]?.last_at??null,normalized=events[0]?.observed_at??null;
 const deliveryMs=time(delivered),normalizedMs=time(normalized);
 const age=x=>x===null?null:Math.max(0,Math.ceil((now-x)/60000));
 const deliveryAge=age(deliveryMs),normalizedAge=age(normalizedMs);
 const cursorMap=new Map(cursors.map(x=>[x.wallet,x]));
 const rpc=expectedRpcWallets.map(wallet=>{
   const c=cursorMap.get(wallet),last=time(c?.last_polled_at);
   return {wallet,status:c?.status??'UNKNOWN',
     ageMinutes:age(last),pending:!/^(OBSERVED|NO_NEW_SIGNATURES|BASELINED)$/.test(c?.status||'')};
 });
 const stale=rpc.filter(x=>x.ageMinutes===null||x.ageMinutes>SOURCE_WATCHDOG_BOUNDS.rpcStaleMinutes).length;
 const pending=rpc.filter(x=>x.pending).length;
 const priorAt=time(priorCron[0]?.at??null),priorAge=age(priorAt);
 const sourceCount=walletsSeen24h;
 const armed=control.length===1&&control[0].state==='ARMED';
 const deliveryFresh=deliveryAge!==null&&deliveryAge<=SOURCE_WATCHDOG_BOUNDS.providerStaleMinutes;
 const missedCron=priorAge!==null&&priorAge>SOURCE_WATCHDOG_BOUNDS.scheduleMinutes*2;
 const rpcComplete=cursors.length===expectedRpcWallets.length&&
   expectedRpcWallets.every(x=>cursorMap.has(x));
 const status=!armed||!rpcComplete?'CONTROL_OR_SCOPE_UNVERIFIED':
   missedCron?'CLOUDFLARE_SCHEDULE_GAP':
   stale>0?'RPC_POLLER_STALE_BUT_WEBHOOK_INDEPENDENT':
   !deliveryFresh?'HELIUS_DELIVERY_STALE_OR_IDLE':
   'SOURCES_OBSERVED_NOT_CERTIFIED_COMPLETE';
 return {status,at,webhookRosterExpected:SOURCE_WATCHDOG_BOUNDS.expectedWebhooks,
  walletsWithNormalizedEvents24h:sourceCount,webhookArmed:armed,
  lastProviderDeliveryAt:delivered,providerDeliveryAgeMinutes:deliveryAge,
  lastNormalizedEventAt:normalized,normalizedAgeMinutes:normalizedAge,
  rpcExpected:expectedRpcWallets.length,rpcFound:cursors.length,
  rpcStale:stale,rpcPending:pending,priorCronAgeMinutes:priorAge,
  missedCron,heliusCalls:0,trades:0,
  notes:'D1 liveness only: missing events can mean inactivity; no claim of original-chain completeness or repaired live cursors.'};
}
