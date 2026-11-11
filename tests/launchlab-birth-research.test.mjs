import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {
 LAUNCHLAB_PROGRAM,classifyLaunchlabBirth,launchlabLogCandidate,
 loadLaunchlabTransaction,replayLaunchlabSignature,observeLaunchlabBirths
} from '../src/launchlab-birth-research.mjs';

const addr=n=>n.repeat(32);
const sig='7'.repeat(88);
const accounts=()=>{
 const a=Array(18).fill(addr('2'));
 a[1]=addr('6');a[5]=addr('3');a[6]=addr('4');a[7]=addr('5');
 return a;
};
const abc='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function base58(bytes){
 let num=0n;
 for(const b of bytes)num=num*256n+BigInt(b);
 let out='';
 while(num>0n){out=abc[Number(num%58n)]+out;num/=58n}
 for(const b of bytes){if(b!==0)break;out='1'+out}
 return out;
}
const discriminator=name=>[...createHash('sha256').update('global:'+name).digest().subarray(0,8)];
const ix=(name='initialize_v2',overrides={})=>({
 programId:LAUNCHLAB_PROGRAM,accounts:accounts(),
 data:base58([...discriminator(name),3,4,5]),...overrides
});
const tx=(instructions=[ix()],other={})=>({
 meta:{err:null,innerInstructions:[]},
 slot:462635200,blockTime:1793224380,
 transaction:{message:{instructions}},...other
});
const context={signature:sig,receivedAt:'2026-10-28T21:53:01.000Z'};

test('Raydium LaunchLab ID and supported Anchor creation discriminators pinned',()=>{
 assert.equal(LAUNCHLAB_PROGRAM,'LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj');
 assert.equal(Buffer.from(discriminator('initialize_v2')).toString('hex'),'4399af27da102620');
 assert.equal(Buffer.from(discriminator('initialize_with_token_2022')).toString('hex'),'25be7ede2c9aab11');
});

test('successful supported birth has exact curve/mint and explicit unknowns',()=>{
 const item=classifyLaunchlabBirth(tx(),context);
 assert.equal(item.status,'LAUNCH_INSTRUCTION_OBSERVED');
 assert.equal(item.kind,'INITIALIZE_V2');
 assert.equal(item.curve,addr('3'));
 assert.equal(item.mint,addr('4'));
 assert.equal(item.quoteMint,addr('5'));
 assert.equal(item.signature,sig);
 assert.equal(item.slot,462635200);
 assert.equal(item.chainTime,'2026-10-28T21:53:00.000Z');
 assert.equal(item.receivedAt,context.receivedAt);
 assert.equal(item.uniqueBuyers,null);
 assert.equal(item.marketCapUsd,null);
 assert.equal(item.liquidityUsd,null);
 assert.equal(item.safetyVerified,false);
 assert.equal(item.tradabilityVerified,false);
});

test('token-2022 current initialize variant supported (shorter account list)',()=>{
 const a=accounts().slice(0,15);
 const item=classifyLaunchlabBirth(tx([ix('initialize_with_token_2022',{accounts:a})]));
 assert.equal(item.status,'LAUNCH_INSTRUCTION_OBSERVED');
 assert.equal(item.kind,'INITIALIZE_WITH_TOKEN_2022');
});

test('successful old initialize, buys, migrations, other program cannot count as births',()=>{
 for(const name of ['initialize','buy_exact_in','migrate_to_cpswap']){
  assert.equal(classifyLaunchlabBirth(tx([ix(name)])).status,'NO_SUPPORTED_LAUNCH_INSTRUCTION');
 }
 assert.equal(classifyLaunchlabBirth(tx([ix('initialize_v2',{programId:addr('8')})])).status,'NO_SUPPORTED_LAUNCH_INSTRUCTION');
});

test('failed and missing transaction produce no birth',()=>{
 assert.equal(classifyLaunchlabBirth({...tx(),meta:{err:'fail'}}).status,'TRANSACTION_FAILED');
 assert.equal(classifyLaunchlabBirth(null).status,'TRANSACTION_UNAVAILABLE');
});

