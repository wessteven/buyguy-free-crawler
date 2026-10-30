#!/usr/bin/env node
// GOGET WATCH-ONLY live pilot. Reads public Solana data and writes isolated D1 evidence.
// No signing, no real transactions, no automatic paper entries.
import {readFile,writeFile} from 'node:fs/promises';
import {WATCH_LIMITS,selectWindow,classifyObservedTransaction} from '../src/smart-wallet-live-probe.mjs';

const usage={rpc:0,transactions:0,d1:0};
const now=()=>new Date().toISOString();
const address=x=>typeof x==='string'&&/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(x);
async function json(url,options={}){
  const r=await fetch(url,{...options,signal:AbortSignal.timeout(18000)});
  if(!r.ok)throw Error('HTTP_'+r.status);
  return r.json();
}
function rpcFactory(key){
  const url='https://mainnet.helius-rpc.com/?api-key='+encodeURIComponent(key);
  return async(method,params)=>{
    usage.rpc++;
    const result=await json(url,{method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({jsonrpc:'2.0',id:usage.rpc,method,params})});
    if(result?.error)throw Error('RPC_'+(Number.isInteger(result.error.code)?result.error.code:'ERROR'));
    if(!Object.hasOwn(result,'result'))throw Error('RPC_RESULT_MISSING');
    return result.result;
  };
}
function d1Factory(account,database,key){
  const url='https://api.cloudflare.com/client/v4/accounts/'+encodeURIComponent(account)+
    '/d1/database/'+encodeURIComponent(database)+'/query';
  return async(sql,params=[])=>{
    usage.d1++;
    const data=await json(url,{method:'POST',headers:{authorization:'Bearer '+key,'content-type':'application/json'},
      body:JSON.stringify({sql,params})});
    if(data?.success!==true||data?.result?.[0]?.success!==true)throw Error('D1_QUERY_FAILED');
    return data.result[0].results||[];
  };
}
const cursorSchema=[
  'CREATE TABLE IF NOT EXISTS smart_wallet_live_cursors (',
  'wallet TEXT PRIMARY KEY,last_signature TEXT,last_polled_at TEXT,',
  'status TEXT NOT NULL,gaps INTEGER NOT NULL DEFAULT 0)'
].join(' ');
const eventSchema=[
  'CREATE TABLE IF NOT EXISTS smart_wallet_live_events (',
  'wallet TEXT NOT NULL,signature TEXT NOT NULL,observed_at TEXT NOT NULL,',
  'block_time TEXT,slot INTEGER,classification TEXT NOT NULL,',
  'baseline INTEGER NOT NULL DEFAULT 0,evidence_json TEXT NOT NULL,',
  'PRIMARY KEY(wallet,signature))'
].join(' ');

