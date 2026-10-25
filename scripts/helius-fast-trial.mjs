// Bounded live proof/soak driver. Secrets stay in process memory and CI secrets.
import {writeFileSync,appendFileSync} from 'node:fs';
import {discoverRegistry,readPumpSnapshots} from '../src/helius-fast-quotes.mjs';
const cycles=Math.min(121,Math.max(4,Number(process.env.TRIAL_CYCLES||4)));
const env={HELIUS_RPC_URL:'https://mainnet.helius-rpc.com/?api-key='+process.env.HELIUS_API_KEY};
const metrics={rpc_calls:0,response_bytes:0,d1_rows_read:0,d1_rows_written:0};
const output='helius-fast-trial.jsonl';writeFileSync(output,'');
const record=d=>{const line=JSON.stringify(d);appendFileSync(output,line+'\n');console.log(line)};
async function query(sql,params=[]){
 const url='https://api.cloudflare.com/client/v4/accounts/'+process.env.CF_ACCOUNT_ID+'/d1/database/'+process.env.CF_DATABASE_ID+'/query';
 const r=await fetch(url,{method:'POST',headers:{authorization:'Bearer '+process.env.CF_D1_API_TOKEN,'content-type':'application/json'},body:JSON.stringify({sql,params}),signal:AbortSignal.timeout(20000)});
 if(!r.ok)throw Error('D1_HTTP_'+r.status);
 const j=await r.json(),result=j.result?.[0];if(!j.success||!result?.success)throw Error('D1_QUERY_FAILED');
 metrics.d1_rows_read+=result.meta?.rows_read||0;metrics.d1_rows_written+=result.meta?.rows_written||0;
 return result.results||[];
}
try{
 if(!process.env.HELIUS_API_KEY)throw Error('HELIUS_NOT_CONFIGURED');
 const targets=await query(`SELECT asset_key,chain,address,symbol,pool FROM assets WHERE chain='solana' AND status IN ('ALIVE','STATIC') AND last_seen>='2026-10-23T08:10:00.000Z' AND pool IS NOT NULL ORDER BY score DESC,asset_key LIMIT 40`);
 const selection=await discoverRegistry(env,targets,{metrics});
 record({kind:'selection',at:new Date().toISOString(),registry:selection.registry,rejected:selection.rejected,metrics:{...metrics}});
 if(selection.registry.length!==5)throw Error('FIVE_SUPPORTED_POOLS_NOT_FOUND');
 await query(`CREATE TABLE IF NOT EXISTS chain_radar_samples (chain TEXT NOT NULL,pool TEXT NOT NULL,minute TEXT NOT NULL,asset_key TEXT NOT NULL,slot INTEGER NOT NULL,received_at TEXT NOT NULL,price_sol REAL NOT NULL,base_reserve_raw TEXT NOT NULL,quote_reserve_raw TEXT NOT NULL,decoder TEXT NOT NULL,PRIMARY KEY(chain,pool,minute))`);
 let slot=selection.slot,success=0,gaps=0;const started=Date.now(),times=[],slots=[],lastMinute=new Map();
 for(let i=0;i<cycles;i++){
  const due=started+i*30000;if(Date.now()<due)await new Promise(r=>setTimeout(r,due-Date.now()));
  const t=Date.now();
  try{
   const snapshot=await readPumpSnapshots(env,selection.registry,{minSlot:slot,metrics});
   const advanced=snapshot.slot>slot;
   if(snapshot.quotes.length!==5||!advanced){gaps++;record({kind:'gap',at:new Date().toISOString(),reason:!advanced?'SLOT_NOT_ADVANCED':'POOL_REJECTED',slot:snapshot.slot,rejected:snapshot.rejected})}
   else{
    success++;times.push(t);slots.push(snapshot.slot);
    for(const q of snapshot.quotes){
     const minute=q.received_at.slice(0,16)+':00.000Z';if(lastMinute.get(q.pool)===minute)continue;
     await query('INSERT OR IGNORE INTO chain_radar_samples(chain,pool,minute,asset_key,slot,received_at,price_sol,base_reserve_raw,quote_reserve_raw,decoder) VALUES(?,?,?,?,?,?,?,?,?,?)',
      ['solana',q.pool,minute,q.asset_key,q.slot,q.received_at,q.price_sol,q.base_reserve_raw,q.quote_reserve_raw,q.decoder]);
     lastMinute.set(q.pool,minute);
    }
    record({kind:'snapshot',cycle:i,elapsed_ms:Date.now()-t,...snapshot,metrics:{...metrics}});
   }
   slot=Math.max(slot,snapshot.slot);
  }catch(e){gaps++;record({kind:'gap',at:new Date().toISOString(),reason:/^(RPC_|D1_)/.test(e.message)?e.message:'TRIAL_READ_FAILED'});}
 }
 const intervals=times.slice(1).map((t,i)=>(t-times[i])/1000);
 const summary={kind:'summary',duration_seconds:(Date.now()-started)/1000,cycles,successful_cycles:success,gaps,slots,interval_seconds:intervals,metrics,estimated_standard_rpc_credits:metrics.rpc_calls,billed_credits:'NOT_DIRECTLY_MEASURED',price_type:'INDICATIVE_SOL_RESERVE_RATIO',usd_reference:'NOT_YET_ATTACHED'};
 record(summary);
 if(success<4||gaps>Math.max(0,Math.floor(cycles*.02)))process.exitCode=1;
}catch(e){record({kind:'failure',reason:/^[A-Z_0-9]+$/.test(e.message)?e.message:'LIVE_TRIAL_FAILED',metrics});process.exitCode=1;}
