import test from 'node:test';
import assert from 'node:assert/strict';
import {serveSmartWalletWebhook,verifyBearer,summarizeHeliusBatch,buildResearchEvidence,WEBHOOK_LIMITS,WEBHOOK_BUILD}
  from '../src/smart-wallet-webhook-worker.mjs';

const wallet='8LJWz8uW51u6kL2XBZ6cKYBngnXCpxQjUZRbwKLfVYp4';
const other='whamNNP9tHoxLg92yHvJPdYhghEoCg1qYTsh5a2oLbx';
const key='S'.repeat(64);
const now=Date.parse('2026-10-30T10:00:00Z');
const at=Math.floor(now/1000);
const tx={
  type:'SWAP',source:'PUMP_AMM',signature:'5'.repeat(88),
  feePayer:wallet,transactionError:null,slot:461234567,timestamp:at,
  tokenTransfers:[{mint:'B'.repeat(44),fromUserAccount:other,toUserAccount:wallet}]
};
function db(){
  const rows=new Map(),rawRows=new Map(),rawBatchSizes=[],rawHealth=[];let used=0,rawUsed=0;
  const limit=WEBHOOK_LIMITS.storedEventsPerDay,rawLimit=WEBHOOK_LIMITS.rawBytesPerUtcDay;
  return {
    rows,rawRows,rawBatchSizes,rawHealth,limit,
    prepare(sql){
      return {bind(...values){
        return {
          async run(){
            if(sql.includes('INSERT OR IGNORE INTO smart_wallet_webhook_raw_health'))return {success:true,meta:{changes:1}};
            if(sql.includes('UPDATE smart_wallet_webhook_raw_health')){
              rawHealth.push(values);return {success:true,meta:{changes:1}};
            }
            if(sql.includes('INSERT OR IGNORE INTO smart_wallet_webhook_raw(')){
              const id=values[0],existing=rawRows.has(id);
              if(!existing)rawRows.set(id,values);
              return {success:true,meta:{changes:existing?0:1}};
            }
            if(sql.includes('INSERT OR IGNORE INTO smart_wallet_webhook_raw_budget'))return {success:true,meta:{changes:1}};
            if(sql.includes('UPDATE smart_wallet_webhook_raw_budget')){
              if(rawUsed+values[0]>rawLimit)return {success:true,meta:{changes:0}};
              rawUsed+=values[0];return {success:true,meta:{changes:1}};
            }
            if(sql.includes('INSERT OR IGNORE INTO smart_wallet_webhook_budget'))return {success:true,meta:{changes:1}};
            if(sql.includes('UPDATE smart_wallet_webhook_budget')){
              if(used+values[0]>limit)return {success:true,meta:{changes:0}};
              used+=values[0];return {success:true,meta:{changes:1}};
            }
            throw Error('UNEXPECTED_SQL');
          },
          _row:sql.includes('INSERT OR IGNORE INTO smart_wallet_webhook_events')?values:null,
          _raw:sql.includes('INSERT OR IGNORE INTO smart_wallet_webhook_raw(')?values:null
        };
      }};
    },
    async batch(statements){
      if(statements[0]?._raw)rawBatchSizes.push(statements.length);
      return statements.map(s=>{
        if(s._raw){
          const id=s._raw[0],existing=rawRows.has(id);
          if(!existing)rawRows.set(id,s._raw);
          return {success:true,meta:{changes:existing?0:1}};
        }
        if(!s._row)throw Error('UNEXPECTED_BATCH');
        const id=s._row[0]+':'+s._row[1];
        const existing=rows.has(id);if(!existing)rows.set(id,s._row);
        return {success:true,meta:{changes:existing?0:1}};
      });
    }
  };
}
function env(DB=db()){
  return {DB,WALLET_WEBHOOK_SECRET:key,WALLET_WATCHED_ADDRESSES:wallet+','+other,
    WALLET_WEBHOOK_ENABLED:'true',WALLET_WEBHOOK_STOP_AT:'2026-11-08T00:00:00Z'};
}
function req(events=[tx],header='Bearer '+key,method='POST'){
  return new Request('https://hook.test/webhook',{method,headers:{
    'content-type':'application/json',authorization:header},body:method==='POST'?JSON.stringify(events):undefined});
}
test('rejects missing/wrong bearer before touching storage',async()=>{
  const e=env();const a=await serveSmartWalletWebhook(req([tx],''),e,now);
  const b=await serveSmartWalletWebhook(req([tx],'Bearer WRONG'),e,now);
  assert.equal(a.status,401);assert.equal(b.status,401);assert.equal(e.DB.rows.size,0);
  assert.equal(await verifyBearer('Bearer '+key,key),true);
  assert.equal(await verifyBearer('Bearer '+key,'short'),false);
});
test('health and readiness are watch-only; nothing can trigger a trade',async()=>{
  const e=env();
  const health=await serveSmartWalletWebhook(new Request('https://hook.test/health'),e,now);
  assert.equal(health.status,200);assert.equal((await health.json()).state,'watch_only');
  const ready=await serveSmartWalletWebhook(new Request('https://hook.test/ready',{headers:{
    authorization:'Bearer '+key}}),e,now);
  const readyBody=await ready.json();
  assert.equal(readyBody.tradeEligible,false);
  assert.equal(readyBody.build,WEBHOOK_BUILD);
});
test('authenticated enhanced SWAP stored as unverified evidence and deduplicated',async()=>{
  const e=env();const a=await serveSmartWalletWebhook(req(),e,now);
  assert.equal(a.status,200);const body=await a.json();
  assert.equal(body.accepted,2); // fee payer plus transfer source wallet
  assert.equal(body.tradeEligible,false);
  assert.equal(body.rawArchived,1);
  assert.equal(body.rawArchiveStatus,'OK');
  assert.equal(e.DB.rawRows.size,1);
  assert.equal(JSON.parse([...e.DB.rawRows.values()][0][4]).signature,tx.signature);
  const dup=await serveSmartWalletWebhook(req(),e,now);
  assert.equal((await dup.json()).duplicates,2);
  assert.equal(e.DB.rows.size,2);
  assert.equal(e.DB.rawRows.size,1);
  const evidence=JSON.parse([...e.DB.rows.values()][0][8]);
  assert.match(evidence.caveat,/NOT_EXECUTABLE/);
});
test('wrong content type, huge batch, missing signer mapping and malformed JSON reject safely',async()=>{
  const e=env();
  const badtype=new Request('https://hook.test/webhook',{method:'POST',headers:{authorization:'Bearer '+key,'content-type':'text/plain'},body:'x'});
  assert.equal((await serveSmartWalletWebhook(badtype,e,now)).status,415);
  assert.equal((await serveSmartWalletWebhook(req(Array.from({length:WEBHOOK_LIMITS.eventsPerRequest+1},()=>tx)),e,now)).status,413);
  const unknown={...tx,feePayer:'D'.repeat(44),tokenTransfers:[]};
  const result=await serveSmartWalletWebhook(req([unknown]),e,now);
  assert.equal((await result.json()).accepted,0);
  const invalid=new Request('https://hook.test/webhook',{method:'POST',headers:{authorization:'Bearer '+key,'content-type':'application/json'},body:'{broken'});
  assert.equal((await serveSmartWalletWebhook(invalid,e,now)).status,400);
  const oversize=new Request('https://hook.test/webhook',{method:'POST',headers:{authorization:'Bearer '+key,'content-type':'application/json'},body:' '.repeat(WEBHOOK_LIMITS.bodyBytes+1)});
  assert.equal((await serveSmartWalletWebhook(oversize,e,now)).status,413);
});
test('time expiry and missing secret fail closed',async()=>{
  assert.equal((await serveSmartWalletWebhook(req(),env(),Date.parse('2026-11-08T00:00:00Z'))).status,410);
  const e=env();e.WALLET_WEBHOOK_SECRET=undefined;
  assert.equal((await serveSmartWalletWebhook(req(),e,now)).status,503);
});
test('failed transactions, future malformed timestamps, and non-SWAP never become trade eligible',()=>{
  const w=new Set([wallet]);
  const t=summarizeHeliusBatch([{...tx,transactionError:{error:1}},tx,
    {...tx,signature:'6'.repeat(88),type:'TRANSFER'}, {...tx,signature:'7'.repeat(88),timestamp:9007199254740991}],
    w,new Date(now).toISOString());
  assert.equal(t.ok,true);
  assert.ok(t.rows.every(x=>!Object.hasOwn(x,'tradeEligible')));
  assert.ok(t.rows.some(x=>x.status==='OTHER_TRANSACTION'));
});

