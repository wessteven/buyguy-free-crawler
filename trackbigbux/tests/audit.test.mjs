import test from 'node:test';
import assert from 'node:assert/strict';
import {FROZEN,AUDIT_ROSTER_VERSION,EXPECTED_AUDIT_COUNT,evaluateAudit} from '../scripts/audit.mjs';

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
