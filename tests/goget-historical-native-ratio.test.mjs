import test from 'node:test';
import assert from 'node:assert/strict';
import {inferExactCounterpartyNativeRatio} from '../src/goget-historical-native-ratio.mjs';
const pool='7'.repeat(44),mint='5'.repeat(44),wallet='6'.repeat(44),fee='9'.repeat(44);
const sol='So11111111111111111111111111111111111111112';
const tx=(transfer)=>({type:'SWAP',signature:'8'.repeat(88),timestamp:1793777061,
  transactionError:null,accountData:[{account:pool}],tokenTransfers:transfer});
test('direct matching buyer legs derive native ratio and exclude unrelated fee legs',()=>{
 const t=tx([
  {mint:sol,tokenAmount:.5,fromUserAccount:wallet,toUserAccount:pool},
  {mint:sol,tokenAmount:.005,fromUserAccount:wallet,toUserAccount:fee},
  {mint,tokenAmount:100000,fromUserAccount:pool,toUserAccount:wallet}]);
 const x=inferExactCounterpartyNativeRatio(t,{pool,mint});
 assert.equal(x.status,'HISTORIC_NATIVE_POOL_FLOW_RATIO_ONLY');
 assert.equal(x.side,'TOKEN_BOUGHT_FROM_POOL');
 assert.equal(x.solPerToken,.000005);
 assert.equal(x.tokenAmount,100000);
 assert.equal(x.counterparty,wallet);
 assert.equal(x.usdPerToken,undefined);
});
test('direct seller legs derive native ratio',()=>{
 const x=inferExactCounterpartyNativeRatio(tx([
 {mint:sol,tokenAmount:1.2,fromUserAccount:pool,toUserAccount:wallet},
 {mint,tokenAmount:600000,fromUserAccount:wallet,toUserAccount:pool}]),{pool,mint});
 assert.equal(x.status,'HISTORIC_NATIVE_POOL_FLOW_RATIO_ONLY');
 assert.equal(x.side,'TOKEN_SOLD_TO_POOL');
 assert.equal(x.solPerToken,.000002);
});
test('reject routed counterparties, multilegs, other mints and non-swap',()=>{
 const routed=tx([
 {mint:sol,tokenAmount:1,fromUserAccount:wallet,toUserAccount:pool},
 {mint,tokenAmount:50000,fromUserAccount:pool,toUserAccount:fee}]);
 assert.equal(inferExactCounterpartyNativeRatio(routed,{pool,mint}).solPerToken,null);
 const multiple=tx([
 {mint:sol,tokenAmount:1,fromUserAccount:wallet,toUserAccount:pool},
 {mint,tokenAmount:50000,fromUserAccount:pool,toUserAccount:wallet},
 {mint,tokenAmount:60000,fromUserAccount:pool,toUserAccount:wallet}]);
 assert.equal(inferExactCounterpartyNativeRatio(multiple,{pool,mint}).status,
 'NO_UNAMBIGUOUS_DIRECT_COUNTERPARTY_LEGS');
 const mixed=tx([
 {mint:sol,tokenAmount:1,fromUserAccount:wallet,toUserAccount:pool},
 {mint,tokenAmount:50000,fromUserAccount:pool,toUserAccount:wallet},
 {mint:fee,tokenAmount:2,fromUserAccount:pool,toUserAccount:wallet}]);
 assert.equal(inferExactCounterpartyNativeRatio(mixed,{pool,mint}).status,
 'MULTI_MINT_POOL_LEGS_AMBIGUOUS');
 assert.equal(inferExactCounterpartyNativeRatio({...routed,type:'TRANSFER'},{pool,mint}).status,
 'NO_SUCCESSFUL_ENHANCED_SWAP');
});
