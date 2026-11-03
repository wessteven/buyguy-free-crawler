import test from 'node:test';
import assert from 'node:assert/strict';
import {groupPendingBySignature,planEnrichment} from '../src/enrichment-plan.mjs';

test('one parsed transaction updates both involved wallets without duplicate provider requests',()=>{
  const rows=[{wallet_id:'sol-a',tx_id:'sig1'},{wallet_id:'sol-b',tx_id:'sig1'}];
  const groups=groupPendingBySignature(rows);
  assert.equal(groups.size,1);
  assert.deepEqual([...groups.get('sig1')],['sol-a','sol-b']);
  const updates=planEnrichment(rows,[{signature:'sig1'}],[{id:'sol-a'},{id:'sol-b'}],
    wallet=>({category:wallet.id,initiated:'NOT_ESTABLISHED',source:'test',evidence_json:'{}'}));
  assert.deepEqual(updates.map(x=>x.walletId),['sol-a','sol-b']);
});
test('duplicate rows, unknown signatures and unknown wallets do not invent classifications',()=>{
  const rows=[{wallet_id:'sol-a',tx_id:'sig1'},{wallet_id:'sol-a',tx_id:'sig1'},
    {wallet_id:'unrecognized',tx_id:'sig1'}];
  const updates=planEnrichment(rows,[{signature:'sig1'},{signature:'sig2'}],
    [{id:'sol-a'}],()=>({category:'TRANSFER_NOT_BUY'}));
  assert.equal(updates.length,1);
  assert.equal(updates[0].walletId,'sol-a');
});
test('no classification leaves the signature pending',()=>{
  assert.deepEqual(planEnrichment([{wallet_id:'sol-a',tx_id:'sig1'}],
    [{signature:'sig1'}],[{id:'sol-a'}],()=>null),[]);
});

test('bounded parser offset rotates past unparseable head-of-line rows',async()=>{
  const {drainBacklog}=await import('../src/backfill.mjs');
  let bindArgs;
  const db={prepare:sql=>({bind:(...params)=>{
    if(sql.startsWith('SELECT wallet_id,tx_id'))bindArgs=params;
    return {all:async()=>({results:[{wallet_id:'sol-a',tx_id:'sig-tail'}]}),run:async()=>({meta:{changes:1}})};
  }}),batch:async statements=>{for(const stmt of statements)await stmt.run()}};
  const x=await drainBacklog({db,offset:27,limit:20,wallets:[{id:'sol-a'}],
    fetchParsed:async()=>[{signature:'sig-tail'}],
    classify:()=>({category:'UNRESOLVED',initiated:'NOT_ESTABLISHED',source:'test',evidence_json:'{}'})});
  assert.deepEqual(bindArgs,[20,27]);
  assert.equal(x.classified,1);
  await assert.rejects(drainBacklog({db,offset:-1,wallets:[],classify:()=>null,fetchParsed:async()=>[]}),/BACKFILL_BOUNDS_INVALID/);
});
