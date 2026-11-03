import test from 'node:test';
import assert from 'node:assert/strict';
import {WALLETS,EXPECTED_WALLET_COUNT,assertRoster} from '../src/wallets.mjs';
import {solanaDelta,evmDelta,normalizeSignature,normalizeEvmTx,classifyHelius} from '../src/normalize.mjs';
import {collect,collectSolWallet,saveWalletResult} from '../src/worker.mjs';

test('freeze complete 12-wallet v1 roster across two exact chains',()=>{
  assert.equal(EXPECTED_WALLET_COUNT,12);
  assert.equal(WALLETS.length,12);
  assert.equal(WALLETS.filter(w=>w.chain==='solana').length,5);
  assert.equal(WALLETS.filter(w=>w.chain==='robinhood').length,7);
  assert.ok(assertRoster());
  assert.throws(()=>assertRoster(WALLETS.slice(1)),/FROZEN_ROSTER/);
  assert.ok(WALLETS.some(w=>w.id==='sol-g4'));
  assert.ok(WALLETS.some(w=>w.id==='rh-ogle'));
});
test('wallet registry never mixes token contracts or unnamed proxies',()=>{
  assert.equal(new Set(WALLETS.map(w=>w.chain+':'+w.address)).size,12);
  assert.ok(WALLETS.every(w=>w.address&&w.id&&w.name));
});
const sig=prefix=>({signature:prefix+'1'.repeat(86-prefix.length),slot:100,blockTime:1793600000,err:null});
test('Solana baseline is never counted as historical completeness',()=>{
  const d=solanaDelta([sig('2'),sig('3')],null);
  assert.equal(d.status,'BASELINE_ONLY');
  assert.equal(d.rows.length,2);
});
test('Solana watermark proves actual in-window continuity',()=>{
  const s=[sig('2'),sig('3'),sig('4')];
  const ok=solanaDelta(s,s[1].signature);
  assert.equal(ok.status,'OK');assert.equal(ok.rows.length,1);assert.equal(ok.checkpointFound,true);
  const missing=solanaDelta(s,sig('9').signature);
  assert.equal(missing.status,'CHECKPOINT_NOT_FOUND');assert.equal(missing.overflow,true);
});
test('EVM cannot claim complete when last checkpoint is missing',()=>{
  const t=i=>({hash:'0x'+String(i).padStart(64,'0'),timestamp:'2026-11-02T00:00:00Z'});
  const a=[t(4),t(3),t(2)];
  const p=evmDelta(a,t(3).hash);
  assert.equal(p.status,'OK');assert.equal(p.rows.length,1);
  const miss=evmDelta(a,t(1).hash,true);
  assert.equal(miss.status,'CHECKPOINT_NOT_FOUND');assert.equal(miss.complete,false);
  assert.equal(evmDelta(a,null).status,'BASELINE_ONLY');
});
test('raw Solana signature cannot be promoted to a buy',()=>{
  const w=WALLETS.find(w=>w.id==='sol-g4');
  const n=normalizeSignature(w,sig('2'),'2026-11-02T00:00:00Z');
  assert.equal(n.category,'UNPARSED_SIGNATURE');
  assert.equal(n.initiated,'NOT_ESTABLISHED');
});
test('EVM direct transaction is not assumed to be a swap',()=>{
  const w=WALLETS.find(w=>w.id==='rh-ogle');
  const tx={hash:'0x'+'b'.repeat(64),from:{hash:w.address},status:'ok',timestamp:'2026-11-02T00:00:00Z'};
  const n=normalizeEvmTx(w,tx,'2026-11-02T00:00:00Z');
  assert.equal(n.initiated,'DIRECT_FROM');
  assert.equal(n.category,'TRANSACTION_NOT_VERIFIED_SWAP');
});
test('random inbound transfer is never a smart-money buy',()=>{
  const w=WALLETS.find(w=>w.id==='sol-g4');
  const tx={signature:sig('2').signature,type:'TRANSFER',feePayer:'payer',
    tokenTransfers:[{mint:'mint',tokenAmount:999,toUserAccount:w.address,fromUserAccount:'other'}]};
  const n=classifyHelius(w,tx);
  assert.equal(n.category,'TRANSFER_NOT_BUY');
  assert.equal(n.initiated,'NOT_ESTABLISHED');
});
test('wallet-involved SWAP requires actual opposite-direction token flows',()=>{
  const w=WALLETS.find(w=>w.id==='sol-g4');
  const tx={signature:sig('2').signature,type:'SWAP',feePayer:'relayer',
    tokenTransfers:[{mint:'token1',tokenAmount:1,fromUserAccount:w.address,toUserAccount:'pool'},
      {mint:'token2',tokenAmount:150,toUserAccount:w.address,fromUserAccount:'pool'}]};
  const n=classifyHelius(w,tx);
  assert.equal(n.category,'WALLET_SWAP_EVIDENCE');
  assert.equal(n.initiated,'OWN_BIDIRECTIONAL_TOKEN_FLOWS');
  assert.match(n.evidence_json,/NOT_INDEPENDENT_NET_PNL/);
  assert.equal(classifyHelius(w,{...tx,tokenTransfers:tx.tokenTransfers.slice(1)}).category,'SWAP_UNATTRIBUTED');
});
class FakeDB {
  constructor(){this.rows=[],this.claimed=new Set();}
  prepare(sql){
    const db=this;
    return {
      bind(...params){if(params.some(x=>x===undefined))throw Error('UNDEFINED_D1_BINDING');
        return {run:async()=>{
          db.rows.push({sql,params});
          if(sql.startsWith('INSERT OR IGNORE INTO trackbigbux_runs')){
            const n=params[0],change=db.claimed.has(n)?0:1;db.claimed.add(n);
            return {meta:{changes:change}};
          }
          return {meta:{changes:1}};
        },first:async()=>{
          if(sql.startsWith('SELECT newest_tx_id'))return null;
          if(sql.startsWith('SELECT count(*)'))return {n:0};
          return null;
        },all:async()=>({results:[]})};
      },
      first:async()=>sql.startsWith('SELECT count(*)')?{n:0}:null,
      all:async()=>({results:[]})
    };
  }
  async batch(statements){for(const s of statements)await s.run();}
}
test('missing Helius credentials cannot silently drop five Solana wallets',async()=>{
  const db=new FakeDB();
  const fetcher=async()=>({ok:false,status:429,json:async()=>({})});
  const result=await collect({DB:db},{now:new Date('2026-11-02T01:05:00Z'),fetcher});
  assert.equal(result.expected,12);
  assert.equal(result.attempted,12);
  assert.equal(result.status,'INCOMPLETE');
  assert.equal(result.partial,12);
  assert.equal(db.rows.filter(x=>x.sql.startsWith('INSERT OR REPLACE INTO trackbigbux_coverage')).length,12);
  assert.equal((await collect({DB:db},{now:new Date('2026-11-02T01:05:00Z'),fetcher})).already_run,true);
});


