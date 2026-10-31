#!/usr/bin/env node
// Helius webhook provisioning / expiry cleanup. Never prints API keys or webhook bearer.
// Uses exactly the single owner-controlled GOGET endpoint; never touches other webhooks.
import {createHmac} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {assessWebhookBudget} from '../src/smart-wallet-budget.mjs';

export const STOP_AT='2026-11-08T00:00:00Z';
export const RECEIVER_URL='https://goget-smart-wallet-hook.wessteven.workers.dev/webhook';
const idPattern=/^[a-zA-Z0-9-]{10,128}$/;
const required=(name)=>{
  const val=process.env[name];
  if(!val)throw Error('MISSING_'+name);
  return val;
};
export function derivePurposeToken(admin,helius){
  if(admin.length<24||helius.length<12)throw Error('CREDENTIAL_ENTROPY_UNVERIFIED');
  return createHmac('sha256',admin).update('GOGET:WEBHOOK:BEARER:v1:').update(helius).digest('base64url');
}
// Helius documentation currently shows both old/new API hosts and distinct key schemes.
// Probe read-only list access, then use the *same* working scheme for mutations.
let selectedEndpoint=null;
const schemes=[
  {host:'https://api-mainnet.helius-rpc.com/v0/webhooks',kind:'bearer'},
  {host:'https://api-mainnet.helius-rpc.com/v0/webhooks',kind:'query'},
  {host:'https://api.helius.xyz/v0/webhooks',kind:'query'},
  {host:'https://mainnet.helius-rpc.com/v0/webhooks',kind:'query'}
];
async function api(key,method,entry='',body){
  const options=selectedEndpoint?[selectedEndpoint]:method==='GET'&&entry===''?schemes:[];
  if(options.length===0)throw Error('HELIUS_ENDPOINT_NOT_VERIFIED');
  let lastCode='UNREACHABLE';
  for(const option of options){
    const query=option.kind==='query'?'?api-key='+encodeURIComponent(key):'';
    let response;
    try{
      response=await fetch(option.host+entry+query,{
        method,headers:{accept:'application/json',
          ...(option.kind==='bearer'?{authorization:'Bearer '+key}:{}),
          ...(body?{'content-type':'application/json'}:{})},
        body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(25000)});
    }catch{lastCode='NETWORK_UNAVAILABLE';continue;}
    if(!response.ok){
      lastCode='HTTP_'+response.status;
      // Only alternate authentication/host on failed read-only discovery,
      // never repeat a mutation whose outcome may be uncertain.
      if(!selectedEndpoint&&method==='GET'&&entry===''&&[400,401,403,404].includes(response.status))continue;
      throw Error('HELIUS_'+lastCode);
    }
    if(!selectedEndpoint)selectedEndpoint=option;
    if(response.status===204)return null;
    const text=await response.text();
    if(!text)return null;
    try{return JSON.parse(text);}catch{throw Error('HELIUS_RESPONSE_INVALID_JSON');}
  }
  throw Error('HELIUS_ALL_AUTH_SCHEMES_FAILED_'+lastCode);
}
async function listOwn(key){
  const all=await api(key,'GET');
  if(!Array.isArray(all))throw Error('HELIUS_WEBHOOK_LIST_INVALID');
  const mine=all.filter(x=>x.webhookURL===RECEIVER_URL);
  if(mine.length>1)throw Error('MULTIPLE_GOGET_ENDPOINTS_ABORT');
  return mine[0]??null;
}
async function main(){
  const action=process.argv[2]||'sync';
  if(!['sync','cleanup','verify','guard'].includes(action))throw Error('UNSUPPORTED_MODE');
  // Avoid management API calls in the frequent safety-monitoring path when nothing is due.
  if(action==='cleanup' && Date.now()<Date.parse(STOP_AT)){
    console.log('GOGET_HELIUS_WEBHOOK',{mode:'not_yet_expired'});
    return;
  }
  const key=required('HELIUS_API_KEY');
  if(action==='guard'){
    const account=required('CF_ACCOUNT_ID'),database=required('CF_DATABASE_ID'),token=required('CF_D1_API_TOKEN');
    const url='https://api.cloudflare.com/client/v4/accounts/'+encodeURIComponent(account)+
      '/d1/database/'+encodeURIComponent(database)+'/query';
    async function d1(sql,params=[]){
      const r=await fetch(url,{method:'POST',headers:{authorization:'Bearer '+token,
        'content-type':'application/json'},body:JSON.stringify({sql,params}),
        signal:AbortSignal.timeout(20000)});
      if(!r.ok)throw Error('D1_BUDGET_HTTP_'+r.status);
      const body=await r.json();
      if(body?.success!==true||body?.result?.[0]?.success!==true)throw Error('D1_BUDGET_READ_FAILED');
      return body.result[0].results||[];
    }
    const recent=new Date(Date.now()-3600000).toISOString();
    const day=new Date().toISOString().slice(0,10);
    const [hour,dayRows]=await Promise.all([
      d1('SELECT COUNT(*) AS n FROM smart_wallet_webhook_events WHERE observed_at>=?',[recent]),
      d1('SELECT reserved FROM smart_wallet_webhook_budget WHERE day=?',[day])
    ]);
    const counts={lastHour:hour[0]?.n??null,dayAttempted:dayRows[0]?.reserved??0};
    const policy=assessWebhookBudget(counts);
    console.log('GOGET_HELIUS_CREDIT_GUARD',{counts,action:policy.action,reasons:policy.reasons});
    if(policy.action==='UNKNOWN_DATA_MANUAL_REVIEW')throw Error('GUARD_COUNTS_UNVERIFIED');
    if(policy.action==='MONITOR')return;
    const owned=await listOwn(key);
    if(owned){
      if(!idPattern.test(owned.webhookID||''))throw Error('WEBHOOK_ID_INVALID');
      await api(key,'DELETE','/'+encodeURIComponent(owned.webhookID));
    }
    console.log('GOGET_HELIUS_CREDIT_GUARD',{mode:'OWN_SUBSCRIPTION_SUSPENDED',removed:!!owned});
    return;
  }
  const hook=await listOwn(key);
  if(action==='cleanup'){
    if(hook){
      if(!idPattern.test(hook.webhookID||''))throw Error('WEBHOOK_ID_INVALID');
      await api(key,'DELETE','/'+encodeURIComponent(hook.webhookID));
    }
    console.log('GOGET_HELIUS_WEBHOOK',{mode:'expired_deleted',removed:!!hook});
    return;
  }
  if(action==='verify'){
    if(!hook)throw Error('GOGET_WEBHOOK_NOT_REGISTERED');
    if(!idPattern.test(hook.webhookID||''))throw Error('WEBHOOK_ID_INVALID');
    const details=await api(key,'GET','/'+encodeURIComponent(hook.webhookID));
    const addresses=details?.accountAddresses??details?.account_addresses??
      details?.addresses??hook.accountAddresses??hook.account_addresses??null;
    const count=Array.isArray(addresses)?addresses.length:null;
    const fields=Object.keys(details||{}).filter(x=>/address|active|webhook|type/i.test(x)).slice(0,16);
    console.log('GOGET_HELIUS_WEBHOOK',{mode:'verified_listing',present:true,
      active:details?.active??hook.active??null,wallets:count,
      returnedFieldNames:fields});
    const source=JSON.parse(await readFile('research/smart-wallet-webhook-cohort.json','utf8'));
    const expected=source.map(x=>x.wallet);
    if(Array.isArray(addresses)&&
      (count!==expected.length || !expected.every(w=>addresses.includes(w))))
      throw Error('HELIUS_WALLET_COUNT_MISMATCH');
    if(!Array.isArray(addresses))throw Error('HELIUS_WALLET_LIST_NOT_VERIFIABLE');
    return;
  }
  if(Date.now()>=Date.parse(STOP_AT))throw Error('PILOT_EXPIRED_NO_CREATION');
  const token=derivePurposeToken(required('ADMIN_TOKEN'),key);
  const cfg=await readFile('research/smart-wallet-webhook-cohort.json','utf8');
  const cohort=JSON.parse(cfg);
  const wallets=cohort.map(x=>x.wallet);
  if(cohort.length<3||cohort.length>20||!cohort.every(x=>x.vetted===false)||
     new Set(wallets).size!==wallets.length)throw Error('UNVETTED_PILOT_COHORT_INVALID');
  // Verify that the Worker configuration and Helius subscription target the same cohort.
  const cfgToml=await readFile('wrangler.smart-wallet.toml','utf8');
  const deployedWallets=cfgToml.match(/WALLET_WATCHED_ADDRESSES\s*=\s*"([^"]+)"/)?.[1]?.split(',')||[];
  if(deployedWallets.length!==wallets.length || !wallets.every(w=>deployedWallets.includes(w)))
    throw Error('WORKER_HELIUS_COHORT_MISMATCH');
  // Secret is derived to be stable across GitHub runs, with a purpose-separated HMAC.
  // Wrangler never logs the secret contents; the worker has no trading secret.
  const put=spawnSync('npx',['wrangler','secret','put','WALLET_WEBHOOK_SECRET',
    '--config','wrangler.smart-wallet.toml'],{
      input:token,encoding:'utf8',env:process.env,maxBuffer:1024*128});
  if(put.status!==0)throw Error('WORKER_SECRET_INSTALL_FAILED');
  // Never register a billable webhook until the receiver proves publicly reachable.
  // Secret writes can create a new Worker version and take time to propagate.
  let ready=false,code='UNREACHABLE',detail='UNKNOWN';
  for(let attempt=0;attempt<5;attempt++){
    try{
      const res=await fetch(RECEIVER_URL.replace(/\/webhook$/,'/ready'),{
        headers:{authorization:'Bearer '+token},signal:AbortSignal.timeout(15000)});
      code=String(res.status);
      const data=await res.json().catch(()=>null);
      detail=['RECEIVER_NOT_CONFIGURED','DATABASE_UNAVAILABLE'].includes(data?.error)
        ?data.error:'UNKNOWN_OR_TRANSIENT';
      if(res.status===200&&data?.ready===true&&data?.tradeEligible===false){ready=true;break;}
      if(![503,502,504].includes(res.status))break; // never blindly retry bad authentication
    }catch{code='UNREACHABLE';detail='NETWORK_OR_CLOUDFLARE';}
    if(attempt<4)await new Promise(resolve=>setTimeout(resolve,4000));
  }
  if(!ready)throw Error('RECEIVER_READINESS_'+code+'_'+detail);
  const payload={webhookURL:RECEIVER_URL,transactionTypes:['SWAP'],
    accountAddresses:wallets,webhookType:'enhanced',authHeader:'Bearer '+token};
  if(!hook){
    const created=await api(key,'POST','',payload);
    if(!idPattern.test(created?.webhookID||''))throw Error('HELIUS_CREATED_BUT_ID_UNVERIFIED_CHECK_ACCOUNT');
    console.log('GOGET_HELIUS_WEBHOOK',{mode:'created',webhookID:created.webhookID,
      wallets:wallets.length,readOnly:true});
  }else{
    if(!idPattern.test(hook.webhookID||''))throw Error('WEBHOOK_ID_INVALID');
    // Maintain the authentication/header configuration on authorized deploys.
    await api(key,'PUT','/'+encodeURIComponent(hook.webhookID),payload);
    console.log('GOGET_HELIUS_WEBHOOK',{mode:'updated',webhookID:hook.webhookID,
      wallets:wallets.length,readOnly:true});
  }
}
main().catch(e=>{console.error('GOGET_WEBHOOK_CONTROL_FAILED',/^[A-Z0-9_]+$/.test(e.message)?e.message:'CONTROL_ERROR');process.exitCode=1;});
