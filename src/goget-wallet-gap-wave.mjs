// Second-phase Helius wallet gap recovery: time-sliced, bounded, read-only on chain.
// It writes only an isolated historical replay dataset and its coverage journal.
// It must NOT move/repair live polling cursors or turn inferred activity into trades.
export const GAP_WINDOW=Object.freeze({
 from:'2026-11-03T08:55:01.000Z',
 to:'2026-11-04T10:00:00.000Z',
 sliceHours:4,maxPagesPerWalletWindow:8,maxHeliusCalls:24,
 pageSize:100,maxD1Calls:600,maxStoredRawChars:18000,
 maxSourceResponseBytes:5000000,perRequestCreditPlanning:165
});
export const GAP_WALLETS=Object.freeze([
 '8LJWz8uW51u6kL2XBZ6cKYBngnXCpxQjUZRbwKLfVYp4',
 'whamNNP9tHoxLg92yHvJPdYhghEoCg1qYTsh5a2oLbx',
 '7naFFwuEJWeWwWYQUkgAWHsxYKg3KctEuUj42JdAMidP'
]);
const SIG=/^[1-9A-HJ-NP-Za-km-z]{64,88}$/;
export function planGapSlices({from=GAP_WINDOW.from,to=GAP_WINDOW.to,
 sliceHours=GAP_WINDOW.sliceHours}={}){
 const start=Date.parse(from),end=Date.parse(to);
 if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start||
   !Number.isSafeInteger(sliceHours)||sliceHours<1||sliceHours>6||
   end-start>72*3600000||start%1000||end%1000)
  throw Error('GAP_SCOPE_INVALID');
 const out=[];
 for(let a=start;a<end;a+=sliceHours*3600000){
  const b=Math.min(a+sliceHours*3600000,end);
  out.push({start:new Date(a).toISOString(),endExclusive:new Date(b).toISOString(),
   fromUnix:a/1000,toUnixInclusive:b/1000-1});
 }
 if(out.length>18)throw Error('GAP_WINDOW_CAP');
 return out;
}
export function validateEnhancedPage(items,{wallet,window,lastCursor=null,priorLastTime=null}={}){
 if(!GAP_WALLETS.includes(wallet)||!Array.isArray(items)||
  items.length>GAP_WINDOW.pageSize||!window||
  (lastCursor!==null&&!SIG.test(lastCursor)))
  throw Error('PAGE_IDENTITY_INVALID');
 const from=window.fromUnix,until=window.toUnixInclusive;
 const found=new Set();
 let lastTime=priorLastTime;
 for(const tx of items){
  if(!SIG.test(tx?.signature||'')||!Number.isSafeInteger(tx?.slot)||tx.slot<=0||
     !Number.isSafeInteger(tx?.timestamp)||tx.timestamp<from||tx.timestamp>until||
     found.has(tx.signature)||tx.signature===lastCursor||
     (lastTime!==null&&tx.timestamp>lastTime))
    throw Error('PAGE_MISSING_OR_OUT_OF_ORDER');
  found.add(tx.signature);lastTime=tx.timestamp;
 }
 const next=items.at(-1)?.signature??lastCursor;
 if(items.length&&next===lastCursor)throw Error('PAGINATION_STALLED');
 return {nextCursor:next,nextLastTime:lastTime,isEmpty:items.length===0};
}
export function validateJournal(row,window,wallet){
 if(!row)return {cursor:null,lastTime:null,pages:0,stored:0,processed:0,complete:false};
 if(row.wallet!==wallet||row.window_start!==window.start||
    row.window_end_exclusive!==window.endExclusive||
    !['COMPLETE_ENHANCED','INCOMPLETE_BUDGET','INCOMPLETE_PROVIDER','INCOMPLETE_PAGE_CAP'].includes(row.status)||
    !Number.isSafeInteger(Number(row.pages_read))||Number(row.pages_read)<0||
    !Number.isSafeInteger(Number(row.stored_new))||Number(row.stored_new)<0||
    !Number.isSafeInteger(Number(row.examined))||Number(row.examined)<0||
    (row.last_signature!==null&&!SIG.test(row.last_signature))||
    (row.last_time!==null&&(!Number.isSafeInteger(Number(row.last_time))||
     Number(row.last_time)<window.fromUnix||Number(row.last_time)>window.toUnixInclusive)))
   throw Error('JOURNAL_UNVERIFIED');
 return {cursor:row.last_signature,lastTime:row.last_time===null?null:Number(row.last_time),
  pages:Number(row.pages_read),stored:Number(row.stored_new),processed:Number(row.examined),
  complete:row.status==='COMPLETE_ENHANCED'};
}
