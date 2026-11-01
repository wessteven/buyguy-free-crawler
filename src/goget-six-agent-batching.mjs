// Safe parameterized D1 batch composer for the six-agent research-only journal.
// Cloudflare D1 currently limits bound parameters per query to 100.
// Six params per row * 10 rows = 60. No SQL values are interpolated.
export const REVIEW_BATCH_LIMIT=10;
export const REVIEW_SQL_BASE=[
 'INSERT OR IGNORE INTO smart_wallet_six_agent_reviews',
 '(wallet,signature,source_observed_at,reviewed_at,verdict,trace_json)'
].join(' ');
export function makeReviewBatch(items){
 if(!Array.isArray(items)||items.length<1||items.length>REVIEW_BATCH_LIMIT)
   throw Error('REVIEW_BATCH_LIMIT');
 const values=[],patterns=[];
 for(const item of items){
   if(!item||typeof item.wallet!=='string'||typeof item.signature!=='string')
     throw Error('REVIEW_IDENTITY_MISSING');
   const doc={schemaVersion:item.schemaVersion,mode:item.mode,processedAt:item.processedAt,
    status:item.status,decision:item.decision,trace:item.trace,findings:item.findings,
    nextTasks:item.nextTasks,paperEntries:0,realTrades:0,modelCalls:0};
   const blob=JSON.stringify(doc);
   if(blob.length>12000)throw Error('REVIEW_TOO_LARGE');
   values.push(item.wallet,item.signature,item.sourceObservedAt||item.processedAt,
     item.processedAt,item.decision,blob);
   patterns.push('(?,?,?,?,?,?)');
 }
 return {sql:REVIEW_SQL_BASE+' VALUES '+patterns.join(','),
   params:values,rows:items.length};
}
