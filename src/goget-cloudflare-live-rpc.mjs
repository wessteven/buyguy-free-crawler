// GOGET stand-alone Helius confirmed-signature sensor: source evidence only.
export const LIVE_RPC_BOUNDS=Object.freeze({
 walletCount:3,perWalletSignatureLimit:100,requestsPerWallet:1,
 maxHeliusCallsPerRun:3,archiveCreditCost:10,
 maxRunReservedCredits:30,maxUtcDayReservedCredits:9000,
 combinedLocalDayCredits:20000,maxRowsPerInsert:10,
 maxDbReads:3,maxDbWrites:52,leaseMs:240000,
 maxResponseBytes:250000,scheduleMs:300000,
 stopAt:'2026-11-08T00:00:00Z',realTrades:0
});
const A=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/,S=/^[1-9A-HJ-NP-Za-km-z]{64,88}$/;
export const validWallet=x=>typeof x==='string'&&A.test(x);
export const validSig=x=>typeof x==='string'&&S.test(x);
export function validateSourceWallets(wallets){
 if(!Array.isArray(wallets)||wallets.length!==LIVE_RPC_BOUNDS.walletCount||
   !wallets.every(validWallet)||new Set(wallets).size!==wallets.length)
   throw Error('RPC_ROSTER_UNVERIFIED');
 return wallets;
}
export function validateSignaturePage(page,seenAt){
 if(!Array.isArray(page)||page.length>LIVE_RPC_BOUNDS.perWalletSignatureLimit)
   throw Error('RPC_SOURCE_PAGE_INVALID');
 const ms=Date.parse(seenAt),seen=new Set();let slot=Infinity;
 if(!Number.isFinite(ms))throw Error('RPC_RECEIPT_TIME_INVALID');
 return page.map(item=>{
   if(!validSig(item?.signature)||seen.has(item.signature)||
      !Number.isSafeInteger(item.slot)||item.slot<=0||item.slot>slot||
      (item.blockTime!==null&&(!Number.isSafeInteger(item.blockTime)||
        item.blockTime<1577836800||item.blockTime*1000>ms+300000)))
     throw Error('RPC_SOURCE_IDENTITY_UNVERIFIED');
   seen.add(item.signature);slot=item.slot;
   return {signature:item.signature,slot:item.slot,
     blockTime:item.blockTime===null?null:new Date(item.blockTime*1000).toISOString(),
     failed:item.err!==null?1:0};
 });
}
export function interpretPage(rows,previousHead){
 if(previousHead!==null&&!validSig(previousHead))throw Error('RPC_PREVIOUS_HEAD_INVALID');
 const index=previousHead?rows.findIndex(x=>x.signature===previousHead):-1;
 const anchored=previousHead===null?false:index>=0;
 const newRows=anchored?rows.slice(0,index):rows;
 return {previousHead,head:rows[0]?.signature??previousHead,
    anchored,baseline:previousHead===null,
    gap:previousHead!==null&&!anchored,
    newRows,scanned:rows.length,
    status:previousHead===null?'BASELINE_HISTORY_UNVERIFIED':
      anchored?'CHECKPOINT_CONNECTED':'UNRESOLVED_SOURCE_INTERVAL'};
}
export function planBudget({newReserved,webhookDeliveries,increment=30,armed}){
 if(!Number.isSafeInteger(newReserved)||newReserved<0||
   !Number.isSafeInteger(webhookDeliveries)||webhookDeliveries<0||
   !Number.isSafeInteger(increment)||increment<1||
   increment>LIVE_RPC_BOUNDS.maxRunReservedCredits)
   throw Error('RPC_BUDGET_INPUT_UNVERIFIED');
 return armed===true&&
   newReserved+increment<=LIVE_RPC_BOUNDS.maxUtcDayReservedCredits&&
   newReserved+webhookDeliveries+increment<=LIVE_RPC_BOUNDS.combinedLocalDayCredits;
}
