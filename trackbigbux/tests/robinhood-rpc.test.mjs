import test from 'node:test';
import assert from 'node:assert/strict';
import {ERC20_TRANSFER_TOPIC,topicAddress,parseHexInt,flowWindow,normalizeFlow,readHead,collectRpcWallet,collectRpcCohort,rpcCall,rpcPaceSlot}
  from '../src/robinhood-rpc.mjs';
import {WALLETS} from '../src/wallets.mjs';
const wallet=WALLETS.find(w=>w.id==='rh-unipcs');
const addr=topicAddress(wallet.address);
function logFor({from=wallet.address,to='0x0000000000000000000000000000000000000001',idx='0x0',block='0x2ee0'}={}){
 return {address:'0x39dbed3a2bd333467115de45665cc57f813c4571',
   transactionHash:'0x'+'a'.repeat(64),blockNumber:block,logIndex:idx,
   topics:[ERC20_TRANSFER_TOPIC,topicAddress(from),topicAddress(to)],
   data:'0x'+(123n).toString(16).padStart(64,'0'),removed:false};
}
test('Robinhood frozen RPC identity and ERC20 Transfer topic',()=>{
 assert.equal(addr.length,66);
 assert.equal(addr.slice(-40),wallet.address.toLowerCase().slice(2));
 assert.equal(parseHexInt('0x1237'),4663);
 assert.throws(()=>topicAddress('fake'),/RPC_INVALID_ADDRESS/);
});
test('initial and incremental RPC block windows preserve bounded continuity',()=>{
 const init=flowWindow(null,750000);
 assert.equal(init.from,747000);assert.equal(init.to,750000);
 assert.equal(init.baseline,true);
 const next=flowWindow('rpc:748000',750000);
 assert.equal(next.from,748001);assert.equal(next.to,750000);
 assert.equal(next.backlog,false);
 const bounded=flowWindow('rpc:740000',750000);
 assert.equal(bounded.to,746000);assert.equal(bounded.backlog,true);
});
test('inbound and outbound must match exact wallet and are never called trades',()=>{
 const out=normalizeFlow(wallet,logFor(), '2026-11-02T10:00:00Z');
 assert.equal(out.category,'ERC20_TRANSFER_NOT_SWAP');
 assert.equal(out.initiated,'UNVERIFIED');
 assert.equal(JSON.parse(out.evidence_json).direction,'OUT');
 assert.equal(JSON.parse(out.evidence_json).raw_value_hex,'0x'+(123n).toString(16).padStart(64,'0'));
 const inn=normalizeFlow(wallet,logFor({from:'0x0000000000000000000000000000000000000001',to:wallet.address}),
   '2026-11-02T10:00:00Z');
 assert.equal(JSON.parse(inn.evidence_json).direction,'IN');
 const wrong=normalizeFlow(wallet,logFor({from:'0x0000000000000000000000000000000000000001',to:'0x0000000000000000000000000000000000000002'}),
   '2026-11-02T10:00:00Z');
 assert.equal(wrong,null);
});
test('reject NFT lookalikes, wrong logs and removed events',()=>{
 const a=logFor();
 assert.equal(normalizeFlow(wallet,{...a,data:'0x'},new Date().toISOString()),null);
 assert.equal(normalizeFlow(wallet,{...a,removed:true},new Date().toISOString()),null);
 assert.equal(normalizeFlow(wallet,{...a,topics:a.topics.concat('0x'+'0'.repeat(64))},new Date().toISOString()),null);
 assert.equal(normalizeFlow(wallet,{...a,topics:['0x'+'f'.repeat(64),...a.topics.slice(1)]},new Date().toISOString()),null);
});
test('head verifies official Robinhood chain ID, blocks a wrong chain',async()=>{
 const fetcher=async (_url,options)=>{
   const req=JSON.parse(options.body);
   return {ok:true,json:async()=>({jsonrpc:'2.0',id:1,result:req.method==='eth_chainId'?'0x1237':'0x123456'})};
 };
 assert.equal(await readHead(fetcher),0x123456);
 const invalid=async()=>({ok:true,json:async()=>({result:'0x1'})});
 await assert.rejects(readHead(invalid),/WRONG_CHAIN/);
});
test('bounded transfers are persisted without trade attribution; 2 source receipts',async()=>{
 const calls=[],fetcher=async(_url,options)=>{
   const req=JSON.parse(options.body);
   assert.equal(req.method,'eth_getLogs');
   calls.push(req.params[0]);
   const topics=req.params[0].topics;
   const result=topics.length===2?[logFor()]:[];
   return {ok:true,json:async()=>({jsonrpc:'2.0',id:1,result})};
 };
 const receipts=[],record=(...values)=>receipts.push(values);
 const result=await collectRpcWallet(wallet,null,12000,fetcher,record,'2026-11-02T10:00:00Z');
 assert.equal(result.status,'RPC_BASELINE_TRANSFER_ONLY');
 assert.equal(result.events.length,1);
 assert.equal(result.fetched,1);assert.equal(result.calls,2);
 assert.equal(result.latest,'rpc:12000');
 assert.equal(calls[0].fromBlock,'0x2328');
 assert.equal(receipts.filter(x=>x[2]==='OK').length,2);
});
test('RPC failure is not treated as zero trading activity',async()=>{
 const receipt=[];
 const error=async()=>({ok:false,status:429});
 await assert.rejects(collectRpcWallet(wallet,null,12000,error,(...args)=>receipt.push(args)),/HTTP_429/);
 assert.equal(receipt.at(-1)[2],'FAILED');
});

