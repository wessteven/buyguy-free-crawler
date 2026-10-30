import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {SmartWalletLab,assessCopyBuy,assessPaperExit,LAB_RULES} from '../src/smart-wallet-lab.mjs';

const NOW=Date.parse('2026-10-30T02:00:00.000Z');
const wallet='A'.repeat(44),mint='B'.repeat(44),pool='C'.repeat(44);
const signature='5'.repeat(88);
function fixture(overrides={}) {
  const event={chain:'solana',side:'BUY',wallet,mint,pool,signature,source:'VERIFIED_SWAP',
    confirmed:true,swapVerified:true,walletTradeUsd:400,walletBuyPriceUsd:1,
    blockTime:new Date(NOW-1200).toISOString(),seenAt:new Date(NOW-500).toISOString(),
    ...overrides.event};
  const market={mint,pool,quotedAt:new Date(NOW-200).toISOString(),
    routeSource:'INDEPENDENT_EXECUTABLE_QUOTE',routeVerified:true,
    riskVerified:true,holderOwnerMappingVerified:true,mintAuthorityRevoked:true,
    freezeAuthorityRevoked:true,extensionsReviewed:true,liquidityUsd:56000,
    top10OwnerPct:22,devOwnerPct:2,lpCustodyVerified:true,lpStatus:'BURNED',riskVerifiedAt:new Date(NOW-300000).toISOString(),
    midUsd:1.1,askUsd:1.1,bidUsd:1.08,...overrides.market};
  const walletEvidence={audited:true,closedTrades:40,profitFactor:1.4,
    netRealizedPnlUsd:1400,washRiskReviewed:true,washRiskDetected:false,asOfAt:new Date(NOW-3600000).toISOString(),...overrides.walletEvidence};
  return {event,context:{market,walletEvidence,soldSinceBuy:false,tradeFeedComplete:true,tradeFeedAsOf:new Date(NOW).toISOString(),...overrides.context}};
}
const newDesk=()=>new SmartWalletLab({wallets:[wallet],startCashUsd:1000});
function decision(overrides={}) {const f=fixture(overrides);return assessCopyBuy(f.event,
  {...f.context,monitoredWallets:new Set([wallet])},
  {cashUsd:1000,openExposureUsd:0,openPositions:0,openMints:new Set(),dailyRealizedUsd:0},NOW);}

test('five stages produce paper-only proposal with bounded sizing, fees, stops and latency caveat',()=>{
  const r=decision();assert.equal(r.ok,true);assert.equal(r.decision,'PAPER_BUY');
  assert.deepEqual(r.stages.map(s=>s.stage),['SCOUT','FILTER','ANALYST','GUARD','PAPER_SNIPER']);
  assert.equal(r.proposal.spendUsd,20);assert.ok(r.proposal.entryUsd>1.1);
  assert.ok(r.proposal.stopUsd<r.proposal.entryUsd);
  assert.equal(r.proposal.fillEvidence,'SIMULATED_WORSE_THAN_EXECUTABLE_QUOTE_NOT_REAL_FILL');
  assert.equal(r.delayMs,700);assert.equal(r.latencyTargetMet,true);
  assert.match(r.note,/NOT independently established/);
});

test('unmonitored wallets and stale/replayed events are rejected before risk review',()=>{
  assert.equal(decision({event:{wallet:'D'.repeat(44)}}).stage,'SCOUT');
  assert.ok(decision({event:{blockTime:new Date(NOW-45000).toISOString()}}).reasons.includes('EVENT_STALE_OR_TIME_UNKNOWN'));
  assert.ok(decision({event:{confirmed:false}}).reasons.includes('ONCHAIN_SWAP_NOT_VERIFIED'));
});

