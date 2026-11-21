// Independent read-only historical proof. Never contacts/re-arms the Worker or Helius.
import {writeFile} from 'node:fs/promises';
export const ORIGINAL_RUN='aed7d373-39ab-4872-9856-426bc7dc5459';
export const queries=[
 ['run','SELECT * FROM goget_event_pilot_runs WHERE run_id=? LIMIT 1'],
 ['roster','SELECT pool,mint,asset_key FROM goget_event_pilot_roster WHERE run_id=? ORDER BY pool LIMIT 11'],
 ['windows','SELECT coverage,scheduled_status,COUNT(*) AS n,COUNT(DISTINCT pool) AS pools FROM goget_event_pilot_windows WHERE run_id=? GROUP BY coverage,scheduled_status LIMIT 100'],
 ['reconciliation','SELECT pool,checked_at,status,rpc_in_window,websocket_matched,missing,recall,page_size,provider_error FROM goget_event_pilot_reconciliation WHERE run_id=? ORDER BY pool LIMIT 11'],
 ['outcomes','SELECT horizon_min,status,COUNT(*) AS n,MIN(due_at) AS first_due_at,MAX(due_at) AS last_due_at FROM goget_event_pilot_outcomes WHERE run_id=? GROUP BY horizon_min,status LIMIT 100'],
 ['gaps','SELECT reason,COUNT(*) AS n,MIN(gap_at) AS first_at,MAX(gap_at) AS last_at FROM goget_event_pilot_gaps WHERE run_id=? GROUP BY reason LIMIT 100']
];
export async function collect({read,asOf=new Date().toISOString()}={}){
 const report={asOf,runId:ORIGINAL_RUN,status:'HISTORICAL_RECORDS_ONLY_EFFICACY_UNVERIFIED',
   expectedPools:10,queriesAttempted:0,queriesVerified:0,records:{},errors:[],heliusCalls:0,d1Writes:0,trades:0,
   limitations:['Persisted rows do not independently prove ACKs, on-chain recall, executable returns or a predictive edge.',
     'Empty or failed reads remain unknown; the expired pilot is never resumed.']};
 for(const [name,sql] of queries){
   report.queriesAttempted++;
   try{
     const rows=await read(sql,[ORIGINAL_RUN]);
     if(!Array.isArray(rows)||rows.length>=100)throw Error('READ_UNVERIFIED_OR_CAPPED');
     report.records[name]=rows;report.queriesVerified++;
   }catch(e){report.errors.push({query:name,reason:/^(READ_[A-Z_]+|D1_HTTP_\d+)$/.test(e?.message||'')?e.message:'READ_UNVERIFIED'});}
 }
 report.rosterVerified=report.records.run?.length===1&&report.records.roster?.length===10&&
   new Set(report.records.roster.map(x=>x.pool)).size===10&&report.records.roster.every(x=>x.pool&&x.mint&&x.asset_key);
 if(report.errors.length||!report.rosterVerified)report.status='HISTORICAL_EVIDENCE_INCOMPLETE';
 return report;
}
async function main(){
 const {CF_ACCOUNT_ID:a,CF_DATABASE_ID:d,CF_D1_API_TOKEN:k}=process.env;
 const report=await collect({read:async(sql,params)=>{
   if(!a||!d||!k)throw Error('READ_CREDENTIALS_UNAVAILABLE');
   const r=await fetch(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(a)}/d1/database/${encodeURIComponent(d)}/query`,{
     method:'POST',headers:{authorization:'Bearer '+k,'content-type':'application/json'},
     body:JSON.stringify({sql,params}),signal:AbortSignal.timeout(15000)});
   if(!r.ok)throw Error('D1_HTTP_'+r.status);
   const j=await r.json();
   if(j.success!==true||j.result?.[0]?.success!==true)throw Error('READ_PROVIDER_UNVERIFIED');
   return j.result[0].results;
 }});
 await writeFile('goget-event-pilot-historical-evidence.json',JSON.stringify(report,null,2)+'\n');
 console.log('GOGET_HISTORICAL_PILOT_EVIDENCE',JSON.stringify(report));
 if(report.status==='HISTORICAL_EVIDENCE_INCOMPLETE')process.exitCode=1;
}
if(process.argv[1]&&import.meta.url===(await import('node:url')).pathToFileURL(process.argv[1]).href)await main();
