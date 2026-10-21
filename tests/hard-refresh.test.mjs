import test from 'node:test';
import assert from 'node:assert/strict';
import {runHardRefreshStage,d1ReadQuota} from '../src/hard-refresh.mjs';

function mockDB(changes=1){
 const names=[];
 return {names,prepare(sql){
  if(sql.startsWith('INSERT INTO leases'))return {bind(...values){
   names.push(values[0]);return {run:async()=>({meta:{changes}})};
  }};
  if(sql.startsWith('SELECT expires_at'))return {bind:()=>({first:async()=>({expires_at:Date.parse('2026-10-21T01:03:00Z')})})};
  throw Error('Unexpected SQL: '+sql);
 }};
}
test('deep refresh refuses unsupported stages and absent D1',async()=>{
 assert.equal((await runHardRefreshStage({DB:mockDB()},{stage:'bad'})).httpStatus,422);
 assert.equal((await runHardRefreshStage({},{stage:'discovery'})).error,'DB_UNAVAILABLE');
});
test('deep refresh discovery uses one short provider stage and a shared D1 lease',async()=>{
 const db=mockDB();
 const got=await runHardRefreshStage({DB:db},{stage:'discovery',now:'2026-10-21T01:00:00Z',
  discover:async()=>4,fetcher:async()=>{throw Error('unused')}});
 assert.equal(got.status,'UPDATED');
 assert.equal(got.discovered,4);
 assert.deepEqual(db.names,['top5-hard-refresh:discovery']);
 assert.equal(got.noTrading,true);
});
test('deep refresh quote stage caps selected contracts at 25 and exposes partial data',async()=>{
 const db=mockDB();
 let cap;
 const got=await runHardRefreshStage({DB:db},{stage:'quotes',now:'2026-10-21T01:00:00Z',
  refreshQuotes:async(_,options)=>{cap=options.limit;return {tracked:21,refreshed:17,failedProviders:['robinhood: 429']}}});
 assert.equal(cap,25);
 assert.equal(got.status,'PARTIAL');
 assert.equal(got.refreshed,17);
 assert.deepEqual(got.providerWarnings,['robinhood: 429']);
});
test('shared cooldown returns 429 without touching provider',async()=>{
 let called=false;
 const got=await runHardRefreshStage({DB:mockDB(0)},{stage:'quotes',now:'2026-10-21T01:00:00Z',
  refreshQuotes:async()=>{called=true}});
 assert.equal(got.error,'COOLDOWN');
 assert.equal(got.httpStatus,429);
 assert.equal(got.retryAfterSeconds,180);
 assert.equal(called,false);
});
test('D1 exhaustion is explicitly reported and not converted to no candidates',async()=>{
 assert.ok(d1ReadQuota(Error('D1_ERROR: exceeded daily row read limit')));
 const db={prepare(){throw Error('D1_ERROR: exceeded daily row read limit')}};
 const got=await runHardRefreshStage({DB:db},{stage:'discovery'});
 assert.equal(got.error,'D1_READ_QUOTA');
 assert.equal(got.httpStatus,503);
 const after=await runHardRefreshStage({DB:mockDB()},{stage:'quotes',
  refreshQuotes:async()=>{throw Error('exceeded D1 daily row read limit')}});
 assert.equal(after.error,'D1_READ_QUOTA');
});
test('provider 429 never claims success or triggers retries',async()=>{
 const got=await runHardRefreshStage({DB:mockDB()},{stage:'discovery',
  discover:async()=>{throw Error('upstream provider 429')}});
 assert.equal(got.error,'PROVIDER_RATE_LIMIT');
 assert.equal(got.httpStatus,429);
});
