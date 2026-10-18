// D1 transactional paper ledger. ONLY runs behind explicit PAPER_SIMULATION_ENABLED.
// No wallet keys, signing, swaps, webhooks or real orders.
import {choosePaperEntry,choosePaperExit,markPosition,PAPER_CONFIG} from './paper-core.mjs';

const read=async(db,sql,...args)=>(await db.prepare(sql).bind(...args).all()).results||[];
const isEnabled=env=>env?.PAPER_SIMULATION_ENABLED==='true';
export async function getPaperSnapshot(env,now=Date.now()){
  const account=(await read(env.DB,"SELECT * FROM paper_account WHERE account='buyguy-v3'"))[0];
  const positions=await read(env.DB,`SELECT p.*,a.pool AS quote_pool,a.price AS quote_price,
    a.last_seen AS quote_seen,a.liquidity AS quote_liquidity
    FROM paper_positions p LEFT JOIN assets a ON a.asset_key=p.asset_key WHERE p.status='OPEN'`);
  let value=0,unknown=0;
  const marked=positions.map(p=>{
    const estimate=markPosition(p,{asset_key:p.asset_key,pool:p.quote_pool,
      price:p.quote_price,last_seen:p.quote_seen},{now});
    if(estimate.stale)unknown++;else value+=estimate.estimatedValue;
    return {asset_key:p.asset_key,entry:p.entry_usd,units:p.units,
      cost:p.cost_usd,stop:p.stop_usd,target:p.target_usd,...estimate};
  });
  return {cash:account?.cash,starting_cash:account?.starting_cash,realised:account?.realised,
    estimated_total:unknown?null:(Number(account?.cash||0)+value),
    unknown_marks:unknown,positions:marked,
    evidence:'INDICATIVE_QUOTE_WITH_ADVERSE_SLIPPAGE'};
}
export async function runPaperGame(env,{now=Date.now(),dryRun=false}={}){
  if(!env.DB)throw Error('Paper engine missing D1');
  if(!isEnabled(env)&&!dryRun)return {enabled:false,orders:0,reason:'PAPER_SIMULATION_DISABLED'};
  const time=new Date(now).toISOString();
  const acct=(await read(env.DB,"SELECT * FROM paper_account WHERE account='buyguy-v3'"))[0];
  if(!acct)throw Error('Paper account not initialized');
  let cash=Number(acct.cash),realized=Number(acct.realised),trades=0,open=0;
  const positions=await read(env.DB,"SELECT * FROM paper_positions WHERE status='OPEN'");
  open=positions.length;
  for(const p of positions){
    const asset=(await read(env.DB,'SELECT * FROM assets WHERE asset_key=?',p.asset_key))[0];
    if(!asset)continue;
    const outcome=choosePaperExit(p,asset,{now});
    if(!outcome.ok)continue;
    if(!dryRun){
      const statements=[
        env.DB.prepare(`UPDATE paper_positions SET status='CLOSED',closed_at=?,
          exit_usd=?,realised_usd=? WHERE id=? AND status='OPEN'`).bind(time,outcome.price,outcome.realized,p.id),
        env.DB.prepare(`UPDATE paper_account SET cash=cash+?,realised=realised+?,
          updated_at=? WHERE account='buyguy-v3' AND changes()=1`).bind(outcome.proceeds,outcome.realized,time),
        env.DB.prepare(`INSERT INTO paper_trades
          (position_id,asset_key,at,side,quote_price,execution_assumption,units,cash_delta,fee,reason,evidence)
          SELECT ?,?,?, 'SELL',?,?,?,?,?,?, 'INDICATIVE_QUOTE_ONLY'
          WHERE changes()=1`).bind(p.id,p.asset_key,time,outcome.quote,outcome.price,p.units,outcome.proceeds,outcome.fee,outcome.reason)
      ];
      // The last changes() needs the preceding ACCOUNT update; all statements share a D1 batch.
      const result=await env.DB.batch(statements);
      if((result[0]?.meta?.changes??0)!==1)continue;
    }
    cash+=outcome.proceeds;
    realized+=outcome.realized;
    open--;trades++;
  }
  const candidates=await read(env.DB,`SELECT * FROM assets
      WHERE status='ALIVE' AND risk_status='PAPER_ELIGIBLE'
      ORDER BY score DESC LIMIT 15`);
  for(const a of candidates){
    if(open>=PAPER_CONFIG.maxOpenPositions)break;
    const existing=await read(env.DB,
      "SELECT opened_at,closed_at,status FROM paper_positions WHERE asset_key=? ORDER BY opened_at DESC LIMIT 1",a.asset_key);
    const prior=existing[0];
    const entry=choosePaperEntry(a,{now,cash,openCount:open,realized,hasOpen:prior?.status==='OPEN',lastExit:prior?.closed_at});
    if(!entry.ok)continue;
    if(!dryRun){
      const id=crypto.randomUUID();
      const cooldownTime=new Date(now-PAPER_CONFIG.cooldownHours*3600000).toISOString();
      const statements=[
        env.DB.prepare(`UPDATE paper_account SET cash=cash-?,updated_at=?
          WHERE account='buyguy-v3' AND cash>=?
            AND (SELECT COUNT(*) FROM paper_positions WHERE status='OPEN')<?
            AND NOT EXISTS (SELECT 1 FROM paper_positions WHERE asset_key=? AND status='OPEN')
            AND NOT EXISTS (SELECT 1 FROM paper_positions WHERE asset_key=? AND closed_at>?)`)
          .bind(entry.cost,time,entry.cost,PAPER_CONFIG.maxOpenPositions,a.asset_key,a.asset_key,cooldownTime),
        env.DB.prepare(`INSERT INTO paper_positions
          (id,asset_key,pool,opened_at,units,entry_usd,cost_usd,stop_usd,target_usd,evidence)
          SELECT ?,?,?,?,?,?,?,?,?,'INDICATIVE_QUOTE_ONLY' WHERE changes()=1`)
          .bind(id,a.asset_key,entry.pool,time,entry.units,entry.price,entry.cost,entry.stop,entry.target),
        env.DB.prepare(`INSERT INTO paper_trades
          (position_id,asset_key,at,side,quote_price,execution_assumption,units,cash_delta,fee,reason,evidence)
          SELECT ?,?,?, 'BUY',?,?,?,?,?,'MOMENTUM_ENTRY','INDICATIVE_QUOTE_ONLY'
          WHERE changes()=1`)
          .bind(id,a.asset_key,time,entry.quote,entry.price,entry.units,-entry.cost,entry.fee)
      ];
      const result=await env.DB.batch(statements);
      if((result[0]?.meta?.changes??0)!==1)continue;
    }
    cash-=entry.cost;open++;trades++;
  }
  return {enabled:isEnabled(env),dryRun,orders:trades,cash,realized,open,
    caveat:'Indicative only; fees, slippage and missed fills may differ substantially in actual pools'};
}