test('seven-wallet cohort needs only two RPC log requests and keeps identities separate',async()=>{
 const wallets=WALLETS.filter(x=>x.chain==='robinhood'),calls=[],receipt=[];
 const base='0x0000000000000000000000000000000000000001';
 const ownA=wallets[0],ownB=wallets[1];
 const sample=[
   {...logFor({from:ownA.address,to:base}),transactionHash:'0x'+'a'.repeat(64)},
   {...logFor({from:base,to:ownB.address}),transactionHash:'0x'+'b'.repeat(64),logIndex:'0x1'}
 ];
 const fetcher=async(_url,options)=>{
   const req=JSON.parse(options.body);assert.equal(req.method,'eth_getLogs');
   calls.push(req);
   const topics=req.params[0].topics;
   assert.equal(topics[0],ERC20_TRANSFER_TOPIC);
   assert.ok(Array.isArray(topics.length===2?topics[1]:topics[2]));
   assert.equal((topics.length===2?topics[1]:topics[2]).length,7);
   return {ok:true,json:async()=>({result:topics.length===2?[sample[0]]:[sample[1]]})};
 };
 const result=await collectRpcCohort(wallets,new Map(),12000,fetcher,
   (...args)=>receipt.push(args),'2026-11-02T10:00:00Z');
 assert.equal(calls.length,2);
 assert.equal(receipt.length,2);
 assert.equal(result.size,7);
 assert.equal(result.get(ownA.id).events.length,1);
 assert.equal(result.get(ownB.id).events.length,1);
 assert.equal(result.get(wallets[2].id).events.length,0);
 assert.equal(result.get(ownB.id).events[0].source,'robinhood_public_rpc');
 assert.equal(result.get(ownA.id).status,'RPC_BASELINE_TRANSFER_ONLY');
});
test('seven-wallet cohort cannot silently shrink to six',async()=>{
 const wallets=WALLETS.filter(x=>x.chain==='robinhood');
 await assert.rejects(collectRpcCohort(wallets.slice(0,6),new Map(),12000,async()=>({ok:true,json:async()=>({result:[]})}),()=>{}),
   /DENOMINATOR_NOT_7/);
});

test('configured dedicated RPC URL is used for head and seven-wallet cohort calls',async()=>{
  const configured='https://robinhood-mainnet.g.alchemy.com/v2/test-only';
  const urls=[];
  const fetcher=async(url,options)=>{
    urls.push(url);
    const req=JSON.parse(options.body);
    const value=req.method==='eth_chainId'?'0x1237':
      req.method==='eth_blockNumber'?'0x12345':[];
    return {ok:true,json:async()=>({result:value})};
  };
  const head=await readHead(fetcher,configured);
  await collectRpcCohort(WALLETS.filter(w=>w.chain==='robinhood'),new Map(),
    head,fetcher,()=>{},'2026-11-03T00:00:00Z',configured);
  assert.equal(urls.length,4);
  assert.ok(urls.every(x=>x===configured));
  await assert.rejects(rpcCall('eth_chainId',[],fetcher,'http://insecure.local'),/ENDPOINT_INVALID/);
});

test('public RPC pacer reserves non-overlapping request slots',()=>{
  assert.deepEqual(rpcPaceSlot(1000,0),{waitMs:0,nextAt:2200});
  assert.deepEqual(rpcPaceSlot(1050,2200),{waitMs:1150,nextAt:3400});
  assert.deepEqual(rpcPaceSlot(5000,3400),{waitMs:0,nextAt:6200});
});
