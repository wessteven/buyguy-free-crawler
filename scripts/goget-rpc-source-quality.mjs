#!/usr/bin/env node
// Independent 6-read D1 verification for the Cloudflare 3-wallet live source collector.
import {writeFile} from 'node:fs/promises';
import {GAP_WALLETS} from '../src/goget-wallet-gap-wave.mjs';
import {evaluateRpcSourceLedger} from '../src/goget-rpc-source-ledger.mjs';
const value=k=>{if(!process.env[k])throw Error('MISSING_'+k);return process.env[k];};
const url='https://api.cloudflare.com/client/v4/accounts/'+encodeURIComponent(value('CF_ACCOUNT_ID'))+
 '/d1/database/'+encodeURIComponent(value('CF_DATABASE_ID'))+'/query';
const key=value('CF_D1_API_TOKEN');let calls=0;
async function read(sql,params=[]){
 if(++calls>6)throw Error('RPC_QUALITY_D1_QUERY_CAP');
 const response=await fetch(url,{method:'POST',
  headers:{authorization:'Bearer '+key,'content-type':'application/json'},
  body:JSON.stringify({sql,params}),signal:AbortSignal.timeout(16000)});
 if(!response.ok)throw Error('RPC_QUALITY_HTTP_'+response.status);
 const r=await response.json();
 if(r?.success!==true||r.result?.[0]?.success!==true||
   !Array.isArray(r.result[0].results))throw Error('RPC_QUALITY_D1_UNVERIFIED');
 if(r.result[0].results.length>=100)throw Error('RPC_QUALITY_TRUNCATED');
 return r.result[0].results;
}
const now=new Date(),from=new Date(now.getTime()-6*3600000).toISOString();
const [cycles,states,signatures,gaps,rpcBudget,webhookBudget]=await Promise.all([
 read('SELECT slot_utc,trigger,status,helius_calls,credits_reserved,wallets_scanned,signatures_saved,source_gaps FROM goget_rpc_source_cycles WHERE slot_utc>=? ORDER BY slot_utc DESC LIMIT 99',[from]),
 read('SELECT wallet,head_signature,last_checked_at,gaps,status FROM goget_rpc_source_wallets ORDER BY wallet LIMIT 5'),
 read('SELECT wallet,COUNT(*) AS n,SUM(failed) AS failed,MIN(observed_at) AS first_at,MAX(observed_at) AS last_at FROM goget_rpc_source_signatures GROUP BY wallet LIMIT 5'),
 read("SELECT wallet,COUNT(*) AS n FROM goget_rpc_source_gaps WHERE status='UNRESOLVED' GROUP BY wallet LIMIT 5"),
 read('SELECT day,reserved_credits FROM goget_rpc_source_budget ORDER BY day DESC LIMIT 2'),
 read('SELECT day,observed_deliveries FROM smart_wallet_webhook_credit_estimates ORDER BY day DESC LIMIT 2')
]);
const result=evaluateRpcSourceLedger({cycles,states,signatures,gaps,rpcBudget,webhookBudget,asOf:now.toISOString(),
 expectedWallets:GAP_WALLETS});
result.d1Reads=calls;result.heliusCalls=0;result.d1Writes=0;result.trades=0;
await writeFile('goget-rpc-source-quality.json',JSON.stringify(result,null,2)+'\n');
console.log('GOGET_RPC_SOURCE_QUALITY',JSON.stringify(result));
if(!result.allSourceWalletsPresent)process.exitCode=1;
