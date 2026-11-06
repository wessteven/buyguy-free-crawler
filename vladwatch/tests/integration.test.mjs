import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {runCollector} from '../src/collector.mjs';
import {WALLETS} from '../src/config.mjs';

class MemoryD1 {
 constructor(){this.sqlite=new DatabaseSync(':memory:');this.sqlite.exec(readFileSync(new URL('../sql/001.sql',import.meta.url),'utf8'));}
 prepare(sql){const owner=this;return { sql, args:[], bind(...args){this.args=args;return this;}, async first(){return owner.sqlite.prepare(sql).get(...this.args)||null;},async all(){return {results:owner.sqlite.prepare(sql).all(...this.args)};},async run(){return owner.sqlite.prepare(sql).run(...this.args)} };}
 async batch(statements){this.sqlite.exec('BEGIN');try{const out=[];for(const s of statements)out.push(this.sqlite.prepare(s.sql).run(...s.args));this.sqlite.exec('COMMIT');return out;}catch(e){this.sqlite.exec('ROLLBACK');throw e;}}
}
const reply=x=>new Response(JSON.stringify(x),{status:200,headers:{'content-type':'application/json'}});
const addr=WALLETS[0].address;
const t1='0x'+'a'.repeat(64),t2='0x'+'b'.repeat(64);
function mkFetcher(secondRun=false,rpcOutage=false){return async (url,opts)=>{
 if(url.includes('/api/v2/addresses/')){
   if(url.includes('/token-transfers'))return reply({items:[],next_page_params:null});
   const items=[...(secondRun?[{hash:t2,block:112,timestamp:'2026-11-06T00:00:00Z',from:{hash:addr},to:{hash:'0x'+'f'.repeat(40)},value:'0'}]:[]),{hash:t1,block:111,timestamp:'2026-11-05T00:00:00Z',from:{hash:addr},to:{hash:'0x'+'f'.repeat(40)},value:'10'}];
   return reply({items,next_page_params:null});
 }
 if (rpcOutage) throw new Error('ENOTFOUND');
 const method=JSON.parse(opts.body).method;
 let chain= url.includes('arb')?42161:url.includes('base')?8453:url.includes('ethereum')||url.includes('llamarpc')?1:4663;
 return reply({jsonrpc:'2.0',result: method==='eth_chainId'?'0x'+chain.toString(16):method==='eth_blockNumber'?'0x66':method==='eth_getBalance'?'0x20':'0x1'});
};}

test('D1 end-to-end: exact five coverage rows, first-run baseline and persisted event dedupe',async()=>{
 const DB=new MemoryD1();
 const first=await runCollector({DB},'unit',mkFetcher());
 assert.equal(first.state,'checked');assert.equal(first.actual,5);assert.equal(first.counts.checked,5);
 assert.equal(DB.sqlite.prepare('SELECT COUNT(*) n FROM vladwatch_events').get().n,5);
 assert.equal(DB.sqlite.prepare('SELECT COUNT(*) n FROM vladwatch_events WHERE baseline=1').get().n,5);
 const second=await runCollector({DB},'unit',mkFetcher(true));
 assert.equal(second.state,'checked'); assert.equal(second.actual,5);
 assert.equal(DB.sqlite.prepare('SELECT COUNT(*) n FROM vladwatch_events').get().n,10);
 assert.equal(DB.sqlite.prepare('SELECT COUNT(*) n FROM vladwatch_events WHERE baseline=0').get().n,5);
 const cov=DB.sqlite.prepare('SELECT * FROM vladwatch_coverage WHERE run_id=?').all(second.id);
 assert.equal(cov.length,5);
 assert.ok(cov.every(r=>JSON.parse(r.details_json).txNewSinceCheckpoint===1));
 assert.ok(cov.every(r=>JSON.parse(r.details_json).tradesVerified===0));
});

test('D1 end-to-end: RPC outage is partial despite indexed-history success',async()=>{
 const DB=new MemoryD1();
 const r=await runCollector({DB},'unit',mkFetcher(false,true));
 assert.equal(r.actual,5);assert.equal(r.counts.partial,5);assert.equal(r.state,'partial');
 const rows=DB.sqlite.prepare('SELECT native_status,tx_status,token_status,overall FROM vladwatch_coverage').all();
 assert.equal(rows.length,5);assert.ok(rows.every(x=>x.native_status==='failed'&&x.tx_status==='checked'&&x.overall==='partial'));
});