import test from 'node:test';
import assert from 'node:assert/strict';
import {retryRead} from '../src/goget-read-retry.mjs';
test('a timed-out safe read can recover once; exhausted reads remain failed',async()=>{
  let calls=0,delays=[];
  const result=await retryRead(async()=>{if(++calls===1)throw new DOMException('timeout','TimeoutError');return 7;},
    {sleep:async ms=>delays.push(ms)});
  assert.equal(result,7);assert.equal(calls,2);assert.deepEqual(delays,[1000]);
  calls=0;
  await assert.rejects(retryRead(async()=>{calls++;throw Error('HTTP_503');},{sleep:async()=>{}}),/HTTP_503/);
  assert.equal(calls,2);
});
test('authentication, rate limits and unknown failures are not retried',async()=>{
  for(const code of ['HTTP_401','HTTP_403','HTTP_429','UNKNOWN']){
    let calls=0;
    await assert.rejects(retryRead(async()=>{calls++;throw Error(code);},{sleep:async()=>assert.fail()}));
    assert.equal(calls,1);
  }
});
