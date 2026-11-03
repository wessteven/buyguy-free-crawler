import {planEnrichment} from './enrichment-plan.mjs';

// Independent catch-up engine. No wallet collection, checkpoint movement or trading.
// Caller provides D1, Helius fetch function, frozen wallets and classification.
export async function drainBacklog({db,fetchParsed,wallets,classify,limit=60,batchSize=20,onBatch=async()=>{}}) {
  if(!db||typeof fetchParsed!=='function'||!Array.isArray(wallets)||typeof classify!=='function')
    throw Error('BACKFILL_DEPENDENCIES_REQUIRED');
  if(!Number.isInteger(limit)||limit<1||limit>300||!Number.isInteger(batchSize)||batchSize<1||batchSize>20)
    throw Error('BACKFILL_BOUNDS_INVALID');
  const q=await db.prepare("SELECT wallet_id,tx_id FROM trackbigbux_activity WHERE chain='solana' AND category='UNPARSED_SIGNATURE' ORDER BY observed_at ASC LIMIT ?").bind(limit).all();
  const rows=q.results||[];
  const signatures=[...new Set(rows.map(x=>x.tx_id))];
  const summary={rowsSelected:rows.length,uniqueSignatures:signatures.length,attempted:0,returned:0,
    classified:0,failedBatches:0,unresolved:0,batches:[]};
  for(let i=0;i<signatures.length;i+=batchSize){
    const chunk=signatures.slice(i,i+batchSize);
    const item={index:summary.batches.length+1,requested:chunk.length,status:'FAILED',returned:0,classified:0};
    summary.attempted+=chunk.length;
    try{
      const parsed=await fetchParsed(chunk);
      if(!Array.isArray(parsed))throw Error('BACKFILL_PARSER_SCHEMA_INVALID');
      item.returned=parsed.length;summary.returned+=parsed.length;
      const updates=planEnrichment(rows,parsed,wallets,classify);
      const stmts=updates.map(x=>db.prepare("UPDATE trackbigbux_activity SET category=?,initiated=?,source=?,evidence_json=? WHERE wallet_id=? AND chain='solana' AND tx_id=? AND category='UNPARSED_SIGNATURE'")
        .bind(x.category,x.initiated,x.source,x.evidence_json,x.walletId,x.signature));
      for(let n=0;n<stmts.length;n+=40)await db.batch(stmts.slice(n,n+40));
      item.classified=stmts.length;summary.classified+=stmts.length;
      item.status='OK';
    }catch(e){
      item.error=String(e?.message||e).slice(0,160);
      summary.failedBatches++;
    }
    summary.batches.push(item);
    await onBatch(item);
  }
  summary.unresolved=rows.length-summary.classified;
  return summary;
}
