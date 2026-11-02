// Independent GitHub Actions audit. Reads source D1 rows; writes only quality_ledger_* tables.
import {readFileSync,appendFileSync} from 'node:fs';
import {auditTrackCA} from '../src/audit.mjs';
const required=name=>{
  const v=process.env[name];if(!v)throw Error('MISSING_REQUIRED_CREDENTIAL_'+name);return v;
};
const account=required('CF_ACCOUNT_ID'),dbid=required('CF_DATABASE_ID'),token=required('CF_D1_API_TOKEN');
const endpoint='https://api.cloudflare.com/client/v4/accounts/'+encodeURIComponent(account)+
  '/d1/database/'+encodeURIComponent(dbid)+'/query';
async function query(sql,params=[]){
  const response=await fetch(endpoint,{
    method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},
    body:JSON.stringify({sql,params}),signal:AbortSignal.timeout(18000)
  });
  if(!response.ok)throw Error('D1_HTTP_'+response.status);
  const body=await response.json();
  if(body?.success!==true||body?.result?.[0]?.success!==true)
    throw Error('D1_QUERY_FAILED_'+String(body?.errors?.[0]?.code||'UNKNOWN'));
  return {rows:body.result[0].results||[],changes:body.result[0].meta?.changes??null};
}
async function migrate(){
  const schema=readFileSync(new URL('../sql/001_quality_ledger.sql',import.meta.url),'utf8');
  const clean=schema.split('\n').filter(s=>!s.trimStart().startsWith('--')).join('\n');
  const statements=clean.split(';').map(s=>s.trim()).filter(Boolean);
  for(const sql of statements){
    if(!/^CREATE (?:TABLE|INDEX) IF NOT EXISTS (?:quality_ledger_|ix_quality_ledger_)/i.test(sql))
      throw Error('NON_ADDITIVE_SCHEMA_REJECTED');
    await query(sql);
  }
  console.log('QUALITY_SCHEMA_CHECKED',statements.length);
}
const first=async(sql,params=[])=>((await query(sql,params)).rows[0]||null);
const all=async(sql,params=[])=>((await query(sql,params)).rows);
async function persist(a){
  const q='INSERT OR IGNORE INTO quality_ledger_runs (audit_id,task_key,version,audited_at,source_run_id,source_status,source_started_at,expected,source_recorded,stale,missing,unverified,ambiguous,status,previous_recorded,comparison,warning) VALUES ('+Array(17).fill('?').join(',')+')';
  const values=[a.auditId,a.task,a.version,a.auditedAt,a.sourceRunId,a.sourceStatus,a.sourceStartedAt,
    a.expected,a.counts.SOURCE_RECORDED,a.counts.STALE,a.counts.MISSING,a.counts.UNVERIFIED,
    a.counts.AMBIGUOUS,a.status,a.previousObserved,a.comparison,a.warning];
  const result=await query(q,values);
  if(result.changes===0)console.log('QUALITY_EXISTING_RUN_RECONCILE_CHECKS',a.auditId);
  const cols='audit_id,requirement_key,asset_id,requirement,status,evidence_ref,note';
  for(let start=0;start<a.checks.length;start+=35){
    const batch=a.checks.slice(start,start+35);
    const fields=batch.map(()=> '('+Array(7).fill('?').join(',')+')').join(',');
    const params=batch.flatMap(c=>[a.auditId,c.key,c.asset,c.requirement,c.status,c.ref,c.note]);
    await query('INSERT OR IGNORE INTO quality_ledger_checks ('+cols+') VALUES '+fields,params);
  }
  const actual=await first('SELECT COUNT(*) AS n FROM quality_ledger_checks WHERE audit_id=?',[a.auditId]);
  if(Number(actual?.n)!==a.expected)throw Error('INCOMPLETE_LEDGER_WRITE_'+String(actual?.n));
  return true;
}
async function main(){
  await migrate();
  const now=Date.now(),oldest=new Date(now-120*60000).toISOString();
  const run=await first('SELECT run_id,started_at,completed_at,status,assets_total,assets_identified,assets_with_pools FROM trackca_runs ORDER BY bucket DESC LIMIT 1');
  const coverage=run?await all('SELECT * FROM trackca_coverage WHERE run_id=? LIMIT 60',[run.run_id]):[];
  const pairs=run?await all('SELECT * FROM trackca_pair_snapshots WHERE run_id=? ORDER BY liquidity_usd DESC LIMIT 120',[run.run_id]):[];
  const holders=await all('SELECT asset_id,observed_at,holders_count,source,status FROM trackca_holder_snapshots WHERE observed_at>=? ORDER BY observed_at DESC LIMIT 200',[oldest]);
  const previous=await first("SELECT version,source_run_id,source_recorded FROM quality_ledger_runs WHERE task_key='trackca' ORDER BY audited_at DESC LIMIT 1");
  const audit=auditTrackCA({run,coverage,pairs,holders,previous,now});
  const written=await persist(audit);
  const digest={audit_id:audit.auditId,status:audit.status,expected:audit.expected,
    source_recorded:audit.counts.SOURCE_RECORDED,missing:audit.counts.MISSING,
    unverified:audit.counts.UNVERIFIED,ambiguous:audit.counts.AMBIGUOUS,stale:audit.counts.STALE,
    previous_recorded:audit.previousObserved,comparison:audit.comparison,persisted:written};
  console.log('QUALITY_LEDGER_AUDIT',JSON.stringify(digest));
  if(process.env.GITHUB_STEP_SUMMARY){
    appendFileSync(process.env.GITHUB_STEP_SUMMARY,
      '## Independent quality ledger — trackCA\n\n'+
      '| Status | Source run | Observed source rows* | Missing | Unverified | Ambiguous | Stale | Required |\n'+
      '|---|---|---:|---:|---:|---:|---:|---:|\n'+
      '| '+audit.status+' | '+audit.sourceRunId+' | '+audit.counts.SOURCE_RECORDED+
      ' | '+audit.counts.MISSING+' | '+audit.counts.UNVERIFIED+' | '+audit.counts.AMBIGUOUS+
      ' | '+audit.counts.STALE+' | '+audit.expected+' |\n\n'+
      '*Source-recorded means persisted D1 evidence, not independent provider truth or completed research. ChatGPT-native tasks are not yet externally instrumented.\n');
  }
  if(audit.regression||audit.status==='SOURCE_RUN_GAP')throw Error('QUALITY_FAIL_CLOSED_'+audit.status);
}
main().catch(e=>{console.error('QUALITY_AUDIT_FAILURE',e.message);process.exitCode=1;});
