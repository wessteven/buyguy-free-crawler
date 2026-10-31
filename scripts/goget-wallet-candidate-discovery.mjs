#!/usr/bin/env node
// Read-only GOGET candidate-wallet discovery from existing D1 Solana pools.
// Candidates are NOT verified smart money; never forward to a trading system.
// Limits: <=6 pools, <=8 signatures per pool, <=36 transaction decodes/run.
import {writeFile} from 'node:fs/promises';
import {PUMPSWAP} from '../src/pumpswap.mjs';
const ADDR=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const LIMIT={pools:6,signaturesPerPool:8,txDecodes:36};
const required=k=>{if(!process.env[k])throw Error('MISSING_'+k);return process.env[k]};
async function json(url,{body=null,token=null}={}){
 const res=await fetch(url,{method:body?'POST':'GET',
  headers:{accept:'application/json',...(body?{'content-type':'application/json'}:{}),...(token?{authorization:'Bearer '+token}:{})},
  ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});
 if(!res.ok)throw Error('HTTP_'+res.status);
 return res.json();
}
async function run(){
 const acc=required('CF_ACCOUNT_ID'),db=required('CF_DATABASE_ID'),cloud=required('CF_D1_API_TOKEN'),helius=required('HELIUS_API_KEY');
 const start=new Date().toISOString(),base='https://api.cloudflare.com/client/v4/accounts/'+acc+'/d1/database/'+db+'/query';
 const q=await json(base,{token:cloud,body:{sql:"SELECT address,pool,symbol,score,last_seen FROM assets WHERE chain='solana' AND pool IS NOT NULL AND status IN ('ALIVE','STATIC') ORDER BY score DESC,last_seen DESC LIMIT 20",params:[]}});
 if(q.success!==true||q.result?.[0]?.success!==true)throw Error('D1_POOL_QUERY_FAILURE');
 const pools=[...new Map((q.result[0].results||[]).filter(x=>ADDR.test(x.pool||'')&&ADDR.test(x.address||''))
  .map(x=>[x.pool,x])).values()].slice(0,LIMIT.pools);
 let calls=0,decoded=0;
 const errors={},candidates=new Map();
 async function rpc(method,params){
   calls++;
   const r=await json('https://mainnet.helius-rpc.com/?api-key='+encodeURIComponent(helius),
     {body:{jsonrpc:'2.0',id:calls,method,params}});
   if(r?.error)throw Error('RPC_'+String(r.error.code||'ERROR').slice(0,12));
   return r?.result;
 }
 for(const pool of pools){
  let sigs=[];
  try{sigs=await rpc('getSignaturesForAddress',[pool.pool,{limit:LIMIT.signaturesPerPool,commitment:'confirmed'}]);}
  catch(e){errors[e.message]=(errors[e.message]||0)+1;continue;}
  if(!Array.isArray(sigs))continue;
  for(const s of sigs){
   if(decoded>=LIMIT.txDecodes)break;
   if(!ADDR.test(pool.pool)||!s?.signature||s.err!==null)continue;
   decoded++;
   let tx;
   try{tx=await rpc('getTransaction',[s.signature,{encoding:'jsonParsed',maxSupportedTransactionVersion:1,commitment:'confirmed'}]);}
   catch(e){errors[e.message]=(errors[e.message]||0)+1;continue;}
   if(!tx||tx.meta?.err!==null)continue;
   const ks=tx.transaction?.message?.accountKeys;
   if(!Array.isArray(ks))continue;
   const ins=[...(tx.transaction?.message?.instructions||[]),
      ...(tx.meta?.innerInstructions||[]).flatMap(x=>x.instructions||[])];
   const sawPumpSwap=ins.some(i=>i?.programId===PUMPSWAP);
   if(!sawPumpSwap)continue;
   const signers=ks.filter(k=>k&&typeof k==='object'&&k.signer===true&&ADDR.test(k.pubkey||''))
     .map(k=>k.pubkey).slice(0,3);
   for(const wallet of signers){
    const a=candidates.get(wallet)||{wallet,observedTransactions:0,pools:new Set(),lastSlot:0,
      sampleSignature:s.signature,source:'SIGNED_PUMPSWAP_POOL_TX',vetted:false};
    a.observedTransactions++;a.pools.add(pool.pool);a.lastSlot=Math.max(a.lastSlot,tx.slot||0);
    candidates.set(wallet,a);
   }
  }
 }
 const ranked=[...candidates.values()].map(x=>({...x,pools:[...x.pools],uniquePools:x.pools.size}))
  .sort((a,b)=>b.uniquePools-a.uniquePools||b.observedTransactions-a.observedTransactions).slice(0,40);
 const report={at:new Date().toISOString(),startedAt:start,mode:'READ_ONLY_ACTIVITY_CANDIDATES_NOT_PROFITABLE',
  limits:LIMIT,poolsQueried:pools.map(x=>({pool:x.pool,mint:x.address,symbol:x.symbol,score:x.score})),
  calls,decoded,candidates:ranked,errors,
  caution:'Signers of selected PumpSwap transactions are not automatically profitable independent traders. No trade sizes, buys/sells or net P&L are established.'};
 await writeFile('smart-wallet-candidate-cohort.json',JSON.stringify(report,null,2)+'\n','utf8');
 console.log('GOGET_WALLET_DISCOVERY',JSON.stringify({...report,candidates:ranked.slice(0,18)}));
}
run().catch(e=>{console.error('GOGET_WALLET_DISCOVERY_FAILED',
 /^(MISSING_[A-Z_]+|D1_POOL_QUERY_FAILURE|HTTP_\d+)$/.test(e.message)?e.message:'UNAVAILABLE');process.exitCode=1;});
