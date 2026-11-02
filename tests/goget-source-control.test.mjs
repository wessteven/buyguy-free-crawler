import test from 'node:test';
import assert from 'node:assert/strict';
import {auditSourceControl,GOGET_RECEIVER} from '../src/goget-source-control.mjs';
const key='fake-test-key-do-not-log',wallets=['wallet-a','wallet-b'];
const audit=(fetcher,extra={})=>auditSourceControl({apiKey:key,expectedWallets:wallets,fetcher,...extra});
test('a missing subscription cannot masquerade as a healthy MONITOR action',async()=>{
  const r=await audit(async(_,o)=>{assert.equal(o.method,'GET');return new Response('[]');});
  assert.equal(r.subscription,'MISSING_OWN_SUBSCRIPTION');
  assert.equal(r.creditUsage.status,'PROJECT_ID_UNAVAILABLE');
  assert.equal(r.mutations,0);assert.ok(!JSON.stringify(r).includes(key));
});
test('exact cohort, inactive flags, mismatches and duplicate own endpoints remain distinct',async()=>{
  for(const [entries,status] of [
    [[{webhookURL:GOGET_RECEIVER,accountAddresses:wallets}],'REGISTERED_MATCHED_COHORT'],
    [[{webhookURL:GOGET_RECEIVER,accountAddresses:wallets,active:false}],'PROVIDER_MARKED_INACTIVE'],
    [[{webhookURL:GOGET_RECEIVER,accountAddresses:['other']}],'COHORT_UNVERIFIED_OR_MISMATCH'],
    [[{webhookURL:GOGET_RECEIVER},{webhookURL:GOGET_RECEIVER}],'DUPLICATE_OWN_SUBSCRIPTIONS']]){
    assert.equal((await audit(async()=>new Response(JSON.stringify(entries)))).subscription,status);
  }
});
test('an optional authorised usage read reports actual credits without publishing identifiers or keys',async()=>{
  const r=await audit(async(url,o)=>{
    assert.equal(o.method,'GET');
    if(url.includes('/usage?'))return new Response(JSON.stringify({creditsRemaining:12345,creditsUsed:456}));
    return new Response('[]');
  },{projectId:'project-test-123'});
  assert.equal(r.creditUsage.status,'VERIFIED');assert.equal(r.creditUsage.creditsRemaining,12345);
  assert.equal(r.subscription,'MISSING_OWN_SUBSCRIPTION');
  assert.ok(!JSON.stringify(r).includes('project-test-123'));
});
test('rate limits are not probed again through alternate hosts; provider errors are scrubbed',async()=>{
  let calls=0;
  const r=await audit(async()=>{calls++;return new Response('',{status:429});});
  assert.equal(calls,1);assert.equal(r.subscription,'CONTROL_API_UNAVAILABLE');
  const broken=await audit(async()=>{throw Error('url contains '+key);});
  assert.ok(!JSON.stringify(broken).includes(key));
});
test('pilot expiry prevents all provider management requests',async()=>{
  const r=await audit(async()=>assert.fail('expired pilot must not call provider'),{
    now:Date.parse('2026-11-08T00:00:00Z')});
  assert.equal(r.subscription,'SOURCE_PILOT_EXPIRED');assert.equal(r.managementCalls,0);
});