test('v2 research evidence retains token quantities, SOL movement, fees and swap hints without inferring a trade',()=>{
  const source={...tx,fee:5000,
    tokenTransfers:[{mint:'B'.repeat(44),fromUserAccount:other,toUserAccount:wallet,tokenAmount:123.456789}],
    nativeTransfers:[{fromUserAccount:wallet,toUserAccount:other,amount:250000000}],
    accountData:[{account:wallet,nativeBalanceChange:-250005000,tokenBalanceChanges:[{
      mint:'B'.repeat(44),userAccount:wallet,rawTokenAmount:{tokenAmount:'123456789000',decimals:9}
    }]}],
    events:{swap:{tokenInputs:[{mint:'C'.repeat(44),tokenAmount:0.25}],
      tokenOutputs:[{mint:'B'.repeat(44),tokenAmount:123.456789}]}}
  };
  const evidence=JSON.parse(buildResearchEvidence(source,wallet));
  assert.equal(evidence.schemaVersion,2);
  assert.equal(evidence.feeLamports,'5000');
  assert.equal(evidence.tokenTransfers[0].tokenAmount,'123.456789');
  assert.equal(evidence.nativeTransfers[0].lamports,'250000000');
  assert.equal(evidence.accountBalanceChanges[0].tokenBalanceChanges[0].rawTokenAmount,'123456789000');
  assert.equal(evidence.swapHints.tokenInputs[0].amount,'0.25');
  assert.match(evidence.caveat,/NOT_EXECUTABLE/);
  assert.equal(evidence.verifiedBuy,undefined);
});
test('v2 bounded source observation handles large data and remains parseable',()=>{
  const t={...tx,tokenTransfers:Array.from({length:200},()=>({
    mint:'B'.repeat(44),fromUserAccount:wallet,toUserAccount:other,tokenAmount:2000
  }))};
  const result=JSON.parse(buildResearchEvidence(t,wallet));
  assert.equal(result.truncatedSource.tokenTransfers,true);
  assert.ok(JSON.stringify(result).length<14000);
  assert.equal(WEBHOOK_LIMITS.storedEventsPerDay,5000);
});

