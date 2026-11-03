import test from 'node:test';
import assert from 'node:assert/strict';
import {FROZEN,AUDIT_ROSTER_VERSION,EXPECTED_AUDIT_COUNT,evaluateAudit,pickAuditableRun,parserEvidence,estimateSourceCredits} from '../scripts/audit.mjs';

function fixture(){
  const now=new Date('2026-11-02T12:00:00Z'),run={
    run_id:'trackbigbux-1234',roster_version:AUDIT_ROSTER_VERSION,
    expected_wallets:12,attempted_wallets:12,complete_wallets:12,
    status:'RAW_COVERAGE_COMPLETE',completed_at:'2026-11-02T11:55:00Z',events_staged:40
  };
  const coverage=Object.entries(FROZEN).map(([wallet_id,[chain,expected_address]])=>({
    wallet_id,chain,expected_address,status:'OK',checkpoint_matched:1
  }));
  const receipts=Object.keys(FROZEN).map(wallet_id=>({wallet_id,result_status:'OK',response_records:2}));
  return {now,run,coverage,receipts,persistedEvents:22,pending:5};
}
test('independent 12-wallet denominator never follows collector self-claims',()=>{
  assert.equal(EXPECTED_AUDIT_COUNT,12);
  const x=evaluateAudit(fixture());
  assert.equal(x.verdict,'RAW_CAPTURE_VERIFIED');assert.equal(x.requestWallets,12);
});
test('a missing wallet fails even if worker reports 12 of 12',()=>{
  const f=fixture();f.coverage.pop();
  const x=evaluateAudit(f);
  assert.equal(x.verdict,'INCOMPLETE');
  assert.ok(x.failures.includes('COVERAGE_ROWS_NOT_12'));
});
test('a wallet identity swap fails even with successful receipts',()=>{
  const f=fixture();f.coverage[0].expected_address='malicious-wallet';
  assert.ok(evaluateAudit(f).failures.some(x=>x.startsWith('ADDRESS_IDENTITY_MISMATCH')));
});
test('provider call failure cannot be transformed into a verified observation',()=>{
  const f=fixture();f.receipts[0].result_status='FAILED';
  assert.ok(evaluateAudit(f).failures.some(x=>x.startsWith('PROVIDER_RECEIPT_MISSING')));
});
test('checkpoint gaps remain incomplete; no silent downgrade of scope',()=>{
  const f=fixture();f.coverage[0].status='CHECKPOINT_NOT_FOUND';
  assert.equal(evaluateAudit(f).verdict,'INCOMPLETE');
});
test('a stale source run fails regardless of recent audit time',()=>{
  const f=fixture();f.now=new Date('2026-11-02T13:30:00Z');
  assert.ok(evaluateAudit(f).failures.includes('STALE_OR_FUTURE_SOURCE_RUN'));
});
test('decline against prior verified execution is marked regression',()=>{
  const f=fixture();f.coverage.pop();f.previous={verdict:'RAW_CAPTURE_VERIFIED'};
  assert.equal(evaluateAudit(f).verdict,'REGRESSION');
});
test('parser backlog is reported and never called audited profitability',()=>{
  const f=fixture();const x=evaluateAudit(f);
  assert.equal(x.pending,5);
  assert.equal(x.persistedEvents,22);
  assert.notEqual(x.candidateEvents,x.persistedEvents);
});

test('ongoing scan does not replace finished 12-wallet coverage in external audit',()=>{
  const f=fixture();
  const newer={run_id:'trackbigbux-active',status:'RUNNING',started_at:'2026-11-02T11:58:00Z'};
  const selected=pickAuditableRun(newer,f.run);
  assert.equal(selected.run.run_id,f.run.run_id);
  assert.equal(selected.activeRun.run_id,newer.run_id);
  const out=evaluateAudit({...f,run:selected.run,activeRun:selected.activeRun});
  assert.equal(out.verdict,'RAW_CAPTURE_VERIFIED');
});
test('stuck active scan fails audit even when prior finished scan qualifies',()=>{
  const f=fixture();
  const activeRun={run_id:'trackbigbux-stuck',status:'RUNNING',started_at:'2026-11-02T11:40:00Z'};
  const out=evaluateAudit({...f,activeRun});
  assert.ok(out.failures.includes('STALE_OR_INVALID_ACTIVE_RUN'));
});
test('do not manufacture a source run when only a partial run exists',()=>{
  const active={status:'RUNNING',started_at:'2026-11-02T11:58:00Z'};
  assert.deepEqual(pickAuditableRun(active,null),{run:null,activeRun:active});
  const out=evaluateAudit({...fixture(),run:null,activeRun:active});
  assert.ok(out.failures.includes('NO_SOURCE_RUN'));
});
test('parser receipts remain independent from wallet source receipts',()=>{
  const r=parserEvidence([
    {wallet_id:'sol-g4',request_kind:'getSignaturesForAddress',result_status:'OK',response_records:301},
    {wallet_id:'__parser',request_kind:'parseTransactions',result_status:'OK',response_records:12},
    {wallet_id:'__parser',request_kind:'parseTransactions',result_status:'FAILED',response_records:0}
  ]);
  assert.deepEqual(r,{attempted:2,ok:1,failed:1,recordsReturned:12});
});

test('credit model uses unique Helius wallet requests, not shared Robinhood receipt multiplication',()=>{
 const receipts=[
   {wallet_id:'sol-g4',source:'helius_rpc',request_kind:'getSignaturesForAddress',result_status:'OK'},
   {wallet_id:'sol-decu',source:'helius_rpc',request_kind:'getSignaturesForAddress',result_status:'FAILED'},
   {wallet_id:'__parser',source:'helius_parsed_events',request_kind:'parseTransactions',result_status:'OK'},
   {wallet_id:'rh-unipcs',source:'robinhood_public_rpc',request_kind:'eth_getLogs_batch_OUT',result_status:'OK'},
   {wallet_id:'rh-ogle',source:'robinhood_public_rpc',request_kind:'eth_getLogs_batch_OUT',result_status:'OK'}
 ];
 const x=estimateSourceCredits(receipts);
 assert.equal(x.archivalRpcCalls,2);
 assert.equal(x.parsedEventsCalls,1);
 assert.equal(x.legacyEnhancedCalls,0);
 assert.equal(x.estimatedCreditsPerRun,30);
 assert.equal(x.projectedCreditsPer30DaysAt5MinuteCadence,259200);
 assert.match(x.model,/NOT_ACCOUNT_USAGE/);
});
test('legacy parser costs differ from Parsed Events and unknown-source requests are not estimated',()=>{
 const x=estimateSourceCredits([
   {wallet_id:'__parser',source:'helius_enhanced',request_kind:'parseTransactions'},
   {wallet_id:'foo',source:'unknown',request_kind:'whatever'}
 ]);
 assert.equal(x.estimatedCreditsPerRun,100);
});
