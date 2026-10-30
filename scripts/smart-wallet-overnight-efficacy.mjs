#!/usr/bin/env node
import {writeFile} from 'node:fs/promises';
import {summarizeNight,NIGHT_START,NIGHT_END} from '../src/smart-wallet-overnight-metrics.mjs';
const vars=['CF_ACCOUNT_ID','CF_DATABASE_ID','CF_D1_API_TOKEN'].map(k=>process.env[k]);
const uri=vars.every(Boolean)?'https://api.cloudflare.com/client/v4/accounts/'+vars[0]+'/d1/database/'+vars[1]+'/query':null;
async function query(sql,params=[]){
 const r=await fetch(uri,{method:'POST',headers:{authorization:'Bearer '+vars[2],'content-type':'application/json'},
  body:JSON.stringify({sql,params}),signal:AbortSignal.timeout(20000)});
 if(!r.ok)throw Error('D1_HTTP_'+r.status);
 const data=await r.json();if(!data?.success||!data.result?.[0]?.success)throw Error('D1_RESPONSE_FAILURE');
 return data.result[0].results||[];
}
async function main(){
 if(!uri)throw Error('D1_CREDENTIALS_MISSING');
 const now=new Date().toISOString(),stop=new Date(Math.min(Date.now(),Date.parse(NIGHT_END))).toISOString();
 const [w,p,c,b,wCount,pCount]=await Promise.all([
  query('SELECT wallet,signature,observed_at,classification,delay_ms FROM smart_wallet_webhook_events WHERE observed_at>=? AND observed_at<=? ORDER BY observed_at DESC LIMIT 1200',[NIGHT_START,stop]),
  query('SELECT wallet,signature,observed_at,classification,baseline FROM smart_wallet_live_events WHERE observed_at>=? AND observed_at<=? ORDER BY observed_at DESC LIMIT 500',[NIGHT_START,stop]),
  query('SELECT wallet,last_polled_at,status,gaps FROM smart_wallet_live_cursors ORDER BY wallet LIMIT 3'),
  query('SELECT day,reserved FROM smart_wallet_webhook_budget WHERE day>=? ORDER BY day DESC LIMIT 2',[NIGHT_START.slice(0,10)]),
  query('SELECT COUNT(*) AS count FROM smart_wallet_webhook_events WHERE observed_at>=? AND observed_at<=?',[NIGHT_START,stop]),
  query('SELECT COUNT(*) AS count FROM smart_wallet_live_events WHERE observed_at>=? AND observed_at<=?',[NIGHT_START,stop])
 ]);
 const result=summarizeNight({webhooks:w,polls:p,cursors:c,budget:b,now,webhookCount:wCount[0]?.count,pollCount:pCount[0]?.count});
 await writeFile('smart-wallet-overnight-efficacy.json',JSON.stringify(result,null,2)+'\n','utf8');
 console.log('GOGET_NIGHT_EFFICACY',JSON.stringify(result));
}
main().catch(e=>{
 console.error('GOGET_NIGHT_EFFICACY_FAILED',/^(D1_HTTP_\d+|D1_CREDENTIALS_MISSING|D1_RESPONSE_FAILURE|INVALID_TIME)$/.test(e.message)?e.message:'UNKNOWN');
 process.exitCode=1;
});