test('overlarge raw record stays unarchived while bounded parsed evidence is retained',async()=>{
  const big={...tx,signature:'6'.repeat(88),description:'Q'.repeat(WEBHOOK_LIMITS.rawPerEventBytes+1000)};
  const e=env();const res=await serveSmartWalletWebhook(req([big]),e,now);
  assert.equal(res.status,200);
  const out=await res.json();
  assert.equal(out.accepted,2);
  assert.equal(out.rawArchived,0);
  assert.equal(out.rejected.RAW_EVENT_EXCEEDS_ARCHIVE_CAP,1);
  assert.equal(e.DB.rawRows.size,0);
  assert.equal(e.DB.rows.size,2);
});

test('multiple raw events use at most six D1 statements per raw batch',async()=>{
 const e=env();
 const input=Array.from({length:14},(_,i)=>({
  ...tx,signature:'123456789ABCDEFGHJKLMNPQRSTUVWXYZ'[i+1].repeat(88)
 }));
 const result=await serveSmartWalletWebhook(req(input),e,now);
 assert.equal(result.status,200);
 const body=await result.json();
 assert.equal(body.rawArchived,14);
 assert.deepEqual(e.DB.rawBatchSizes,[6,6,2]);
 assert.equal(e.DB.rawRows.size,14);
});
test('failed raw sub-batch cannot discard other raw records or normal events',async()=>{
 const base=db(),original=base.batch.bind(base);
 let failed=false;
 base.batch=async items=>{
  if(items[0]?._raw&&!failed){failed=true;throw Error('SIMULATED_RAW_CAPACITY');}
  return original(items);
 };
 const e=env(base),input=Array.from({length:8},(_,i)=>({
  ...tx,signature:'123456789ABCDEFGHJKLMNPQRSTUVWXYZ'[i+1].repeat(88)
 }));
 const result=await serveSmartWalletWebhook(req(input),e,now);
 assert.equal(result.status,200);
 const body=await result.json();
 assert.equal(body.accepted,16);
 assert.equal(body.rawArchived,8);
 assert.equal(body.rawFallbackRecovered,6);
 assert.equal(body.rawFailedWrites,0);
 assert.equal(body.rawArchiveStatus,'RECOVERED_FROM_BATCH_ERRORS');
 assert.equal(e.DB.rawRows.size,8);
 assert.equal(e.DB.rawHealth.length,2);
 assert.equal(e.DB.rawHealth[0][0],8);
 assert.deepEqual(e.DB.rawHealth[1].slice(0,4),[0,6,0,1]);
});
test('single toxic source row cannot discard its valid batch neighbors',async()=>{
 const base=db(),batch=base.batch.bind(base),prepare=base.prepare.bind(base);
 const poisoned='4'.repeat(88);
 base.batch=async items=>{
   if(items[0]?._raw&&items.some(x=>x._raw[0]===poisoned))
     throw Error('SQLITE_TOOBIG');
   return batch(items);
 };
 base.prepare=sql=>{
   const statement=prepare(sql);
   if(!sql.includes('INSERT OR IGNORE INTO smart_wallet_webhook_raw('))return statement;
   return {bind(...values){
     const bound=statement.bind(...values);
     if(values[0]!==poisoned)return bound;
     return {...bound,async run(){throw Error('SQLITE_TOOBIG');}};
   }};
 };
 const events=Array.from({length:8},(_,i)=>({
   ...tx,signature:i===2?poisoned:'123456789ABCDEFGHJKLMNPQRSTUVWXYZ'[i+1].repeat(88)
 }));
 const result=await serveSmartWalletWebhook(req(events),env(base),now);
 assert.equal(result.status,200);
 const output=await result.json();
 assert.equal(output.accepted,16);
 assert.equal(output.rawArchived,7);
 assert.equal(output.rawFailedWrites,1);
 assert.equal(output.rawFallbackRecovered,5);
 assert.equal(output.rawArchiveStatus,'PARTIAL_OR_FAILED_RAW_BATCHES');
 assert.equal(base.rawRows.size,7);
 assert.equal(base.rows.size,16);
 assert.equal(base.rawHealth.length,2);
 assert.equal(base.rawHealth[0][0],8);
 assert.deepEqual(base.rawHealth[1].slice(0,4),[1,5,1,1]);
 assert.equal(base.rawHealth[1][5],'PARTIAL_OR_FAILED_RAW_BATCHES');
});


test('daily raw diagnostics identify pre-batch budget errors without losing parsed records',async()=>{
 const base=db(),original=base.prepare.bind(base);
 base.prepare=sql=>{
  const prepared=original(sql);
  if(!sql.startsWith('UPDATE smart_wallet_webhook_raw_budget SET'))return prepared;
  return {bind(...values){
    return {...prepared.bind(...values),async run(){throw Error('SQLITE_BUSY');}};
  }};
 };
 const output=await serveSmartWalletWebhook(req(),env(base),now);
 assert.equal(output.status,200);
 const body=await output.json();
 assert.equal(body.accepted,2);
 assert.equal(body.rawArchived,0);
 assert.equal(body.rawArchiveStatus,'CAP_OR_WRITE_UNAVAILABLE');
 assert.equal(base.rows.size,2);
 assert.equal(base.rawRows.size,0);
 assert.equal(base.rawHealth.length,2);
 assert.equal(base.rawHealth[0][0],1);
 assert.equal(base.rawHealth[1][0],1);
 assert.equal(base.rawHealth[1][5],'RESERVE_UPDATE_DATABASE_BUSY');
});
