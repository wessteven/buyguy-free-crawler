// Independent read-only evaluator. It checks persisted collector evidence, never AI prose.
import { ASSETS } from '../../trackca/src/watchlist.mjs';

export const VERSION = 'trackca-v1-2026-11-02';
export const BASELINE_IDS = Object.freeze([
  'pons','ai','cashcat','ameme','zzz','boner','index','ubik','bun','moo',
  'delta','thinkingcat','prologue','hoodfun','microduck','pair','arrow',
  'robincat','spacehood','goose','injoh','mihao'
]);
export const REQUIREMENTS = Object.freeze([
  'identity_join','exact_pool_record','volume_5m','volume_1h','volume_24h',
  'holder_delta','independent_buyers','wallet_accumulation','whale_flows',
  'executable_sell_depth'
]);
// D1 REST has a finite per-statement binding budget: 5 rows x 7 bindings = 35.
export const MAX_EVIDENCE_ROWS_PER_INSERT=5;
export function* evidenceBatches(checks){
  for(let i=0;i<checks.length;i+=MAX_EVIDENCE_ROWS_PER_INSERT)
    yield checks.slice(i,i+MAX_EVIDENCE_ROWS_PER_INSERT);
}
const statusList=['SOURCE_RECORDED','STALE','MISSING','UNVERIFIED','AMBIGUOUS'];
const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.toLowerCase()===b.toLowerCase();
const finite=n=>n!==null&&n!==undefined&&n!==''&&Number.isFinite(Number(n));
const validTime=(time,now,limitMinutes)=>{
  const millis=Date.parse(time||'');
  return Number.isFinite(millis)&&millis<=now+120000&&millis>=now-limitMinutes*60000;
};
function row(asset,requirement,status,ref='',note=''){
  return {key:asset.id+'/'+requirement,asset:asset.id,requirement,status,ref,note};
}
export function auditTrackCA({run=null,coverage=[],pairs=[],holders=[],previous=null,now=Date.now(),assets=ASSETS}={}){
  if(!Number.isFinite(now))throw Error('INVALID_NOW');
  const names=new Set(assets.map(a=>a.id));
  if(names.size!==BASELINE_IDS.length || BASELINE_IDS.some(id=>!names.has(id)))
    throw Error('BASELINE_ROSTER_CHANGED: refuse silent scope reduction or addition');
  const byId=new Map(assets.map(a=>[a.id,a]));
  const cMap=new Map(coverage.map(c=>[c.asset_id,c]));
  const checks=[];
  const recentRun=run&&validTime(run.started_at,now,20);
  for(const id of BASELINE_IDS){
    const a=byId.get(id), c=cMap.get(id);
    const matching=pairs.filter(p=>p.asset_id===id&&same(p.chain,a.chain)&&same(p.token_address,a.address)&&p.pool_id&&validTime(p.observed_at,now,15));
    const stalePairs=pairs.filter(p=>p.asset_id===id&&same(p.chain,a.chain)&&same(p.token_address,a.address)&&p.pool_id);
    const good=matching[0], stale=stalePairs[0];
    const sourceRef=good?'trackca_pair_snapshots:'+run.run_id+':'+id+':'+good.pool_id:'';
    const missing=(req,note)=>row(a,req,recentRun?'MISSING':'STALE','',note||'No recent source run');
    if(!recentRun){
      for(const req of REQUIREMENTS)checks.push(missing(req,'No source run inside 20-minute watchdog interval'));
      continue;
    }
    if(!a.address)checks.push(row(a,'identity_join','AMBIGUOUS','','Exact contract not established in frozen baseline'));
    else if(c&&same(c.token_address,a.address))checks.push(row(a,'identity_join','SOURCE_RECORDED','trackca_coverage:'+run.run_id+':'+id,'Collector record matches exact configured address; not independent on-chain validation'));
    else checks.push(missing('identity_join','Missing or mismatched exact address evidence row'));
    if(good)checks.push(row(a,'exact_pool_record','SOURCE_RECORDED',sourceRef,'Persisted exact-address pool row; provider quote time not independently known'));
    else if(stale)checks.push(row(a,'exact_pool_record','STALE','trackca_pair_snapshots:'+run.run_id+':'+id,'Source row outside 15-minute freshness window'));
    else checks.push(missing('exact_pool_record','No exact-address pool evidence row'));
    for(const [metric,field] of [['volume_5m','volume_m5_usd'],['volume_1h','volume_h1_usd'],['volume_24h','volume_h24_usd']]){
      if(good&&finite(good[field]))checks.push(row(a,metric,'SOURCE_RECORDED',sourceRef,'Aggregate sourced from persisted collector output; no provider quote timestamp'));
      else if(stale&&finite(stale[field]))checks.push(row(a,metric,'STALE','trackca_pair_snapshots:'+run.run_id+':'+id,'Evidence timestamp outside freshness window'));
      else checks.push(missing(metric,'Missing exact-pool '+field));
    }
    const h=holders.filter(x=>x.asset_id===id&&finite(x.holders_count)&&validTime(x.observed_at,now,120))
      .sort((x,y)=>Date.parse(y.observed_at)-Date.parse(x.observed_at));
    if(h.length>1&&validTime(h[0].observed_at,now,75)&&
       Date.parse(h[0].observed_at)-Date.parse(h[1].observed_at)>=600000)
      checks.push(row(a,'holder_delta','SOURCE_RECORDED','trackca_holder_snapshots:'+id+':'+h[0].observed_at,
        'Two persisted holder counts; does not establish independently funded wallets'));
    else checks.push(missing('holder_delta','Requires two separated recent numeric snapshots'));
    for(const req of ['independent_buyers','wallet_accumulation','whale_flows','executable_sell_depth'])
      checks.push(row(a,req,'UNVERIFIED','','No primary evidence for this required deep metric; aggregate trades and transfers do not suffice'));
  }
  const counts=Object.fromEntries(statusList.map(s=>[s,checks.filter(c=>c.status===s).length]));
  if(checks.length!==BASELINE_IDS.length*REQUIREMENTS.length)throw Error('AUDIT_DENOMINATOR_MISMATCH');
  const sourceRunId=run?.run_id||'none';
  const auditId='trackca:'+sourceRunId+(recentRun?'':':watchdog-'+new Date(now).toISOString().slice(0,13));
  const priorComparable=previous&&previous.version===VERSION&&previous.source_run_id!==sourceRunId;
  const oldCount=priorComparable?Number(previous.source_recorded):null;
  const regression=oldCount!==null&&Number.isFinite(oldCount)&&counts.SOURCE_RECORDED<oldCount;
  return {
    auditId,version:VERSION,task:'trackca',auditedAt:new Date(now).toISOString(),
    sourceRunId,sourceStatus:run?.status||'NO_RUN',sourceStartedAt:run?.started_at||null,
    expected:checks.length,counts,checks,complete:false,
    regression,previousObserved:oldCount,comparison:priorComparable?'COMPARABLE':'NO_COMPARABLE_PRIOR',
    status:!recentRun?'SOURCE_RUN_GAP':regression?'REGRESSION':'INCOMPLETE',
    warning:'SOURCE_RECORDED proves a D1 row was saved, not the underlying provider response or full research completeness.'
  };
}
