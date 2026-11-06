import {PAIRS} from './config.mjs';
import {rpcSnapshot,fetchStream} from './providers.mjs';

const utc=()=>new Date().toISOString();
function stmt(db,sql,args=[]){return db.prepare(sql).bind(...args);}
async function checkpoint(db,pair,kind){
  return await stmt(db,'SELECT newest_event_key,baseline_complete FROM vladwatch_checkpoints WHERE wallet_id=? AND chain_id=? AND stream=?',[pair.walletId,pair.chainId,kind]).first();
}
async function storeStream(db,pair,kind,result,previous,now){
  if(result.status==='failed')return;
  // Persist first, checkpoint last. If writes fail, next run will retry by stable event IDs.
  const events=result.events;
  for(let i=0;i<events.length;i+=70){
    await db.batch(events.slice(i,i+70).map(e=>stmt(db,`INSERT OR IGNORE INTO vladwatch_events
    (chain_id,address,event_key,wallet_id,tx_hash,block_number,occurred_at,discovered_at,stream,direction,from_address,to_address,token_contract,token_symbol,raw_amount,decimals,classification,trade_verified,liquidity_verified,source,baseline)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,0,?,?)`,[
      e.chainId,e.address,e.id,pair.walletId,e.hash,e.block,e.timestamp,now,kind,e.direction,e.from,e.to,e.asset,e.symbol,e.raw,e.decimals,e.classification,e.source,previous?0:1
    ])));
  }
  // Advance only with complete incremental coverage OR when establishing the initial high-water mark.
  if(result.status==='checked'||!previous){
    const newest=events.length?events[0].id:(previous?.newest_event_key??null);
    const baselineComplete=previous? Number(previous.baseline_complete)===1 : result.historyExhausted;
    await stmt(db,`INSERT INTO vladwatch_checkpoints(wallet_id,chain_id,stream,newest_event_key,updated_at,baseline_complete)
      VALUES(?,?,?,?,?,?) ON CONFLICT(wallet_id,chain_id,stream)
      DO UPDATE SET newest_event_key=excluded.newest_event_key,updated_at=excluded.updated_at,baseline_complete=excluded.baseline_complete`,[
      pair.walletId,pair.chainId,kind,newest,now,baselineComplete?1:0
    ]).run();
  }
}
export async function scanPair(db,pair,env={},fetcher=fetch,runId='test-run'){
  const now=utc();
  const [txPrior,tokenPrior]=await Promise.all([checkpoint(db,pair,'tx'),checkpoint(db,pair,'token')]);
  const [native,tx,token]=await Promise.all([
    rpcSnapshot(pair.chainId,pair.address,env,fetcher),
    fetchStream(pair,'tx',txPrior?.newest_event_key??null,env,fetcher,!!txPrior),
    fetchStream(pair,'token',tokenPrior?.newest_event_key??null,env,fetcher,!!tokenPrior)
  ]);
  // No stream is considered complete on provider failures or pagination budget overruns.
  await storeStream(db,pair,'tx',tx,txPrior,now);
  await storeStream(db,pair,'token',token,tokenPrior,now);
  const ss=[native.status,tx.status,token.status];
  const overall=ss.every(s=>s==='checked')?'checked':ss.every(s=>s==='failed')?'failed':'partial';
  const newVerifiedSinceCheckpoint=(result,prior)=>prior&&result.status==='checked'?result.events.length:0;
  const newTx=newVerifiedSinceCheckpoint(tx,txPrior),newTokens=newVerifiedSinceCheckpoint(token,tokenPrior);
  const details={
    attribution:'UNVERIFIED PERSONAL CONTROL',nativeCoverage:'snapshot only; native history depends on indexed tx stream',
    initialBaseline:!txPrior||!tokenPrior,
    historicTxBackfillComplete:txPrior?Boolean(txPrior.baseline_complete):tx.historyExhausted,
    historicTokenBackfillComplete:tokenPrior?Boolean(tokenPrior.baseline_complete):token.historyExhausted,
    txNewSinceCheckpoint:newTx,tokenNewSinceCheckpoint:newTokens,
    tradesVerified:0,liquidityVerified:0,
    note:'Token transfers and contract calls are NOT verified swaps. Airdrops remain possible; no owner attribution.'
  };
  const attempts={native:native.attempts,tx:tx.attempts,token:token.attempts};
  await stmt(db,`INSERT INTO vladwatch_coverage
  (run_id,wallet_id,chain_id,observed_at,native_status,tx_status,token_status,overall,native_source,tx_source,token_source,native_balance_wei,native_nonce,block_hex,attempts_json,details_json)
  VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,[
    runId,pair.walletId,pair.chainId,now,native.status,tx.status,token.status,overall,
    native.source,tx.source,token.source,native.wei||null,native.nonce||null,native.block||null,
    JSON.stringify(attempts),JSON.stringify(details)
  ]).run();
  return {pair,overall,details};
}
export async function runCollector(env,triggerKind='cron',fetcher=fetch){
  const db=env.DB;
  if(!db)throw new Error('D1_BINDING_MISSING');
  const id=`${utc()}:${crypto.randomUUID()}`;
  await stmt(db,`INSERT INTO vladwatch_runs(id,started_at,trigger_kind,expected_pairs) VALUES(?,?,?,?)`,[id,utc(),triggerKind,PAIRS.length]).run();
  const results=[];const failures=[];
  // At most 2 active wallet/chain probes to avoid saturating six Worker outbound connections.
  for(let i=0;i<PAIRS.length;i+=2){
    const batch=await Promise.all(PAIRS.slice(i,i+2).map(async pair=>{
      try {return await scanPair(db,pair,env,fetcher,id);}
      catch(error){
        failures.push({walletId:pair.walletId,chainId:pair.chainId,error:String(error).slice(0,260)});
        // A collector or D1 exception must be visible in coverage, never interpreted as a quiet wallet.
        try{await stmt(db,`INSERT OR REPLACE INTO vladwatch_coverage
        (run_id,wallet_id,chain_id,observed_at,native_status,tx_status,token_status,overall,attempts_json,details_json)
        VALUES(?,?,?,?,?,?,?,?,?,?)`,[id,pair.walletId,pair.chainId,utc(),'failed','failed','failed','failed','{}',JSON.stringify({collectorError:String(error).slice(0,220)})]).run();}
        catch(_){ /* the entire run will fail the coverage gate */ }
        return {pair,overall:'failed'};
      }
    }));
    results.push(...batch);
  }
  const counts={checked:results.filter(x=>x.overall==='checked').length,partial:results.filter(x=>x.overall==='partial').length,failed:results.filter(x=>x.overall==='failed').length};
  const actual=await stmt(db,'SELECT COUNT(*) AS n FROM vladwatch_coverage WHERE run_id=?',[id]).first();
  const gate=(actual?.n===PAIRS.length&&results.length===PAIRS.length);
  const state=gate?(counts.checked===PAIRS.length?'checked':counts.checked===0&&counts.partial===0?'failed':'partial'):'failed';
  await stmt(db,`UPDATE vladwatch_runs SET completed_at=?,checked_pairs=?,partial_pairs=?,failed_pairs=?,state=?,error=? WHERE id=?`,[
    utc(),counts.checked,counts.partial,counts.failed,state,failures.length?JSON.stringify(failures):gate?null:'COVERAGE_GATE_FAILED',id
  ]).run();
  return {id,state,expected:PAIRS.length,actual:actual?.n,counts,failures};
}