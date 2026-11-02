import test from 'node:test';
import assert from 'node:assert/strict';
import {WALLETS,EXPECTED_WALLET_COUNT,assertRoster} from '../src/wallets.mjs';
import {solanaDelta,evmDelta,normalizeSignature,normalizeEvmTx,classifyHelius} from '../src/normalize.mjs';
import {collect} from '../src/worker.mjs';

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
