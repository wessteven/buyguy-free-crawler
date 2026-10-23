import test from 'node:test';
import assert from 'node:assert/strict';
import {discoveryQuality} from '../src/discovery-quality.mjs';
test('quality snapshot is bounded, read-only and conservatively attributed',async()=>{
 const sql=[];
 const db={prepare(query){sql.push(query);return {async all(){
  if(query.includes('FROM observations'))return {results:[
   {asset_key:'solana:ABC',pool:'pool1',provider:'DEX Screener',seen_at:'2026-10-22T10:00:00Z',score:70,liquidity:60000,buys_m5:3},
   {asset_key:'solana:ABC',pool:'pool1',provider:'DEX Screener',seen_at:'2026-10-22T09:00:00Z',score:20,liquidity:2000,buys_m5:0}
  ]};
  return {results:[{started_at:'2026-10-22T10:00:00Z',state:'SUCCESS',observed:1}]};
 }}}};
 const report=await discoveryQuality(db);
 assert.equal(report.counts.uniqueMints,1);
 assert.equal(report.counts.repeats,1);
 assert.equal(report.counts.highScoreLiquid,1);
 assert.equal(report.rows[0].path,'run_timestamp_match');
 assert.equal(report.rows[0].pathConfidence,'unverified');
 assert.equal(report.rows[0].buyerEvidence,'transactions_only');
 assert.equal(report.rows[0].quoteFreshness,'unverified');
 assert.equal(report.rows[1].path,'unknown');
 assert.equal(sql.length,2);
 assert.ok(sql.every(q=>/^SELECT /.test(q)));
 assert.ok(sql.every(q=>/LIMIT (120|45)/.test(q)));
});
