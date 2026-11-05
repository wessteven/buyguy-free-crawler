#!/usr/bin/env node
import {readFile,writeFile} from 'node:fs/promises';
import {auditSourceControl} from '../src/goget-source-control.mjs';
import {expectedWebhookWallets} from '../src/goget-live-source-coverage.mjs';
const cohort=JSON.parse(await readFile('research/smart-wallet-webhook-cohort.json','utf8'));
try{
  const {readFile:read}=await import('node:fs/promises');
  const subscribed=expectedWebhookWallets(cohort,await read('wrangler.smart-wallet.toml','utf8'));
  const report=await auditSourceControl({apiKey:process.env.HELIUS_API_KEY,
    expectedWallets:subscribed,projectId:process.env.HELIUS_PROJECT_ID||null});
  report.originalCohortSize=cohort.length;
  report.originalExcludedFromSubscription=cohort.length-subscribed.length;
  report.rosterSource='VERIFIED_12_OF_14_CONFIG_AND_HELIUS';
  await writeFile('goget-source-control.json',JSON.stringify(report,null,2)+'\n');
  console.log('GOGET_SOURCE_CONTROL',JSON.stringify(report));
  if(report.subscription!=='REGISTERED_MATCHED_COHORT')process.exitCode=1;
}catch{
  console.error('GOGET_SOURCE_CONTROL_UNVERIFIED');process.exitCode=1;
}
