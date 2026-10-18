import test from 'node:test';
import assert from 'node:assert/strict';
import {scheduledResearch} from '../src/scheduled-research.mjs';
test('Helius still runs when market source fails with HTTP 429',async()=>{
  const stages=[];
  const result=await scheduledResearch({DB:{},HELIUS_RPC_URL:'https://rpc.example/private'},{
    market:async()=>{stages.push('market');throw Error('HTTP 429')},
    verify:async()=>{stages.push('helius');return {checked:3,failed:0}},
    retire:async()=>{stages.push('retire');return {cooled:1}},
    paper:async()=>{throw Error('paper must remain off')}
  });
  assert.deepEqual(stages,['market','helius','retire']);
  assert.equal(result.market,'FAILED');
  assert.equal(result.risk,3);
  assert.equal(result.paper,'DISABLED');
});
test('No configured Helius secret = no external authority calls',async()=>{
  let count=0;
  const result=await scheduledResearch({DB:{}},{
    market:async()=>0,
    verify:async()=>{count++;return {checked:1}},
    retire:async()=>({archived:0}),
    paper:async()=>{throw Error('should not trade')}
  });
  assert.equal(count,0);
  assert.equal(result.risk,'SKIPPED');
  assert.equal(result.paper,'DISABLED');
});
test('Paper accounting engine requires a separate explicit opt-in',async()=>{
  let invoked=0;
  await scheduledResearch({DB:{},HELIUS_RPC_URL:'https://rpc.example'},{
    market:async()=>0,verify:async()=>({checked:0}),retire:async()=>0,
    paper:async()=>{invoked++;return {orders:0}}
  });
  assert.equal(invoked,0);
  await scheduledResearch({DB:{},PAPER_SIMULATION_ENABLED:'true'},{
    market:async()=>0,verify:async()=>({checked:0}),retire:async()=>0,
    paper:async()=>{invoked++;return {orders:0}}
  });
  assert.equal(invoked,1);
});