async function run(){
  const start=now();
  const report={mode:'WATCH_ONLY_LIVE_NO_COPY_TRADING',startedAt:start,
    finishedAt:null,cohort:'UNVETTED_PILOT_NOT_PROFITABLE_WALLETS',
    limits:WATCH_LIMITS,wallets:[],events:[],errors:[],
    totals:{newCandidates:0,baselineSamples:0,gaps:0,verifiedTradeSignals:0}};
  try{
    const end=Date.parse(process.env.SMART_WALLET_LIVE_END_UTC||'');
    if(!Number.isFinite(end))throw Error('PILOT_END_MISSING');
    if(Date.now()>=end){
      report.status='PILOT_EXPIRED';report.finishedAt=now();report.usage=usage;
      await writeFile('smart-wallet-live-report.json',JSON.stringify(report,null,2)+'\n','utf8');
      console.log('GOGET_WALLET_LIVE_PILOT',JSON.stringify({status:'PILOT_EXPIRED',mode:report.mode,usage}));
      return;
    }
    if(process.env.SMART_WALLET_LIVE_ENABLED!=='true')throw Error('LIVE_PILOT_DISABLED');
    const key=process.env.HELIUS_API_KEY;
    const vars=[process.env.CF_ACCOUNT_ID,process.env.CF_DATABASE_ID,process.env.CF_D1_API_TOKEN];
    if(!key||vars.some(v=>!v))throw Error('REQUIRED_PRIVATE_CREDENTIALS_ABSENT');
    const cohort=JSON.parse(await readFile('research/smart-wallet-live-cohort.json','utf8'));
    if(!Array.isArray(cohort)||cohort.length===0||cohort.length>WATCH_LIMITS.maxWallets||
       !cohort.every(x=>address(x?.wallet)&&x?.vetted===false)||
       new Set(cohort.map(x=>x.wallet)).size!==cohort.length)
       throw Error('PILOT_COHORT_INVALID_OR_UNREVIEWED_TAG_MISSING');
    const rpc=rpcFactory(key),d1=d1Factory(...vars);
    await d1(cursorSchema);await d1(eventSchema);
    for(const {wallet} of cohort){
      const w={wallet,status:'UNKNOWN',processed:0,gap:false,errors:[]};
      report.wallets.push(w);
      try{
        const prev=(await d1('SELECT last_signature FROM smart_wallet_live_cursors WHERE wallet=? LIMIT 1',[wallet]))[0]?.last_signature||null;
        const signatures=await rpc('getSignaturesForAddress',[wallet,{limit:WATCH_LIMITS.signaturesPerWallet,commitment:'confirmed'}]);
        const selection=selectWindow(signatures,prev,{limit:WATCH_LIMITS.decodePerWallet,baseline:!prev});
        w.gap=selection.gap||selection.truncated;
        if(w.gap)report.totals.gaps++;
        for(const sig of [...selection.selected].reverse()){
          if(usage.transactions>=WATCH_LIMITS.maxDecodesPerRun){
            w.gap=true;w.errors.push('GLOBAL_DECODE_BUDGET');break;
          }
          usage.transactions++;
          const tx=await rpc('getTransaction',[sig.signature,{encoding:'jsonParsed',maxSupportedTransactionVersion:0,commitment:'confirmed'}]);
          const e=classifyObservedTransaction({wallet,signature:sig.signature,tx,observedAt:now(),baseline:selection.baseline});
          w.processed++;
          report.events.push({wallet,signature:e.signature,classification:e.classification,
            baseline:e.baseline,blockTime:e.blockTime,delayMs:e.delayMs,tokenIncreases:e.tokenIncreases});
          await d1([
            'INSERT OR IGNORE INTO smart_wallet_live_events',
            '(wallet,signature,observed_at,block_time,slot,classification,baseline,evidence_json)',
            'VALUES(?,?,?,?,?,?,?,?)'
          ].join(' '),[wallet,e.signature,e.observedAt,e.blockTime,e.slot,e.classification,e.baseline?1:0,JSON.stringify(e).slice(0,3000)]);
          if(e.baseline)report.totals.baselineSamples++;
          else if(e.classification==='AMM_INVOCATION_WITH_TOKEN_INCREASE_UNPRICED')report.totals.newCandidates++;
        }
        w.status=w.gap?'INCOMPLETE_WINDOW':selection.baseline?'BASELINED':selection.head?'OBSERVED':'NO_SIGNATURES';
        await d1([
          'INSERT INTO smart_wallet_live_cursors(wallet,last_signature,last_polled_at,status,gaps) VALUES(?,?,?,?,?)',
          'ON CONFLICT(wallet) DO UPDATE SET last_signature=excluded.last_signature,',
          'last_polled_at=excluded.last_polled_at,status=excluded.status,',
          'gaps=smart_wallet_live_cursors.gaps+excluded.gaps'
        ].join(' '),[wallet,selection.head||prev,start,w.status,w.gap?1:0]);
      }catch(err){
        w.status='FAILED';
        const code=/^(HTTP_[0-9]+|RPC_-?[0-9]+|RPC_[A-Z_]+|D1_QUERY_FAILED)$/.test(err?.message)?err.message:'PROVIDER_OR_STORAGE_ERROR';
        w.errors.push(code);report.errors.push({wallet,code});
      }
    }
    if(report.wallets.every(w=>w.status==='FAILED'))throw Error('NO_WALLETS_SUCCESSFULLY_POLLED');
  }catch(err){
    const code=/^(LIVE_PILOT_DISABLED|REQUIRED_PRIVATE_CREDENTIALS_ABSENT|PILOT_COHORT_INVALID_OR_UNREVIEWED_TAG_MISSING|NO_WALLETS_SUCCESSFULLY_POLLED)$/.test(err?.message)?err.message:'PILOT_START_FAILED';
    if(!report.errors.some(x=>x.code===code))report.errors.push({code});
  }
  report.finishedAt=now();report.usage=usage;
  await writeFile('smart-wallet-live-report.json',JSON.stringify(report,null,2)+'\n','utf8');
  console.log('GOGET_WALLET_LIVE_PILOT',JSON.stringify({mode:report.mode,
    startedAt:report.startedAt,wallets:report.wallets,totals:report.totals,
    usage:report.usage,errors:report.errors}));
  if(report.errors.length)process.exitCode=1;
}
run().catch(()=>{console.error('PILOT_FAILED_TO_WRITE_EVIDENCE');process.exitCode=1;});
