// Reversible, evidence-based automatic cleanup. Never delete research records.
// DEAD is an archived identified token; TRASH is unresolved no-data junk only.
// Protect pinned assets, open paper positions and pending predictions.
export async function retireDormantAssets(db,now=Date.now()){
 const h=n=>new Date(now-n*3600000).toISOString();
 const protectedRows=`NOT EXISTS (SELECT 1 FROM paper_positions p WHERE p.asset_key=assets.asset_key AND p.status='OPEN')
  AND NOT EXISTS (SELECT 1 FROM predictions p WHERE p.asset_key=assets.asset_key AND p.status='PENDING')`;
 const updates=[
  db.prepare(`UPDATE assets SET status='TRASH',
   last_action='TRASH: unresolved address, no observations after 24h'
   WHERE observations=0 AND pinned=0 AND first_seen<? AND status!='TRASH'
   AND (symbol IS NULL OR UPPER(TRIM(symbol)) IN ('PENDING','?','UNKNOWN'))
   AND ${protectedRows}
   AND NOT EXISTS (SELECT 1 FROM research_events e WHERE e.asset_key=assets.asset_key AND e.kind!='TOKEN_SOCIALS')`).bind(h(24)),
  // Old enough, persistently quiet across at least 3 real observations.
  db.prepare(`UPDATE assets SET status='DEAD',
   last_action='ARCHIVED: weak buys and trade activity across three checks'
   WHERE status IN ('ALIVE','STATIC') AND pinned=0 AND first_seen<?
   AND last_seen>=? AND observations>=3
   AND COALESCE(score,0)<40 AND COALESCE(buys_m5,0)<4
   AND COALESCE(tx_m5,0)<8
   AND (COALESCE(volume_h24,0)<5000 OR COALESCE(liquidity,0)<20000)
   AND (SELECT COUNT(*) FROM (SELECT o.id FROM observations o
      WHERE o.asset_key=assets.asset_key ORDER BY o.seen_at DESC,o.id DESC LIMIT 3))=3
   AND NOT EXISTS (SELECT 1 FROM (
      SELECT COALESCE(o.buys_m5,0) buys,COALESCE(o.sells_m5,0) sells,
       COALESCE(o.score,0) past_score FROM observations o
      WHERE o.asset_key=assets.asset_key ORDER BY o.seen_at DESC,o.id DESC LIMIT 3)
      WHERE buys>=8 OR buys+sells>=12 OR past_score>=55)
   AND ${protectedRows}`).bind(h(24),h(6)),
  db.prepare(`UPDATE assets SET status='DEAD',
   last_action='ARCHIVED: no fresh market observations for 48h'
   WHERE status IN ('ALIVE','STATIC') AND pinned=0 AND observations>0
   AND last_seen<? AND ${protectedRows}`).bind(h(48)),
  // Never trash known identified tokens just because they lack a fresh quote.
  db.prepare(`UPDATE assets SET status='DEAD',
   last_action='ARCHIVED: identified token, no usable quote after 72h'
   WHERE status IN ('ALIVE','STATIC') AND pinned=0 AND observations=0
   AND first_seen<? AND symbol IS NOT NULL
   AND UPPER(TRIM(symbol)) NOT IN ('PENDING','?','UNKNOWN')
   AND ${protectedRows}`).bind(h(72)),
  db.prepare(`UPDATE assets SET status='STATIC',
   last_action='COOLING: quote older than 4h'
   WHERE status='ALIVE' AND pinned=0 AND last_seen<?
   AND ${protectedRows}`).bind(h(4))
 ];
 const results=await db.batch(updates);
 return {trashed:results[0]?.meta?.changes||0,weakArchived:results[1]?.meta?.changes||0,
  dormant:results[2]?.meta?.changes||0,noQuoteArchived:results[3]?.meta?.changes||0,
  cooled:results[4]?.meta?.changes||0,deleted:0};
}
