#!/usr/bin/env node
import {readFile,writeFile} from 'node:fs/promises';
import {auditSourceControl} from '../src/goget-source-control.mjs';
const cohort=JSON.parse(await readFile('research/smart-wallet-webhook-cohort.json','utf8'));
try{
  const report=await auditSourceControl({apiKey:process.env.HELIUS_API_KEY,
    expectedWallets:cohort.map(x=>x.wallet),projectId:process.env.HELIUS_PROJECT_ID||null});
  await writeFile('goget-source-control.json',JSON.stringify(report,null,2)+'\n');
  console.log('GOGET_SOURCE_CONTROL',JSON.stringify(report));
  if(report.subscription!=='REGISTERED_MATCHED_COHORT')process.exitCode=1;
}catch{
  console.error('GOGET_SOURCE_CONTROL_UNVERIFIED');process.exitCode=1;
}
