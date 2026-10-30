#!/usr/bin/env node
// Offline GOGET Smart Wallet Lab replay. No networking or trading is performed.
// Consumes enriched, timestamped evidence; it does NOT turn raw webhooks into verified buys.
import {readFile,writeFile} from 'node:fs/promises';
import {SmartWalletLab} from '../src/smart-wallet-lab.mjs';

function arg(name) {
  const i=process.argv.indexOf(name);
  return i<0?null:process.argv[i+1]??null;
}
async function main() {
  const input=arg('--input'),walletsPath=arg('--wallets'),output=arg('--output');
  if(!input||!walletsPath)throw Error('Usage: node scripts/smart-wallet-replay.mjs --input events.jsonl --wallets vetted-wallets.json [--output results.json]');
  const walletFile=JSON.parse(await readFile(walletsPath,'utf8'));
  if(!Array.isArray(walletFile)||!walletFile.every(x=>typeof x==='string'))throw Error('Wallets file must be a JSON string array');
  const desk=new SmartWalletLab({wallets:walletFile,startCashUsd:1000});
  const lines=(await readFile(input,'utf8')).split(/\r?\n/).filter(line=>line.trim().length>0);
  let previous=0;
  for(let i=0;i<lines.length;i++) {
    const row=JSON.parse(lines[i]);const at=Date.parse(row.observedAt);
    if(!Number.isFinite(at)||at<previous)throw Error('Event replay must be chronological with a valid observedAt; line '+(i+1));
    previous=at;
    if(row.kind==='MARK')desk.mark(row.mint,row.market,at);
    else if(row.event && row.context)desk.ingest(row.event,row.context,at);
    else throw Error('Missing enriched event/context or MARK; line '+(i+1));
  }
  const report={source:'OFFLINE_ENRICHED_REPLAY_NOT_LIVE_TRADING',
    generatedAt:new Date().toISOString(),inputRows:lines.length,...desk.summary()};
  const json=JSON.stringify(report,null,2)+'\n';
  if(output)await writeFile(output,json,{encoding:'utf8',flag:'wx'});
  else process.stdout.write(json);
}
main().catch(e=>{console.error('Smart wallet replay failed:',e.message);process.exitCode=1;});