test('backfill handles shared signature and independent wallet classifications',async()=>{
  const {drainBacklog}=await import('../src/backfill.mjs');
  const rows=[{wallet_id:'sol-g4',tx_id:'sig1'},{wallet_id:'sol-end837',tx_id:'sig1'}];
  const updated=[];
  const db={prepare:sql=>({bind:(...params)=>({
    all:async()=>({results:rows.slice(0,params[0])}),
    run:async()=>{updated.push(params);return {meta:{changes:1}}}
  })}),batch:async stmts=>{for(const stmt of stmts)await stmt.run()}};
  const calls=[];
  const result=await drainBacklog({db,wallets:WALLETS,
    classify:wallet=>({category:'TRANSFER_NOT_BUY',initiated:'NOT_ESTABLISHED',source:'test',evidence_json:wallet.id}),
    fetchParsed:async ids=>{calls.push(ids);return [{signature:'sig1'}]}});
  assert.deepEqual(calls,[['sig1']]);
  assert.equal(result.classified,2);
  assert.equal(updated.length,2);
});
test('backfill continues after one provider batch fails',async()=>{
  const {drainBacklog}=await import('../src/backfill.mjs');
  const rows=[{wallet_id:'sol-g4',tx_id:'sig1'},{wallet_id:'sol-g4',tx_id:'sig2'}];
  const db={prepare:()=>({bind:(...params)=>({
    all:async()=>({results:rows.slice(0,params[0])}),run:async()=>({meta:{changes:1}})
  })}),batch:async stmts=>{for(const stmt of stmts)await stmt.run()}};
  const result=await drainBacklog({db,wallets:WALLETS,batchSize:1,
    classify:()=>({category:'TRANSFER_NOT_BUY',initiated:'NOT_ESTABLISHED',source:'test',evidence_json:'{}'}),
    fetchParsed:async ids=>{if(ids[0]==='sig1')throw Error('provider unavailable');return [{signature:'sig2'}]}});
  assert.equal(result.failedBatches,1);
  assert.equal(result.classified,1);
  assert.equal(result.unresolved,1);
});

