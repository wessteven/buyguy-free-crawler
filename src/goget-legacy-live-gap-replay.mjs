// Historical repair of LEGACY live RPC cursor gaps, independent of forward collectors.
// Each wallet's old checkpoint and new-source anchor are immutable for one replay.
// No original live/Helius historical/source tables may be updated by this module.
export const LEGACY_REPLAY_LIMITS=Object.freeze({
  walletCount:3,pageSize:100,maxPagesPerWalletPerRun:6,maxCallsPerRun:18,
  creditsPerCall:10,dayHistoricalCredits:300,sharedDailyRpcCredits:9000,
  combinedLocalCredits:20000,maxD1Queries:360,insertChunk:10,
  sourceMaxBytes:250000,stopUtc:'2026-11-08T00:00:00Z',
  trades:0,archiveProvider:'HELIUS_CONFIRMED_RPC_RETROSPECTIVE'
});
const ADDR=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const SIG=/^[1-9A-HJ-NP-Za-km-z]{64,88}$/;
export const validSignature=x=>typeof x==='string'&&SIG.test(x);
export function validateExactReplayRoster(cohort,expected){
  if(!Array.isArray(cohort)||!Array.isArray(expected)||
    cohort.length!==LEGACY_REPLAY_LIMITS.walletCount||
    expected.length!==LEGACY_REPLAY_LIMITS.walletCount||
    new Set(expected).size!==expected.length||
    !expected.every(x=>typeof x==='string'&&ADDR.test(x))||
    !cohort.every(x=>x?.vetted===false&&expected.includes(x?.wallet))||
    new Set(cohort.map(x=>x.wallet)).size!==cohort.length)
    throw Error('LEGACY_REPLAY_ROSTER_UNVERIFIED');
  return expected;
}
export function validateReplaySourcePage(items,{before,at,priorLastSlot=null}){
  if(!validSignature(before)||!Array.isArray(items)||
    items.length>LEGACY_REPLAY_LIMITS.pageSize||
    !Number.isFinite(Date.parse(at))||
    (priorLastSlot!==null&&(!Number.isSafeInteger(priorLastSlot)||priorLastSlot<1)))
    throw Error('LEGACY_REPLAY_PAGE_INPUT_INVALID');
  const found=new Set();let prior=priorLastSlot??Number.MAX_SAFE_INTEGER;
  const rows=[];
  for(const tx of items){
    if(!validSignature(tx?.signature)||tx.signature===before||
      found.has(tx.signature)||!Number.isSafeInteger(tx.slot)||
      tx.slot<1||tx.slot>prior||
      (tx.blockTime!==null&&(!Number.isSafeInteger(tx.blockTime)||
        tx.blockTime<1577836800||tx.blockTime*1000>Date.parse(at)+300000)))
      throw Error('LEGACY_REPLAY_PAGE_IDENTITY_UNVERIFIED');
    prior=tx.slot;found.add(tx.signature);
    rows.push({signature:tx.signature,slot:tx.slot,
      blockTime:tx.blockTime===null?null:new Date(tx.blockTime*1000).toISOString(),
      failed:tx.err===null?0:1});
  }
  return rows;
}
export function planReplayPage(rows,oldCursor){
  if(!Array.isArray(rows)||!validSignature(oldCursor))
    throw Error('LEGACY_REPLAY_PLAN_INVALID');
  const ix=rows.findIndex(x=>x.signature===oldCursor);
  const reached=ix>=0;
  const archived=reached?rows.slice(0,ix+1):rows;
  const next=archived.at(-1);
  return {archived,foundOldAnchor:reached,nextBefore:next?.signature??null,
    nextLastSlot:next?.slot??null,
    reachedSourceEnd:!reached&&rows.length===0,
    shortPage:!reached&&rows.length<LEGACY_REPLAY_LIMITS.pageSize};
}
export function verifiedJournal(row,{wallet,legacyCursor,sourceHead}){
  if(!validSignature(legacyCursor)||!validSignature(sourceHead)||
    typeof wallet!=='string'||!ADDR.test(wallet))throw Error('LEGACY_ANCHORS_INVALID');
  if(!row)return {wallet,legacyCursor,seedHead:sourceHead,before:null,
    lastSlot:null,pages:0,examined:0,inserted:0,status:'NOT_STARTED',
    found:false,blocked:false};
  if(row.wallet!==wallet||row.legacy_cursor!==legacyCursor||
    !validSignature(row.seed_head)||!['NOT_STARTED','INCOMPLETE_PAGE_CAP',
      'INCOMPLETE_PROVIDER','INCOMPLETE_BUDGET','INCOMPLETE_SHORT_PAGE',
      'ANCHOR_FOUND_SOURCE_RECONCILE_PENDING','SOURCE_EXHAUSTED_ANCHOR_MISSING',
      'COMPLETE_HELIUS_SIGNATURE_BRIDGE'].includes(row.status)||
    row.before_signature!==null&&!validSignature(row.before_signature)||
    (row.last_slot!==null&&(!Number.isSafeInteger(Number(row.last_slot))||
      Number(row.last_slot)<1))||
    !Number.isSafeInteger(Number(row.pages))||Number(row.pages)<0||
    !Number.isSafeInteger(Number(row.examined))||Number(row.examined)<0||
    !Number.isSafeInteger(Number(row.inserted))||Number(row.inserted)<0)
    throw Error('LEGACY_JOURNAL_UNVERIFIED');
  return {wallet,legacyCursor,seedHead:row.seed_head,
    before:row.before_signature,lastSlot:row.last_slot===null?null:Number(row.last_slot),
    pages:Number(row.pages),examined:Number(row.examined),inserted:Number(row.inserted),
    status:row.status,found:row.status==='COMPLETE_HELIUS_SIGNATURE_BRIDGE'||
      row.status==='ANCHOR_FOUND_SOURCE_RECONCILE_PENDING',
    blocked:row.status==='SOURCE_EXHAUSTED_ANCHOR_MISSING'};
}
export function testHistoricalBudget({rpcAlready,webhookDeliveries,replayAlready}){
  const l=LEGACY_REPLAY_LIMITS;
  if(![rpcAlready,webhookDeliveries,replayAlready].every(x=>Number.isSafeInteger(x)&&x>=0))
    throw Error('LEGACY_BUDGET_INPUT_UNVERIFIED');
  return replayAlready+l.creditsPerCall<=l.dayHistoricalCredits&&
    rpcAlready+l.creditsPerCall<=l.sharedDailyRpcCredits&&
    rpcAlready+webhookDeliveries+l.creditsPerCall<=l.combinedLocalCredits;
}
