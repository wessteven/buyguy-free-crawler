import test from 'node:test';
import assert from 'node:assert/strict';
import {WALLETS} from '../src/wallets.mjs';
import {classifyParsedEvent,parsedItemErrors,MAX_PARSED_EVENTS_BATCH,PARSED_EVENTS_ENDPOINT}
  from '../src/parsed-events.mjs';
const wallet=WALLETS.find(w=>w.id==='sol-g4');
const foreign='11111111111111111111111111111112';
const swap=()=>({signature:'sig123',parserStatus:'OK',parsed:{
  transactionStatus:'OK',feePayer:wallet.address,
  summary:{type:'swap',parsedData:{protocol:'jupiter'}},
  tokenTransfers:[
    {mint:'mint1',fromUserAccount:wallet.address,toUserAccount:foreign,rawTokenAmount:'900719925474099300000',decimals:9},
    {mint:'mint2',fromUserAccount:foreign,toUserAccount:wallet.address,rawTokenAmount:'800',decimals:6}
  ]
}});
test('current official Parsed Events endpoint and 100 maximum batch',()=>{
  assert.equal(PARSED_EVENTS_ENDPOINT,'https://mainnet.helius-rpc.com/v1/parsed-events/transactions');
  assert.equal(MAX_PARSED_EVENTS_BATCH,100);
});
test('proof of swap requires exact wallet inbound/outbound token flows and parsed swap summary',()=>{
  const x=classifyParsedEvent(wallet,swap());
  assert.equal(x.category,'WALLET_SWAP_EVIDENCE');
  assert.equal(x.initiated,'WALLET_FEE_PAYER');
  assert.equal(x.source,'helius_parsed_events');
  const e=JSON.parse(x.evidence_json);
  assert.equal(e.ownOutbound[0].rawTokenAmount,'900719925474099300000');
  assert.equal(e.ownInbound[0].rawTokenAmount,'800');
  assert.equal(e.tokenUnits,'raw');
  assert.match(x.evidence_json,/NOT_INDEPENDENT_NET_PNL/);
});
test('inbound-only parsed swap and foreign fee payer are not buys',()=>{
  const tx=swap();tx.parsed.feePayer=foreign;
  tx.parsed.tokenTransfers=tx.parsed.tokenTransfers.slice(1);
  const x=classifyParsedEvent(wallet,tx);
  assert.equal(x.category,'SWAP_UNATTRIBUTED');
  assert.equal(x.initiated,'NOT_ESTABLISHED');
});
test('parser-level missing item stays pending, not a fraudulent classification',()=>{
  assert.equal(classifyParsedEvent(wallet,{signature:'sig',parserStatus:'ERROR',
    parserError:{code:'transaction_not_found'}}),null);
  assert.equal(parsedItemErrors([{parserStatus:'OK'},{parserStatus:'ERROR'}]),1);
  assert.throws(()=>parsedItemErrors({}),/SCHEMA_INVALID/);
});
test('non-swap and execution errors cannot become buy classifications',()=>{
  const transfer=swap();transfer.parsed.summary.type='transfer';
  assert.equal(classifyParsedEvent(wallet,transfer).category,'NON_SWAP_OR_UNRESOLVED');
  transfer.parsed.transactionStatus='ERROR';
  assert.equal(classifyParsedEvent(wallet,transfer).category,'FAILED_TRANSACTION_PARSED');
});
