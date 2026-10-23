// Non-destructive research reset: observations, experiments and trades remain in D1.
// Active dashboard membership changes; older tokens requalify only on fresh observations.
// Pinned research and open paper positions remain visible despite an older quote.
export const CLEAN_SLATE_AT='2026-10-23T08:10:00.000Z';
export const CLEAN_SLATE_ACTIVE_WHERE=
 "((a.status IN ('ALIVE','STATIC') AND a.last_seen >= '"+CLEAN_SLATE_AT+"')"+
 " OR (a.pinned=1 AND a.status!='TRASH')"+
 " OR EXISTS (SELECT 1 FROM paper_positions p WHERE p.asset_key=a.asset_key AND p.status='OPEN'))";
