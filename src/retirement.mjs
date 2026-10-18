// Age-out policy: keep legitimate historic tokens for reactivation, never delete learning records.
// Never retire pinned assets or an asset with an open paper position.
export async function retireDormantAssets(db, now=Date.now()){
  const h=n=>new Date(now-n*3600000).toISOString();
  const updates=[
    db.prepare(`UPDATE assets SET status='TRASH',
      last_action='ARCHIVED: no usable observations in 24h'
      WHERE observations=0 AND pinned=0 AND first_seen<? AND status!='TRASH'
      AND NOT EXISTS (SELECT 1 FROM paper_positions p WHERE p.asset_key=assets.asset_key AND p.status='OPEN')`).bind(h(24)),
    db.prepare(`UPDATE assets SET status='DEAD',
      last_action='DORMANT: refresh if new activity returns'
      WHERE status IN ('ALIVE','STATIC') AND pinned=0 AND last_seen<? AND observations>0
      AND NOT EXISTS (SELECT 1 FROM paper_positions p WHERE p.asset_key=assets.asset_key AND p.status='OPEN')`).bind(h(48)),
    db.prepare(`UPDATE assets SET status='STATIC',
      last_action='COOLING: quote older than 4h'
      WHERE status='ALIVE' AND pinned=0 AND last_seen<?
      AND NOT EXISTS (SELECT 1 FROM paper_positions p WHERE p.asset_key=assets.asset_key AND p.status='OPEN')`).bind(h(4))
  ];
  const results=await db.batch(updates);
  return {archived:(results[0]?.meta?.changes||0),dormant:(results[1]?.meta?.changes||0),
    cooled:(results[2]?.meta?.changes||0),deleted:0};
}