test('truncated, invalid and aliasing account lists fail closed',()=>{
 for(const a of [accounts().slice(0,7),[...accounts().slice(0,5),addr('3'),addr('3'),addr('5'),...accounts().slice(8)],
  [...accounts().slice(0,6),'not-a-mint',...accounts().slice(7)]]){
  assert.equal(classifyLaunchlabBirth(tx([ix('initialize_v2',{accounts:a})])).status,'MALFORMED_INITIALIZE_ACCOUNTS');
 }
});

test('CPI initialize instruction may be captured, but only with exact program and data',()=>{
 const nested=tx([]);nested.meta.innerInstructions=[{index:0,instructions:[ix()]}];
 assert.equal(classifyLaunchlabBirth(nested).status,'LAUNCH_INSTRUCTION_OBSERVED');
});

test('logs are candidate hints only, failed/malformed logs rejected',()=>{
 const message={method:'logsNotification',params:{result:{context:{slot:90},value:{
  signature:sig,err:null,logs:['Program log: Instruction: InitializeV2']
 }}}};
 assert.deepEqual(launchlabLogCandidate(message),{signature:sig,slot:90});
 assert.equal(launchlabLogCandidate({...message,params:{result:{value:{...message.params.result.value,err:'failed'}}}}),null);
 assert.equal(launchlabLogCandidate({...message,params:{result:{value:{...message.params.result.value,logs:['Program log: Instruction: Buy']}}}}),null);
 assert.equal(launchlabLogCandidate({...message,method:'transactionNotification'}),null);
});

test('historical replay issues exactly one confirmed read and does not invent FLOAT history',async()=>{
 const calls=[];
 const fetcher=async(url,opts)=>{
  const p=JSON.parse(opts.body);calls.push({url,method:p.method,params:p.params});
  return {ok:true,json:async()=>({result:tx()})};
 };
 const found=await replayLaunchlabSignature('https://rpc.example',sig,fetcher);
 assert.equal(calls.length,1);
 assert.equal(calls[0].method,'getTransaction');
 assert.equal(calls[0].params[1].commitment,'confirmed');
 assert.equal(found.status,'LAUNCH_INSTRUCTION_OBSERVED');
 assert.equal(found.signature,sig);
 assert.equal(found.marketCapUsd,null);
 await assert.rejects(()=>loadLaunchlabTransaction('http://not-secure',sig,fetcher),/REQUIRED/);
});

test('manual WebSocket run stops at one lookup and records only independently classified birth',async()=>{
 let opened=null,requests=0,closed=false;
 class FakeWebSocket {
  constructor(){this.handlers={};queueMicrotask(()=>this.emit('open',{}))}
  addEventListener(name,cb){this.handlers[name]=cb}
  emit(name,event){this.handlers[name]?.(event)}
  send(raw){
   opened=JSON.parse(raw);
   queueMicrotask(()=>this.emit('message',{data:JSON.stringify({
    method:'logsNotification',params:{result:{context:{slot:462635200},value:{
     signature:sig,err:null,logs:['Program log: Instruction: InitializeV2']
    }}}
   })}));
  }
  close(){closed=true;this.emit('close',{})}
 }
 const fetcher=async()=>{
  requests++;return {ok:true,json:async()=>({result:tx()})};
 };
 const result=await observeLaunchlabBirths({
  rpcUrl:'https://rpc.example',wsUrl:'wss://rpc.example',
  WebSocketCtor:FakeWebSocket,fetcher,maxLookups:1,durationMs:1000
 });
 assert.equal(opened.method,'logsSubscribe');
 assert.deepEqual(opened.params[0].mentions,[LAUNCHLAB_PROGRAM]);
 assert.equal(result.status,'LOOKUP_BUDGET_REACHED');
 assert.equal(result.lookups,1);
 assert.equal(result.births.length,1);
 assert.equal(requests,1);
 assert.equal(closed,true);
 assert.equal(result.births[0].marketCapUsd,null);
});
