import {WALLETS,ROSTER_VERSION,EXPECTED_WALLET_COUNT,assertRoster} from './wallets.mjs';
import {solanaDelta,evmDelta,normalizeSignature,normalizeEvmTx,classifyHelius,boundedError,evmEqual} from './normalize.mjs';
import {readHead,collectRpcCohort} from './robinhood-rpc.mjs';

const BS='https://robinhoodchain.blockscout.com/api/v2';
const MAX_SOL=300,MAX_EVM_PAGES=4,MAX_PARSE=60;
const EVENT_SQL='INSERT OR IGNORE INTO trackbigbux_activity (wallet_id,chain,tx_id,occurred_at,height,observed_at,category,initiated,source,evidence_json) VALUES (?,?,?,?,?,?,?,?,?,?)';
const statusHeaders={'cache-control':'no-store','content-type':'application/json; charset=utf-8'};
const iso=()=>new Date().toISOString();

async function json(url,options={},fetcher=fetch){
  const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),12000);
  try{
    const r=await fetcher(url,{...options,signal:ctl.signal,headers:{accept:'application/json',...(options.headers||{})}});
    if(!r.ok)throw Error('UPSTREAM_HTTP_'+r.status+'_'+new URL(url).hostname);
    const obj=await r.json();
    if(obj===null||typeof obj!=='object')throw Error('UPSTREAM_JSON_INVALID');
    return obj;
  }finally{clearTimeout(timer);}
}
async function insertBatch(db,statements) {
  for(let i=0;i<statements.length;i+=40) await db.batch(statements.slice(i,i+40));
}
async function persistEvents(db,events){
  const statements=events.map(e=>db.prepare(EVENT_SQL).bind(e.wallet_id,e.chain,e.tx_id,
    e.occurred_at,e.height,e.observed_at,e.category,e.initiated,e.source,e.evidence_json));
  if(statements.length)await insertBatch(db,statements);
}
async function loadCheckpoint(db,walletId){
  return await db.prepare('SELECT newest_tx_id,last_seen_at,gap_count FROM trackbigbux_wallet_state WHERE wallet_id=?').bind(walletId).first();
}
function collectSolWallet(wallet,checkpoint,env,fetcher,record) {
  return (async()=>{
    if(!env.HELIUS_API_KEY)throw Error('HELIUS_API_KEY_NOT_CONFIGURED');
    const endpoint='https://mainnet.helius-rpc.com/?api-key='+encodeURIComponent(env.HELIUS_API_KEY);
    const request={jsonrpc:'2.0',id:1,method:'getSignaturesForAddress',
      params:[wallet.address,{limit:MAX_SOL+1,commitment:'finalized'}]};
    let rows;
    try{
      const result=await json(endpoint,{method:'POST',headers:{'content-type':'application/json'},
        body:JSON.stringify(request)},fetcher);
      if(result.error)throw Error('HELIUS_RPC_'+String(result.error.code||'error'));
      if(!Array.isArray(result.result))throw Error('SOLANA_RPC_SCHEMA_INVALID');
      rows=result.result;
      record('helius_rpc','getSignaturesForAddress','OK',rows.length,'limit='+String(MAX_SOL+1));
    }catch(e){record('helius_rpc','getSignaturesForAddress','FAILED',0,boundedError(e));throw e;}
    const delta=solanaDelta(rows,checkpoint?.newest_tx_id,MAX_SOL);
    const now=iso();
    const normalized=delta.rows.map(x=>normalizeSignature(wallet,x,now)).filter(Boolean);
    const identityValid=normalized.length===delta.rows.length;
    return {events:normalized,
      status:identityValid?delta.status:'INVALID_TRANSACTION_IDS',
      checkpointMatched:identityValid&&delta.checkpointFound,latest:delta.newest,
      latestAt:rows[0]?.blockTime?new Date(rows[0].blockTime*1000).toISOString():null,
      fetched:rows.length,calls:1};
  })();
}
async function collectEvmWallet(wallet,checkpoint,fetcher,record){
  const all=[];
  let cursor=null,calls=0,hasMore=false;
  for(let page=0;page<MAX_EVM_PAGES;page++){
    const url=new URL(BS+'/addresses/'+wallet.address+'/transactions');
    if(cursor)for(const [k,v] of Object.entries(cursor))if(v!==null&&v!==undefined)url.searchParams.set(k,String(v));
    let data;
    try{
      data=await json(url.toString(),{},fetcher);
      if(!Array.isArray(data.items))throw Error('BLOCKSCOUT_SCHEMA_INVALID');
      record('blockscout','address_transactions','OK',data.items.length,'page='+String(page+1));
    }catch(e){record('blockscout','address_transactions','FAILED',0,boundedError(e));throw e;}
    calls++;
    all.push(...data.items);
    const matched=checkpoint?.newest_tx_id && data.items.some(x=>evmEqual(x.hash,checkpoint.newest_tx_id));
    cursor=data.next_page_params||null;
    hasMore=!!cursor;
    if(!cursor||!checkpoint?.newest_tx_id||matched)break;
  }
  const delta=evmDelta(all,checkpoint?.newest_tx_id,hasMore&&!!checkpoint?.newest_tx_id,MAX_EVM_PAGES*50);
  const now=iso();
  const normalized=delta.rows.map(x=>normalizeEvmTx(wallet,x,now)).filter(Boolean);
  const identityValid=normalized.length===delta.rows.length;
  return {events:normalized,
    status:identityValid?delta.status:'INVALID_TRANSACTION_IDS',
    checkpointMatched:identityValid&&delta.status==='OK',
    latest:delta.newest,latestAt:all[0]?.timestamp||null,
    fetched:all.length,calls};
}
async function saveWalletResult(db,runId,wallet,startedAt,result,receipts){
  const finish=iso();
  await persistEvents(db,result.events);
  // Save checkpoint AFTER evidence so a partial database write cannot skip a transaction.
  if(result.latest){
    const gap=result.status==='CHECKPOINT_NOT_FOUND'?1:0;
    await db.prepare('INSERT INTO trackbigbux_wallet_state (wallet_id,chain,address,newest_tx_id,last_completed_run,last_seen_at,updated_at,gap_count) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(wallet_id) DO UPDATE SET chain=excluded.chain,address=excluded.address,newest_tx_id=excluded.newest_tx_id,last_completed_run=excluded.last_completed_run,last_seen_at=excluded.last_seen_at,updated_at=excluded.updated_at,gap_count=trackbigbux_wallet_state.gap_count+excluded.gap_count')
      .bind(wallet.id,wallet.chain,wallet.address,result.latest,runId,result.latestAt,finish,gap).run();
  }
  await db.prepare('INSERT OR REPLACE INTO trackbigbux_coverage (run_id,wallet_id,chain,expected_address,provider,status,started_at,completed_at,fetch_calls,rows_received,rows_staged,checkpoint_matched,source_latest_tx,source_latest_at,error) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .bind(runId,wallet.id,wallet.chain,wallet.address,result.provider||(wallet.chain==='solana'?'helius_rpc':'blockscout'),
      result.status,startedAt,finish,result.calls,result.fetched,result.events.length,result.checkpointMatched?1:0,
      result.latest,result.latestAt,null).run();
  await saveReceipts(db,runId,wallet.id,receipts);
}
async function saveReceipts(db,runId,walletId,receipts){
  const stmts=receipts.map((r,i)=>db.prepare('INSERT OR IGNORE INTO trackbigbux_receipts (run_id,wallet_id,seq,source,request_kind,observed_at,result_status,response_records,details) VALUES (?,?,?,?,?,?,?,?,?)')
    .bind(runId,walletId,i+1,r.source,r.kind,r.at,r.status,r.records,r.details));
  if(stmts.length)await insertBatch(db,stmts);
}
async function saveFailure(db,runId,wallet,startedAt,error,receipts) {
  await db.prepare('INSERT OR REPLACE INTO trackbigbux_coverage (run_id,wallet_id,chain,expected_address,provider,status,started_at,completed_at,fetch_calls,rows_received,rows_staged,checkpoint_matched,source_latest_tx,source_latest_at,error) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .bind(runId,wallet.id,wallet.chain,wallet.address,wallet.chain==='solana'?'helius_rpc':'blockscout',
      'ERROR',startedAt,iso(),receipts.length,0,0,0,null,null,boundedError(error)).run();
  await saveReceipts(db,runId,wallet.id,receipts);
}
// Incremental enrichment is on a separate bounded hourly budget; other signatures stay pending.
async function enrichSolana(env,db,runId,fetcher,warnings){
  if(!env.HELIUS_API_KEY){warnings.push('ENRICHMENT_KEY_MISSING');return 0;}
  const q=await db.prepare("SELECT wallet_id,tx_id FROM trackbigbux_activity WHERE chain='solana' AND category='UNPARSED_SIGNATURE' ORDER BY observed_at ASC LIMIT ?").bind(MAX_PARSE).all();
  const rows=q.results||[];if(!rows.length)return 0;
  const url='https://api-mainnet.helius-rpc.com/v0/transactions/?api-key='+encodeURIComponent(env.HELIUS_API_KEY);
  let data;
  try {
    data=await json(url,{method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({transactions:[...new Set(rows.map(r=>r.tx_id))]})},fetcher);
    if(!Array.isArray(data))throw Error('HELIUS_PARSE_SCHEMA_INVALID');
    await db.prepare('INSERT OR IGNORE INTO trackbigbux_receipts (run_id,wallet_id,seq,source,request_kind,observed_at,result_status,response_records,details) VALUES (?,?,?,?,?,?,?,?,?)')
      .bind(runId,'__parser',1,'helius_enhanced','parseTransactions',iso(),'OK',data.length,'bounded_batch').run();
  }catch(e){
    warnings.push('ENRICHMENT_FAILED:'+boundedError(e));
    await db.prepare('INSERT OR IGNORE INTO trackbigbux_receipts (run_id,wallet_id,seq,source,request_kind,observed_at,result_status,response_records,details) VALUES (?,?,?,?,?,?,?,?,?)')
      .bind(runId,'__parser',1,'helius_enhanced','parseTransactions',iso(),'FAILED',0,boundedError(e)).run();
    return 0;
  }
  const requested=new Map(rows.map(x=>[x.tx_id,x.wallet_id]));
  const stmts=[];
  for(const tx of data){
    const walletId=requested.get(tx.signature);
    if(!walletId)continue;
    const wallet=WALLETS.find(w=>w.id===walletId);if(!wallet)continue;
    const parsed=classifyHelius(wallet,tx);if(!parsed)continue;
    stmts.push(db.prepare("UPDATE trackbigbux_activity SET category=?,initiated=?,source=?,evidence_json=? WHERE wallet_id=? AND chain='solana' AND tx_id=? AND category='UNPARSED_SIGNATURE'")
      .bind(parsed.category,parsed.initiated,parsed.source,parsed.evidence_json,walletId,tx.signature));
  }
  if(stmts.length)await insertBatch(db,stmts);
  return stmts.length;
}
export async function collect(env,{now=new Date(),fetcher=fetch}={}){
  assertRoster();
  if(!env.DB)throw Error('TRACKBIGBUX_D1_MISSING');
  const bucket=Math.floor(now.getTime()/300000),runId='trackbigbux-'+bucket,start=now.toISOString();
  const claim=await env.DB.prepare('INSERT OR IGNORE INTO trackbigbux_runs (bucket,run_id,roster_version,started_at,status,expected_wallets) VALUES (?,?,?,?,?,?)')
    .bind(bucket,runId,ROSTER_VERSION,start,'RUNNING',EXPECTED_WALLET_COUNT).run();
  if(claim.meta?.changes===0)return {project:'trackBIGBUX',runId,already_run:true};
  let attempted=0,complete=0,baselines=0,partial=0,seen=0,staged=0,parsed=0,pending=0;
  const warnings=[];
  let rpcHead=null,rpcHeadError=null,rpcCohort=null,rpcCohortError=null;
  const rpcCohortReceipts=[];
  if(env.TRACKBIGBUX_RH_MODE==='rpc_transfer_only') {
    try{rpcHead=await readHead(fetcher);}
    catch(e){rpcHeadError=e;warnings.push('ROBINHOOD_RPC_HEAD:'+boundedError(e));}
  }
  try{
    for(const wallet of WALLETS){
      const startWallet=iso(),receipts=[];
      const record=(source,kind,status,records,details)=>{
        receipts.push({source,kind,status,records,details,at:iso()});
      };
      attempted++;
      try{
        const checkpoint=await loadCheckpoint(env.DB,wallet.id);
        let result;
        if(wallet.chain==='solana'){
          result=await collectSolWallet(wallet,checkpoint,env,fetcher,record);
        } else if(env.TRACKBIGBUX_RH_MODE==='rpc_transfer_only'){
          if(rpcHeadError) {
            record('robinhood_public_rpc','eth_blockNumber','FAILED',0,boundedError(rpcHeadError));
            throw rpcHeadError;
          }
          if(!rpcCohort&&!rpcCohortError){
            const wallets=WALLETS.filter(w=>w.chain==='robinhood'),checkpoints=new Map();
            for(const w of wallets)checkpoints.set(w.id,await loadCheckpoint(env.DB,w.id));
            try {
              rpcCohort=await collectRpcCohort(wallets,checkpoints,rpcHead,fetcher,
                (source,kind,status,count,details)=>rpcCohortReceipts.push({source,kind,status,count,details}),iso());
            }catch(e){rpcCohortError=e;}
          }
          if(rpcCohortError) {
            record('robinhood_public_rpc','eth_getLogs_batch','FAILED',0,boundedError(rpcCohortError));
            throw rpcCohortError;
          }
          result=rpcCohort.get(wallet.id);
          if(!result)throw Error('RPC_COHORT_WALLET_MISSING');
          for(const receipt of rpcCohortReceipts){
            record(receipt.source,receipt.kind,receipt.status,receipt.count,
              receipt.details+';shared_cohort=7;wallet_matches='+result.fetched);
          }
        } else {
          result=await collectEvmWallet(wallet,checkpoint,fetcher,record);
        }
        await saveWalletResult(env.DB,runId,wallet,startWallet,result,receipts);
        seen+=result.fetched;staged+=result.events.length;
        if(result.status==='OK')complete++;
        else if(result.status==='BASELINE_ONLY')baselines++;
        else {partial++;warnings.push(wallet.id+':'+result.status);}
      }catch(e){
        partial++;warnings.push(wallet.id+':'+boundedError(e));
        await saveFailure(env.DB,runId,wallet,startWallet,e,receipts);
      }
    }
    if(bucket%12===0)parsed=await enrichSolana(env,env.DB,runId,fetcher,warnings);
    const p=await env.DB.prepare("SELECT count(*) AS n FROM trackbigbux_activity WHERE chain='solana' AND category='UNPARSED_SIGNATURE'").first();
    pending=Number(p?.n||0);
    const status=(complete===EXPECTED_WALLET_COUNT&&partial===0&&baselines===0)?
      'RAW_COVERAGE_COMPLETE':'INCOMPLETE';
    await env.DB.prepare('INSERT OR REPLACE INTO trackbigbux_quality (run_id,observed_at,roster_version,frozen_denominator,covered,complete,baselines,partial,parser_pending,classification_notice) VALUES (?,?,?,?,?,?,?,?,?,?)')
      .bind(runId,iso(),ROSTER_VERSION,EXPECTED_WALLET_COUNT,attempted,complete,baselines,partial,pending,
        'RAW_TRANSACTIONS_NOT_INDEPENDENT_TRADE_PNL').run();
    await env.DB.prepare('UPDATE trackbigbux_runs SET completed_at=?,status=?,attempted_wallets=?,complete_wallets=?,first_baselines=?,partial_wallets=?,events_seen=?,events_staged=?,enhanced_parsed=?,parser_backlog=?,warnings_json=? WHERE bucket=?')
      .bind(iso(),status,attempted,complete,baselines,partial,seen,staged,parsed,pending,
        JSON.stringify(warnings.slice(0,40)),bucket).run();
    return {project:'trackBIGBUX',runId,status,expected:EXPECTED_WALLET_COUNT,attempted,
      complete,baselines,partial,eventsSeen:seen,eventsStaged:staged,parsed,pending,warnings};
  }catch(e){
    warnings.push('FATAL:'+boundedError(e));
    await env.DB.prepare('UPDATE trackbigbux_runs SET completed_at=?,status=?,attempted_wallets=?,complete_wallets=?,first_baselines=?,partial_wallets=?,events_seen=?,events_staged=?,enhanced_parsed=?,parser_backlog=?,warnings_json=? WHERE bucket=?')
      .bind(iso(),'ERROR',attempted,complete,baselines,partial,seen,staged,parsed,pending,
        JSON.stringify(warnings.slice(0,40)),bucket).run();
    throw e;
  }
}
export async function getStatus(db){
  const run=await db.prepare('SELECT * FROM trackbigbux_runs ORDER BY bucket DESC LIMIT 1').first();
  const coverage=run?await db.prepare('SELECT wallet_id,chain,status,started_at,completed_at,rows_received,rows_staged,checkpoint_matched,source_latest_at,error FROM trackbigbux_coverage WHERE run_id=? ORDER BY wallet_id LIMIT 20').bind(run.run_id).all():{results:[]};
  const quality=await db.prepare('SELECT * FROM trackbigbux_quality ORDER BY observed_at DESC LIMIT 12').all();
  return {project:'trackBIGBUX',rosterVersion:ROSTER_VERSION,expectedWallets:EXPECTED_WALLET_COUNT,
    status:run?.status||'NO_RUNS',run:run||null,coverage:coverage.results||[],
    audits:quality.results||[],wallets:WALLETS};
}
function respond(obj,status=200){return new Response(JSON.stringify(obj),{status,headers:statusHeaders});}
const HTML='<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta charset="utf-8"><title>trackBIGBUX</title><style>body{font:16px system-ui;background:#101924;color:#f2f6f8;margin:auto;max-width:1050px;padding:24px}table{width:100%;border-collapse:collapse}td,th{text-align:left;padding:9px;border-bottom:1px solid #405169}a{color:#9dd} .muted{color:#acb6c4}</style></head><body><h1>trackBIGBUX</h1><p>Read-only wallet evidence collector · independent of trackCA and GOGET</p><p id="status">Loading D1 status...</p><table><thead><tr><th>Wallet</th><th>Chain</th><th>Coverage</th><th>Observed</th></tr></thead><tbody id="rows"></tbody></table><p class="muted">Transfers are not trades. Parsing is bounded. Profit and consistency require later independent reconstruction.</p><script>fetch("/api/status",{cache:"no-store"}).then(r=>r.json()).then(j=>{document.querySelector("#status").textContent=(j.run?.started_at||"Not collected yet")+" · "+j.status+" · "+(j.run?.complete_wallets||0)+"/"+j.expectedWallets+" complete checkpoints";const c=Object.fromEntries(j.coverage.map(x=>[x.wallet_id,x]));document.querySelector("#rows").innerHTML=j.wallets.map(w=>"<tr><td>"+w.name+"</td><td>"+w.chain+"</td><td>"+(c[w.id]?.status||"PENDING")+"</td><td>"+(c[w.id]?.source_latest_at||"—")+"</td></tr>").join("")}).catch(()=>document.querySelector("#status").textContent="Status unavailable");</script></body></html>';
export default {
  async scheduled(_event,env,ctx){
    ctx.waitUntil(collect(env).then(x=>console.log('trackBIGBUX',JSON.stringify(x)))
      .catch(e=>console.error('trackBIGBUX_ERROR',boundedError(e))));
  },
  async fetch(request,env) {
    if(request.method!=='GET')return new Response('Method Not Allowed',{status:405});
    const u=new URL(request.url),p=u.pathname;
    if(p==='/')return new Response(HTML,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store'}});
    if(p==='/health'||p==='/api/status'){
      try{
        const s=await getStatus(env.DB);
        if(p==='/health')return respond({project:s.project,status:s.status,rosterVersion:s.rosterVersion,
          expectedWallets:s.expectedWallets,lastRunAt:s.run?.started_at||null,
          completeWallets:s.run?.complete_wallets||0,pendingParse:s.run?.parser_backlog||0});
        return respond(s);
      }catch(e){return respond({project:'trackBIGBUX',status:'STORAGE_ERROR'},503);}
    }
    if(p==='/api/events'){
      const id=u.searchParams.get('wallet');
      if(!WALLETS.some(w=>w.id===id))return respond({error:'KNOWN_WALLET_ID_REQUIRED'},400);
      const limit=Math.max(1,Math.min(200,Number(u.searchParams.get('limit')||50)||50));
      const before=u.searchParams.get('before'),beforeTx=u.searchParams.get('before_tx');
      try{
        const q=before&&beforeTx?
          env.DB.prepare('SELECT * FROM trackbigbux_activity WHERE wallet_id=? AND (observed_at<? OR (observed_at=? AND tx_id<?)) ORDER BY observed_at DESC,tx_id DESC LIMIT ?').bind(id,before,before,beforeTx,limit):
          env.DB.prepare('SELECT * FROM trackbigbux_activity WHERE wallet_id=? ORDER BY observed_at DESC,tx_id DESC LIMIT ?').bind(id,limit);
        const data=await q.all(),events=data.results||[],last=events[events.length-1];
        return respond({project:'trackBIGBUX',wallet:id,events,limit,
          next_cursor:events.length===limit?{before:last.observed_at,before_tx:last.tx_id}:null});
      }catch(e){return respond({status:'STORAGE_ERROR'},503);}
    }
    return new Response('Not Found',{status:404});
  }
};