const base58='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function uniqueSig(n){
  let out='';
  do{out=base58[n%58]+out;n=Math.floor(n/58);}while(n);
  return out.padStart(85,'1');
}
function solRow(n){
  return {signature:uniqueSig(n),slot:100000+n,blockTime:1793600000+n,err:null};
}
test('busy Solana wallet pages past first 301 signatures to the exact saved checkpoint',async()=>{
  const wallet=WALLETS.find(x=>x.id==='sol-decu');
  const first=Array.from({length:301},(_,i)=>solRow(500-i));
  const second=[solRow(199),solRow(198)];
  const requests=[],receipts=[];
  const fetcher=async(_,options)=>{
    const p=JSON.parse(options.body).params[1];requests.push(p);
    return {ok:true,json:async()=>({result:p.before?second:first})};
  };
  const result=await collectSolWallet(wallet,{newest_tx_id:uniqueSig(198)},
    {HELIUS_API_KEY:'unit-test'},fetcher,(...args)=>receipts.push(args));
  assert.equal(result.status,'OK');
  assert.equal(result.checkpointMatched,true);
  assert.equal(result.calls,2);
  assert.equal(result.events.length,302);
  assert.equal(requests[1].before,first.at(-1).signature);
  assert.equal(receipts.length,2);
  assert.equal(receipts[0][2],'OK');
});
test('missing Solana checkpoint remains explicit after five bounded pages',async()=>{
  const wallet=WALLETS.find(x=>x.id==='sol-cented');
  let calls=0;
  const fetcher=async()=>{
    const i=calls++;
    return {ok:true,json:async()=>({result:Array.from({length:301},(_,j)=>solRow(3000-i*301-j))})};
  };
  const result=await collectSolWallet(wallet,{newest_tx_id:uniqueSig(3)},
    {HELIUS_API_KEY:'unit-test'},fetcher,()=>{});
  assert.equal(result.calls,5);
  assert.equal(result.status,'CHECKPOINT_NOT_FOUND');
  assert.equal(result.checkpointMatched,false);
  assert.equal(result.events.length,1505);
});
test('Solana coverage gap persists observations but never advances newest watermark',async()=>{
  const db=new FakeDB();
  const wallet=WALLETS.find(w=>w.id==='sol-decu');
  await saveWalletResult(db,'trackbigbux-test',wallet,'2026-11-03T00:00:00Z',{
    events:[],status:'CHECKPOINT_NOT_FOUND',latest:uniqueSig(123),
    latestAt:null,provider:'helius_rpc',fetched:1505,calls:5,checkpointMatched:false
  },[]);
  assert.equal(db.rows.some(r=>r.sql.startsWith('INSERT INTO trackbigbux_wallet_state')),false);
  assert.equal(db.rows.some(r=>r.sql.startsWith('UPDATE trackbigbux_wallet_state SET gap_count')),true);
  assert.equal(db.rows.filter(r=>r.sql.startsWith('INSERT OR REPLACE INTO trackbigbux_coverage')).length,1);
});
test('new scheduled scan invokes bounded parser even outside the old hourly slot',async()=>{
  const db=new FakeDB(),orig=db.prepare.bind(db);
  const signature=uniqueSig(7),providerCalls=[];
  db.prepare=sql=>{
    if(sql.startsWith('SELECT count(*) AS n FROM trackbigbux_activity'))
      return {first:async()=>({n:1})};
    if(sql.startsWith('SELECT wallet_id,tx_id FROM trackbigbux_activity'))
      return {bind:(limit,offset)=>({all:async()=>({results:[{wallet_id:'sol-g4',tx_id:signature}]})})};
    return orig(sql);
  };
  const fetcher=async(url)=>{
    if(url.includes('v0/transactions')){
      providerCalls.push(url);
      return {ok:true,json:async()=>[{signature,type:'TRANSFER',tokenTransfers:[],feePayer:'unrelated'}]};
    }
    return {ok:false,status:429,json:async()=>({})};
  };
  const result=await collect({DB:db,HELIUS_API_KEY:'unit-test'},
    {now:new Date('2026-11-03T00:05:00Z'),fetcher});
  assert.equal(providerCalls.length,1);
  assert.equal(result.parsed,1);
  assert.ok(db.rows.some(r=>r.sql.startsWith('INSERT OR IGNORE INTO trackbigbux_receipts')&&r.params[1]==='__parser'));
});