test('unknown concentration, active mint authority, risky liquidity and unverified LP all fail closed',()=>{
  assert.ok(decision({market:{top10OwnerPct:null}}).reasons.includes('TOP10_CONCENTRATION_UNSAFE_OR_UNKNOWN'));
  assert.ok(decision({market:{top10OwnerPct:36}}).reasons.includes('TOP10_CONCENTRATION_UNSAFE_OR_UNKNOWN'));
  assert.ok(decision({market:{devOwnerPct:6}}).reasons.includes('DEV_CONCENTRATION_UNSAFE_OR_UNKNOWN'));
  assert.ok(decision({market:{mintAuthorityRevoked:false}}).reasons.includes('MINT_CONTROL_UNVERIFIED'));
  assert.ok(decision({market:{liquidityUsd:24999}}).reasons.includes('LOW_OR_UNKNOWN_LIQUIDITY'));
  assert.ok(decision({market:{lpCustodyVerified:false}}).reasons.includes('LP_CUSTODY_UNVERIFIED'));
  assert.ok(decision({market:{holderOwnerMappingVerified:false}}).reasons.includes('RISK_OR_OWNER_MAPPING_UNVERIFIED'));
  assert.ok(decision({market:{riskVerifiedAt:new Date(NOW+1000).toISOString()}}).reasons.includes('RISK_EVIDENCE_STALE_OR_FUTURE'));
});

test('stale and mismatched execution quote cannot create a paper position',()=>{
  assert.ok(decision({market:{quotedAt:new Date(NOW-11000).toISOString()}}).reasons.includes('QUOTE_STALE_OR_MISSING'));
  assert.ok(decision({market:{pool:'D'.repeat(44)}}).reasons.includes('QUOTE_POOL_IDENTITY_UNVERIFIED'));
  assert.ok(decision({market:{routeVerified:false}}).reasons.includes('EXECUTABLE_ROUTE_UNVERIFIED'));
});

test('wallet edge requires independently audited profitable trades and complete sell feed',()=>{
  assert.equal(decision({walletEvidence:{closedTrades:4}}).stage,'ANALYST');
  assert.ok(decision({context:{tradeFeedComplete:false}}).reasons.includes('WALLET_SELL_STATUS_UNVERIFIED_OR_SOLD'));
  assert.ok(decision({context:{soldSinceBuy:true}}).reasons.includes('WALLET_SELL_STATUS_UNVERIFIED_OR_SOLD'));
  assert.ok(decision({market:{midUsd:1.82}}).reasons.includes('ALREADY_UP_80_PCT_OR_PRICE_UNKNOWN'));
  assert.ok(decision({walletEvidence:{washRiskDetected:true}}).reasons.includes('WALLET_EDGE_NOT_PROVEN'));
  assert.ok(decision({walletEvidence:{asOfAt:new Date(NOW+10000).toISOString()}}).reasons.includes('WALLET_STATS_LOOKAHEAD_OR_STALE'));
  assert.ok(decision({context:{tradeFeedAsOf:new Date(NOW-1500).toISOString()}}).reasons.includes('WALLET_FEED_TIMESTAMP_UNVERIFIED'));
});

test('guard stops trading when exposure, cash or daily loss is exceeded',()=>{
  const f=fixture(),base={cashUsd:1000,openExposureUsd:0,openPositions:0,openMints:new Set(),dailyRealizedUsd:0};
  const run=a=>assessCopyBuy(f.event,{...f.context,monitoredWallets:new Set([wallet])},{...base,...a},NOW);
  assert.ok(run({cashUsd:10}).reasons.includes('INSUFFICIENT_PAPER_CASH'));
  assert.ok(run({openExposureUsd:245}).reasons.includes('PAPER_EXPOSURE_LIMIT'));
  assert.ok(run({openPositions:4}).reasons.includes('PAPER_POSITION_LIMIT'));
  assert.ok(run({dailyRealizedUsd:-105}).reasons.includes('DAILY_PAPER_LOSS_LIMIT'));
});

test('ingesting same confirmed buy twice does not charge cash twice and journal explains kill',()=>{
  const desk=newDesk(),f=fixture();
  assert.equal(desk.ingest(f.event,f.context,NOW).decision,'PAPER_BUY');
  assert.equal(desk.cashUsd,980);
  assert.equal(desk.ingest(f.event,f.context,NOW).decision,'KILL');
  assert.equal(desk.cashUsd,980);assert.equal(desk.positions.size,1);
  assert.equal(desk.summary().rejectedByReason.DUPLICATE_EVENT,1);
  assert.equal(desk.summary().mode,'PAPER_ONLY_NO_EXECUTION');
});

