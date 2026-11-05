// Persistent quality gate for NEW isolated Cloudflare source collector, not original Helius account billing.
export function evaluateRpcSourceLedger({cycles,states,signatures,gaps,rpcBudget,webhookBudget,asOf,expectedWallets}){
 if(!Array.isArray(cycles)||!Array.isArray(states)||!Array.isArray(signatures)||
  !Array.isArray(gaps)||!Array.isArray(rpcBudget)||!Array.isArray(webhookBudget)||
  !Array.isArray(expectedWallets)||expectedWallets.length!==3||
  new Set(expectedWallets).size!==3||!Number.isFinite(Date.parse(asOf))||
  cycles.length>=100)throw Error('RPC_LEDGER_UNVERIFIED_INPUT');
 const map=new Map(states.map(x=>[x.wallet,x])),observed=new Map(signatures.map(x=>[x.wallet,x]));
 const wallets=expectedWallets.map(wallet=>{
  const state=map.get(wallet),sig=observed.get(wallet),gap=gaps.find(x=>x.wallet===wallet);
  return {wallet,sourceState:state?.status??'NEVER_CHECKED',
    lastCheckedAt:state?.last_checked_at??null,
    storedSignatures:Number(sig?.n??0),
    failedChainSignatures:Number(sig?.failed??0),
    oldestSignatureAt:sig?.first_at??null,
    newestSignatureAt:sig?.last_at??null,
    totalRecordedGapCount:Number(state?.gaps??0),
    currentlyUnresolvedGapWindows:Number(gap?.n??0)};
 });
 const cron=cycles.filter(x=>x.trigger==='cron');
 const bySlot=cron.map(x=>Date.parse(x.slot_utc)).filter(Number.isFinite).sort((a,b)=>a-b);
 const step=300000,unique=[...new Set(bySlot)];
 let missing=0,maxStep=0;
 for(let i=1;i<unique.length;i++){
  const d=unique[i]-unique[i-1];
  maxStep=Math.max(maxStep,d);
  missing+=Math.max(0,Math.round(d/step)-1);
 }
 const last=cycles.length?Math.max(...cycles.map(x=>Date.parse(x.slot_utc))):null;
 const lastAge=last===null?null:Math.max(0,Math.round((Date.parse(asOf)-last)/60000));
 const full=cron.filter(x=>x.wallets_scanned===3&&x.helius_calls===3&&
    Number(x.credits_reserved)===30&&x.status==='SOURCES_ARCHIVED_GAPS_DISCLOSED');
 const unresolved=wallets.reduce((n,w)=>n+w.currentlyUnresolvedGapWindows,0);
 const failures=cycles.filter(x=>x.status!=='SOURCES_ARCHIVED_GAPS_DISCLOSED').map(x=>({
    slot:x.slot_utc,trigger:x.trigger,status:x.status,scanned:x.wallets_scanned,
    calls:x.helius_calls,credits:x.credits_reserved
 })).slice(0,20);
 const day=asOf.slice(0,10),rpc=rpcBudget.find(x=>x.day===day),webhook=webhookBudget.find(x=>x.day===day);
 const reserved=Number(rpc?.reserved_credits??0),delivered=Number(webhook?.observed_deliveries??0);
 const status=wallets.some(x=>x.sourceState==='NEVER_CHECKED')?'MISSING_WALLET_SCOPE':
   !cron.length?'MANUAL_VERIFIED_CRON_NOT_YET_OBSERVED':
   missing>0||lastAge>15||full.length<cron.length||unresolved>0?
    'SOURCE_COVERAGE_INCOMPLETE_OR_GAPS':'RECORDED_CRON_CYCLES_THREE_WALLETS_NO_KNOWN_GAPS';
 return {status,asOf,expectedWallets:3,wallets,
  allSourceWalletsPresent:wallets.every(x=>x.sourceState!=='NEVER_CHECKED'),
  collectedCycles:cycles.length,cronCycles:cron.length,
  completeThreeWalletCronCycles:full.length,missingIntervalsBetweenCronReceipts:missing,
  maxCronIntervalMinutes:maxStep?Math.round(maxStep/60000):null,
  lastRecordedCycleAgeMinutes:lastAge,failures,unresolvedGapWindows:unresolved,
  utcBudget:{day,rpcCreditsReserved:reserved,webhookDeliveryEstimate:delivered,
   localCombinedEstimate:reserved+delivered,rpcHardCap:9000,localCombinedCeiling:20000,
   actualHeliusAccountCreditsNotMeasured:true},
  limitations:['Complete bounded 100-signature scan is not necessarily complete raw chain history.',
   'Legacy GitHub live RPC cursors remain separate and unresolved.',
   'Daily credit sums exclude other projects and are not Helius billing.',
   'Partial or absent cron rows may hide executions that failed before D1 commit.']};
}
