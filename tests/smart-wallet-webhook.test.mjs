import test from 'node:test';
import assert from 'node:assert/strict';
import {serveSmartWalletWebhook,verifyBearer,summarizeHeliusBatch,WEBHOOK_LIMITS}
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
  const rows=new Map();let used=0,limit=WEBHOOK_LIMITS.storedEventsPerDay;
  return {
    rows,limit,
    prepare(sql){
      return {bind(...values){
        return {
          async run(){
            if(sql.includes('INSERT OR IGNORE INTO smart_wallet_webhook_budget'))return {success:true,meta:{changes:1}};
            if(sql.includes('UPDATE smart_wallet_webhook_budget')){
              if(used+values[0]>limit)return {success:true,meta:{changes:0}};
              used+=values[0];return {success:true,meta:{changes:1}};
            }
            throw Error('UNEXPECTED_SQL');
          },
          _row:sql.includes('INSERT OR IGNORE INTO smart_wallet_webhook_events')?values:null
        };
      }};
    },
    async batch(statements){
      return statements.map(s=>{
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
    WALLET_WEBHOOK_ENABLED:'true',WALLET_WEBHOOK_STOP_AT:'2026-11-02T00:00:00Z'};
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
  assert.equal((await ready.json()).tradeEligible,false);
});
test('authenticated enhanced SWAP stored as unverified evidence and deduplicated',async()=>{
  const e=env();const a=await serveSmartWalletWebhook(req(),e,now);
  assert.equal(a.status,200);const body=await a.json();
  assert.equal(body.accepted,2); // fee payer plus transfer source wallet
  assert.equal(body.tradeEligible,false);
  const dup=await serveSmartWalletWebhook(req(),e,now);
  assert.equal((await dup.json()).duplicates,2);
  assert.equal(e.DB.rows.size,2);
  const evidence=JSON.parse([...e.DB.rows.values()][0][8]);
  assert.match(evidence.warning,/NOT_EXECUTABLE/);
});
test('wrong content type, huge batch, missing signer mapping and malformed JSON reject safely',async()=>{
  const e=env();
  const badtype=new Request('https://hook.test/webhook',{method:'POST',headers:{authorization:'Bearer '+key,'content-type':'text/plain'},body:'x'});
  assert.equal((await serveSmartWalletWebhook(badtype,e,now)).status,415);
  assert.equal((await serveSmartWalletWebhook(req(Array.from({length:31},()=>tx)),e,now)).status,413);
  const unknown={...tx,feePayer:'D'.repeat(44),tokenTransfers:[]};
  const result=await serveSmartWalletWebhook(req([unknown]),e,now);
  assert.equal((await result.json()).accepted,0);
  const invalid=new Request('https://hook.test/webhook',{method:'POST',headers:{authorization:'Bearer '+key,'content-type':'application/json'},body:'{broken'});
  assert.equal((await serveSmartWalletWebhook(invalid,e,now)).status,400);
  const oversize=new Request('https://hook.test/webhook',{method:'POST',headers:{authorization:'Bearer '+key,'content-type':'application/json'},body:' '.repeat(WEBHOOK_LIMITS.bodyBytes+1)});
  assert.equal((await serveSmartWalletWebhook(oversize,e,now)).status,413);
});
test('time expiry and missing secret fail closed',async()=>{
  assert.equal((await serveSmartWalletWebhook(req(),env(),Date.parse('2026-11-02T00:00:00Z'))).status,410);
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
