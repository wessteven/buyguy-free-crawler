import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {classifyLaunchlabBirth} from '../src/launchlab-birth-research.mjs';

const fixture=JSON.parse(readFileSync(
 new URL('./fixtures/float-launchlab-birth-2026-10-28.json',import.meta.url),'utf8'));
test('recorded Helius FLOAT initialization replay identifies the actual pre-graduation curve',()=>{
 assert.equal(fixture.fixtureType,'RECORDED_PROVIDER_EVIDENCE_NOT_SYNTHETIC');
 const result=classifyLaunchlabBirth(fixture.transaction,{
  signature:fixture.signature
 });
 assert.equal(result.status,'LAUNCH_INSTRUCTION_OBSERVED');
 assert.equal(result.kind,'INITIALIZE_V2');
 assert.equal(result.mint,fixture.expectedMint);
 assert.equal(result.curve,fixture.expectedCurve);
 assert.equal(result.chainTime,'2026-10-28T21:53:17.000Z');
 assert.equal(result.slot,462635268);
 assert.equal(result.evidence,'SUCCESSFUL_ANCHOR_INITIALIZE_DISCRIMINATOR_AND_IDL_ACCOUNTS');
 assert.equal(result.tradabilityVerified,false);
 assert.equal(result.uniqueBuyers,null);
 assert.equal(result.marketCapUsd,null);
});
