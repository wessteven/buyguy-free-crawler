// Bounded, read-only discovery-quality snapshot. Attribution is conservative.
export async function discoveryQuality(db){
  const obs=(await db.prepare("SELECT o.asset_key,o.pool,o.provider,o.seen_at,o.score,o.liquidity,o.buys_m5,o.sells_m5,a.pool_created,a.first_seen FROM observations o LEFT JOIN assets a ON a.asset_key=o.asset_key ORDER BY o.id DESC LIMIT 120").all()).results||[];
  const runs=(await db.prepare("SELECT started_at,state,observed FROM runs ORDER BY id DESC LIMIT 45").all()).results||[];
  const counts={lightweight:0,broader:0,unknown:0,uniqueMints:0,repeats:0,highScoreLiquid:0,zeroBuyRows:0};
  const seen=new Set(),runMap=new Map(runs.map(r=>[r.started_at,r]));
  const rows=obs.map(o=>{
    // Timestamp collision and unknown provenance are never treated as proof.
    const r=runMap.get(o.seen_at);
    const path=r&&r.state!=='RATE_LIMITED'&&r.observed>0?'run_timestamp_match':'unknown';
    const first=!seen.has(o.asset_key);seen.add(o.asset_key);
    if(!first)counts.repeats++;
    if(Number(o.score)>=60&&Number(o.liquidity)>=50000)counts.highScoreLiquid++;
    if(Number(o.buys_m5)===0)counts.zeroBuyRows++;
    counts.unknown++;
    return {assetKey:o.asset_key,pool:o.pool,provider:o.provider,seenAt:o.seen_at,
      path,pathConfidence:'unverified',score:o.score,liquidity:o.liquidity,
      buysM5:o.buys_m5,sellsM5:o.sells_m5,poolCreated:o.pool_created,
      firstSeen:o.first_seen,uniqueInSample:first,buyerEvidence:'transactions_only',
      quoteFreshness:'unverified'};
  });
  counts.uniqueMints=seen.size;
  return {sampleSize:rows.length,counts,rows:rows.slice(0,40),
    limitations:['Observation timestamp is not independently verified quote time.',
      'Run timestamp matches do not prove ingestion path.',
      'Buy counts are transactions, not independent buyer wallets.',
      'Cooldown missed candidates cannot be inferred without independent timestamped evidence.']};
}
