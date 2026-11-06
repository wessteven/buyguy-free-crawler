// One-shot independent collector bootstrap from GitHub Actions; no trading and no other D1 namespaces.
import {runCollector} from '../../vladwatch/src/collector.mjs';
const account=process.env.CF_ACCOUNT_ID, database=process.env.CF_DATABASE_ID, token=process.env.CF_D1_API_TOKEN;
if(!account||!database||!token)throw new Error('CLOUDFLARE_D1_AUTH_MISSING');
const endpoint=`https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/${database}/query`;
function validateSql(sql){
  const matches=[...sql.matchAll(/\b(?:FROM|INTO|UPDATE|JOIN)\s+([a-z][a-z0-9_]*)/ig)];
  if(!matches.length||matches.some(m=>!m[1].startsWith('vladwatch_')) || /\b(?:DROP|ALTER|DELETE|ATTACH|DETACH|PRAGMA|CREATE)\b/i.test(sql))
    throw new Error('VLADWATCH_ONLY_SQL_GATE_FAILED');
}
async function request(sql,params){
 validateSql(sql);
 const ctrl=new AbortController();const timeout=setTimeout(()=>ctrl.abort(),25000);
 try{
  const r=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json','authorization':`Bearer ${token}`},body:JSON.stringify({sql,params}),signal:ctrl.signal});
  if(!r.ok)throw new Error(`D1_HTTP_${r.status}`);
  const j=await r.json(), data=j.result?.[0];
  if(j.success!==true||!data||data.success!==true)throw new Error('D1_QUERY_FAILED_'+JSON.stringify(j.errors||[]).slice(0,150));
  return data;
 }finally{clearTimeout(timeout);}
}
class Query{
 constructor(sql){this.sql=sql;this.args=[];}
 bind(...args){this.args=args;return this;}
 async first(){const r=await request(this.sql,this.args);return r.results?.[0]??null;}
 async all(){const r=await request(this.sql,this.args);return {results:r.results||[]};}
 async run(){const r=await request(this.sql,this.args);return {success:true,meta:r.meta||{}};}
}
const DB={
 prepare(sql){return new Query(sql);},
 async batch(q){
  // D1 REST accepts multi-row prepared INSERTs. Avoid one HTTPS request per event.
  if(!q.length)return [];
  const sql=q[0].sql;
  if(!q.every(x=>x.sql===sql))throw new Error('MIXED_BATCH_SQL_REJECTED');
  const parts=/^(.*?\bVALUES)\s*(\(.*\))\s*$/is.exec(sql);
  if(!parts || !/^\s*INSERT OR IGNORE INTO vladwatch_events\b/i.test(sql))throw new Error('BATCH_INSERT_ONLY_GATE');
  const results=[];
  for(let i=0;i<q.length;i+=20){
   const chunk=q.slice(i,i+20);
   const multiSql=parts[1]+' '+chunk.map(()=>parts[2]).join(', ');
   const params=chunk.flatMap(x=>x.args);
   // 20 events x 19 parameters = 380 parameters, within conservative D1 limits.
   results.push(await request(multiSql,params));
  }
  return results;
 }
};
const result=await runCollector({DB},'github-one-shot-live-bootstrap');
console.log('VLAD_BOOTSTRAP_UTC',new Date().toISOString());
console.log('VLAD_BOOTSTRAP_RESULT',JSON.stringify(result));
const r=await new Query('SELECT wallet_id,chain_id,overall,native_status,tx_status,token_status,attempts_json,details_json FROM vladwatch_coverage WHERE run_id=?').bind(result.id).all();
for(const x of r.results){
 const attempt=JSON.parse(x.attempts_json||'{}');
 const info=JSON.parse(x.details_json||'{}');
 console.log('VLAD_SOURCE_EVIDENCE',JSON.stringify({wallet:x.wallet_id,chain:x.chain_id,overall:x.overall,native:x.native_status,tx:x.tx_status,token:x.token_status,attempts:attempt,history:{initialBaseline:info.initialBaseline,historicTxBackfillComplete:info.historicTxBackfillComplete,historicTokenBackfillComplete:info.historicTokenBackfillComplete}}));
}
if(result.actual!==5)throw new Error('FIVE_PAIR_COVERAGE_PERSISTENCE_FAILED');
if(result.state!=='checked')throw new Error('PROVIDERS_PARTIAL_OR_FAILED_SEE_LEDGER_ABOVE');
console.log('PRODUCTION_BOOTSTRAP_FULL_COVERAGE_CONFIRMED');