test('verified copied wallet sell closes paper position and records under-10min observation',()=>{
  const desk=newDesk(),f=fixture();desk.ingest(f.event,f.context,NOW);
  const sell={...f.event,side:'SELL',signature:'6'.repeat(88)};
  const market={...f.context.market,quotedAt:new Date(NOW+3*60000).toISOString(),bidUsd:1.3};
  const result=desk.ingest(sell,{market},NOW+3*60000);
  assert.equal(result.decision,'PAPER_EXIT');assert.equal(result.reason,'COPIED_WALLET_SELL');
  assert.equal(result.withinTenMinutes,true);
  assert.equal(desk.positions.size,0);assert.ok(desk.realizedUsd>0);
});

test('spoofed sell and unknown sell quote do not create fictitious exits',()=>{
  const desk=newDesk(),f=fixture();desk.ingest(f.event,f.context,NOW);
  const fake={...f.event,side:'SELL',confirmed:false,signature:'6'.repeat(88)};
  assert.equal(desk.ingest(fake,{market:f.context.market},NOW+5000).decision,'KILL');
  const good={...fake,confirmed:true,signature:'7'.repeat(88)};
  const stale={...f.context.market,quotedAt:new Date(NOW).toISOString()};
  assert.equal(desk.ingest(good,{market:stale},NOW+30000).decision,'EXIT_BLOCKED');
  assert.equal(desk.positions.size,1);
});

test('mark stop never promises a fill at the stop and refuses stale quotes',()=>{
  const desk=newDesk(),f=fixture();desk.ingest(f.event,f.context,NOW);
  assert.equal(desk.mark(mint,{...f.context.market,quotedAt:new Date(NOW).toISOString()},NOW+20000).decision,'EXIT_BLOCKED');
  const market={...f.context.market,quotedAt:new Date(NOW+30000).toISOString(),bidUsd:0.8};
  const out=desk.mark(mint,market,NOW+30000);
  assert.equal(out.reason,'STOP');assert.ok(out.exitUsd<0.8);
  assert.ok(out.realizedUsd<0);assert.equal(desk.positions.size,0);
  assert.equal(desk.mark(mint,market,NOW+31000).decision,'NOT_HELD');
});

test('no simulated paper exit without a fresh independently verified sell-side quote',()=>{
  const p={mint,pool,units:1,spendUsd:1,stopUsd:0.9,targetUsd:1.4};
  const q=fixture().context.market;
  assert.equal(assessPaperExit(p,{...q,routeVerified:false},NOW).decision,'EXIT_BLOCKED');
  assert.equal(assessPaperExit(p,q,NOW).decision,'HOLD');
  assert.equal(LAB_RULES.maxTradeUsd,100);
});

test('offline replay CLI honors chronological inputs and reports paper-only outcomes',()=>{
  const dir=mkdtempSync(join(tmpdir(),'goget-smart-wallet-'));
  try {
    const wallets=join(dir,'wallets.json'),input=join(dir,'events.jsonl'),output=join(dir,'result.json');
    const f=fixture();writeFileSync(wallets,JSON.stringify([wallet]));
    const row={observedAt:new Date(NOW).toISOString(),event:f.event,context:f.context};
    writeFileSync(input,JSON.stringify(row)+'\\n'+JSON.stringify(row)+'\\n');
    const run=spawnSync(process.execPath,['scripts/smart-wallet-replay.mjs','--wallets',wallets,'--input',input,'--output',output],{encoding:'utf8'});
    assert.equal(run.status,0,run.stderr);
    const report=JSON.parse(readFileSync(output,'utf8'));
    assert.equal(report.mode,'PAPER_ONLY_NO_EXECUTION');assert.equal(report.paperBuys,1);
    assert.equal(report.rejectedByReason.DUPLICATE_EVENT,1);
    const overwrite=spawnSync(process.execPath,['scripts/smart-wallet-replay.mjs','--wallets',wallets,'--input',input,'--output',output],{encoding:'utf8'});
    assert.notEqual(overwrite.status,0,'Evidence output must not be overwritten');
  } finally {rmSync(dir,{recursive:true,force:true});}
});