test('shared Robinhood source failures preserve real OUT and IN receipts per wallet',async()=>{
  const db=new FakeDB(),calls=[];
  const fetcher=async(_url,options)=>{
    const req=JSON.parse(options.body);calls.push(req.method);
    if(req.method==='eth_chainId')return {ok:true,json:async()=>({result:'0x1237'})};
    if(req.method==='eth_blockNumber')return {ok:true,json:async()=>({result:'0x20000'})};
    if(req.method==='eth_getLogs'&&req.params[0].topics.length===2)
      return {ok:true,json:async()=>({result:[]})};
    return {ok:false,status:429,json:async()=>({})};
  };
  const result=await collect({DB:db,TRACKBIGBUX_RH_MODE:'rpc_transfer_only'},
    {now:new Date('2026-11-03T08:45:00Z'),fetcher});
  assert.equal(result.partial,12);
  assert.deepEqual(calls,['eth_chainId','eth_blockNumber','eth_getLogs','eth_getLogs']);
  const receipts=db.rows.filter(x=>x.sql.startsWith('INSERT OR IGNORE INTO trackbigbux_receipts')
    &&String(x.params[1]).startsWith('rh-'));
  assert.equal(receipts.length,14);
  assert.equal(receipts.filter(x=>x.params[4]==='eth_getLogs_batch_OUT'&&x.params[6]==='OK').length,7);
  assert.equal(receipts.filter(x=>x.params[4]==='eth_getLogs_batch_IN'&&x.params[6]==='FAILED').length,7);
});
test('public RPC head error records the actual failed method rather than guessing',async()=>{
  const db=new FakeDB();
  const fetcher=async()=>({ok:false,status:429,json:async()=>({})});
  const result=await collect({DB:db,TRACKBIGBUX_RH_MODE:'rpc_transfer_only'},
    {now:new Date('2026-11-03T08:50:00Z'),fetcher});
  assert.equal(result.partial,12);
  const receipts=db.rows.filter(x=>x.sql.startsWith('INSERT OR IGNORE INTO trackbigbux_receipts')
    &&String(x.params[1]).startsWith('rh-'));
  assert.equal(receipts.length,7);
  assert.ok(receipts.every(x=>x.params[4]==='eth_chainId'&&x.params[6]==='FAILED'));
});

test('legacy Helius endpoint 404 retries exactly once on original documented host, with no invented buys',async()=>{
  const db=new FakeDB(),orig=db.prepare.bind(db),signature=uniqueSig(7007),urls=[];
  db.prepare=sql=>{
    if(sql.startsWith('SELECT count(*) AS n FROM trackbigbux_activity'))return {first:async()=>({n:1})};
    if(sql.startsWith('SELECT wallet_id,tx_id FROM trackbigbux_activity'))return {bind:()=>({all:async()=>({results:[{wallet_id:'sol-g4',tx_id:signature}]})})};
    return orig(sql);
  };
  const fetcher=async(url)=>{
    if(url.includes('/v0/transactions')){
      urls.push(url.split('?')[0]);
      if(url.includes('api-mainnet.helius-rpc.com'))return {ok:false,status:404,json:async()=>({})};
      return {ok:true,json:async()=>[{signature,type:'TRANSFER',tokenTransfers:[],feePayer:'not-wallet'}]};
    }
    return {ok:false,status:429,json:async()=>({})};
  };
  const res=await collect({DB:db,HELIUS_API_KEY:'test-only'},{
    now:new Date('2026-11-03T08:55:00Z'),fetcher});
  assert.deepEqual(urls,[
    'https://api-mainnet.helius-rpc.com/v0/transactions',
    'https://api.helius.xyz/v0/transactions'
  ]);
  assert.equal(res.parsed,1);
  const receipt=db.rows.find(x=>x.sql.startsWith('INSERT OR IGNORE INTO trackbigbux_receipts')
    &&x.params[1]==='__parser');
  assert.equal(receipt.params[6],'OK');
  assert.match(receipt.params[8],/parserHost=api.helius.xyz/);
});
test('Helius 429 never falls back or turns a failed batch into a parsed row',async()=>{
  const db=new FakeDB(),orig=db.prepare.bind(db),signature=uniqueSig(7337),urls=[];
  db.prepare=sql=>{
    if(sql.startsWith('SELECT count(*) AS n FROM trackbigbux_activity'))return {first:async()=>({n:1})};
    if(sql.startsWith('SELECT wallet_id,tx_id FROM trackbigbux_activity'))return {bind:()=>({all:async()=>({results:[{wallet_id:'sol-g4',tx_id:signature}]})})};
    return orig(sql);
  };
  const fetcher=async url=>{
    if(url.includes('/v0/transactions')){urls.push(url.split('?')[0]);return {ok:false,status:429,json:async()=>({})};}
    return {ok:false,status:429,json:async()=>({})};
  };
  const res=await collect({DB:db,HELIUS_API_KEY:'test-only'},{
    now:new Date('2026-11-03T09:00:00Z'),fetcher});
  assert.deepEqual(urls,['https://api-mainnet.helius-rpc.com/v0/transactions']);
  assert.equal(res.parsed,0);
  const receipt=db.rows.find(x=>x.sql.startsWith('INSERT OR IGNORE INTO trackbigbux_receipts')
    &&x.params[1]==='__parser');
  assert.equal(receipt.params[6],'FAILED');
  assert.match(receipt.params[8],/UPSTREAM_HTTP_429/);
});

