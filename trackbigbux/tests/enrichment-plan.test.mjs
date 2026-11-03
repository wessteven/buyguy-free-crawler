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
