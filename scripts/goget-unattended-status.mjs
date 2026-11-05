#!/usr/bin/env node
// Reads saved collection evidence. Never invokes /run or makes provider calls.
import {createHmac} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {evaluateUnattendedReport} from '../src/goget-unattended-acceptance.mjs';
const admin=process.env.ADMIN_TOKEN;
if(!admin||admin.length<24)throw Error('UNATTENDED_STATUS_CREDENTIAL_UNAVAILABLE');
const token=createHmac('sha256',admin).update('GOGET:PRE_SIGNAL:RUN:v1').digest('base64url');
try{
  const r=await fetch('https://goget-pre-signal.wessteven.workers.dev/status',{
    headers:{authorization:'Bearer '+token},signal:AbortSignal.timeout(30000)});
  if(r.status!==200)throw Error('UNATTENDED_STATUS_UNAVAILABLE');
  const report=await r.json();
  if(report?.window?.expectedSlots!==864||typeof report?.latest?.ok!=='boolean')
    throw Error('UNATTENDED_STATUS_UNVERIFIED');
  const acceptance=evaluateUnattendedReport(report,{now:Date.now()});
  await writeFile('goget-unattended-status.json',JSON.stringify({...report,acceptance},null,2)+'\n');
  console.log('GOGET_UNATTENDED_STATUS',JSON.stringify(report));
  console.log('GOGET_UNATTENDED_ACCEPTANCE',JSON.stringify(acceptance));
  if(acceptance.status!=='SAMPLED_WINDOW_PASS'){
    // The watchdog ran successfully: preserve the historical failure as a
    // mandatory prominently flagged finding, not an infrastructure exception.
    // Only malformed/inaccessible evidence makes the workflow itself fail.
    console.warn('::warning::GOGET_UNATTENDED_EVIDENCE_INCOMPLETE '+
      JSON.stringify({status:acceptance.status,expected:acceptance.expectedSlots,
        observed:acceptance.observedSlots,eligible:acceptance.eligibleSlots,
        reasons:acceptance.reasons,continuousCoverageVerified:false}));
  }
}catch{console.error('GOGET_UNATTENDED_STATUS_UNAVAILABLE');process.exitCode=1;}