test('Parsed Events mode sends up to 100 signatures in one request, commits only real classifications',async()=>{
  const db=new FakeDB(),orig=db.prepare.bind(db),signatures=Array.from({length:100},(_,i)=>uniqueSig(17000+i));
  const records=signatures.map(tx_id=>({wallet_id:'sol-g4',tx_id}));
  const requests=[];
  db.prepare=sql=>{
    if(sql.startsWith('SELECT count(*) AS n FROM trackbigbux_activity'))return {first:async()=>({n:records.length})};
    if(sql.startsWith('SELECT wallet_id,tx_id FROM trackbigbux_activity'))
      return {bind:(limit,offset)=>({all:async()=>({results:records.slice(offset,offset+limit)})})};
    return orig(sql);
  };
  const fetcher=async(url,options)=>{
    if(url.includes('/v1/parsed-events/transactions')){
      const data=JSON.parse(options.body);requests.push({url:url.split('?')[0],data});
      return {ok:true,json:async()=>data.transactions.map(signature=>({
        signature,parserStatus:'OK',parsed:{transactionStatus:'OK',feePayer:'not-the-wallet',
          summary:{type:'transfer'},tokenTransfers:[]}
      }))};
    }
    return {ok:false,status:429,json:async()=>({})};
  };
  const result=await collect({DB:db,HELIUS_API_KEY:'unit-test',TRACKBIGBUX_PARSE_MODE:'parsed_events'},{
    now:new Date('2026-11-03T09:15:00Z'),fetcher});
  assert.equal(requests.length,1);
  assert.equal(requests[0].url,'https://mainnet.helius-rpc.com/v1/parsed-events/transactions');
  assert.equal(requests[0].data.rawTransaction,'none');
  assert.equal(requests[0].data.transactions.length,100);
  assert.equal(result.parsed,100);
  const receipt=db.rows.find(x=>x.sql.startsWith('INSERT OR IGNORE INTO trackbigbux_receipts')&&x.params[1]==='__parser');
  assert.equal(receipt.params[3],'helius_parsed_events');
  assert.equal(receipt.params[6],'OK');
  assert.equal(receipt.params[7],100);
  assert.match(receipt.params[8],/itemErrors=0/);
});
test('Parsed Events item-level parser failures remain pending with honest receipt',async()=>{
  const db=new FakeDB(),orig=db.prepare.bind(db),signature=uniqueSig(20123);
  db.prepare=sql=>{
    if(sql.startsWith('SELECT count(*) AS n FROM trackbigbux_activity'))return {first:async()=>({n:1})};
    if(sql.startsWith('SELECT wallet_id,tx_id FROM trackbigbux_activity'))
      return {bind:()=>({all:async()=>({results:[{wallet_id:'sol-g4',tx_id:signature}]})})};
    return orig(sql);
  };
  const fetcher=async url=>url.includes('/v1/parsed-events/transactions')?
    {ok:true,json:async()=>[{signature,parserStatus:'ERROR',parserError:{code:'transaction_not_found'}}]}:
    {ok:false,status:429,json:async()=>({})};
  const result=await collect({DB:db,HELIUS_API_KEY:'unit-test',TRACKBIGBUX_PARSE_MODE:'parsed_events'},{
    now:new Date('2026-11-03T09:20:00Z'),fetcher});
  assert.equal(result.parsed,0);
  const receipt=db.rows.find(x=>x.sql.startsWith('INSERT OR IGNORE INTO trackbigbux_receipts')&&x.params[1]==='__parser');
  assert.equal(receipt.params[6],'OK');
  assert.equal(receipt.params[7],1);
  assert.match(receipt.params[8],/itemErrors=1/);
  assert.ok(result.warnings.some(x=>x.startsWith('PARSER_ITEM_ERRORS_')));
  assert.ok(!db.rows.some(x=>x.sql.startsWith('UPDATE trackbigbux_activity SET category=')));
});
