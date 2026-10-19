import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import worker from '../src/viewer.mjs';

async function tableSandbox(storage=new Map()){
  const r=await worker.fetch(new Request('https://example.test/dashboard'),{});
  assert.equal(r.status,200);
  const html=await r.text();
  const match=html.match(/<script>([\s\S]*?)<\/script>/i);
  assert.ok(match,'Dashboard must embed browser script');
  const assets={
    innerHTML:'',scrollLeft:0,
    querySelectorAll(){return []},
    querySelector(){return null}
  };
  const ui=new Map([['assets',assets],['assetOrderStatus',{textContent:''}]]);
  const doc={
    getElementById:id=>{
      if(!ui.has(id))ui.set(id,{onclick:null,value:'',textContent:'',innerHTML:'',style:{}});
      return ui.get(id);
    },
    querySelectorAll:()=>[],
    elementsFromPoint:()=>[]
  };
  const localStorage={
    getItem:key=>storage.has(key)?storage.get(key):null,
    setItem:(key,value)=>storage.set(key,String(value))
  };
  const context=vm.createContext({document:doc,localStorage,Date,Intl,Number,
    JSON,String,Array,Object,Math,console,fetch:()=>{throw Error('Network not needed for table test');}});
  vm.runInContext(match[1],context,{timeout:2000});
  const evalJS=code=>vm.runInContext(code,context,{timeout:2000});
  return {evalJS,assets,storage,html};
}
const example=[
  {chain:'solana',symbol:'B_DOG',score:20,status:'STATIC',liquidity:500000,
   market_cap:100000,price:0.4,buys_m5:20,sells_m5:10,risk_status:'UNVERIFIED',
   provider:'DEX Screener'},
  {chain:'robinhood',symbol:'A_CAT',score:92,status:'ALIVE',liquidity:60000,
   market_cap:60000,price:0.0005,buys_m5:3,sells_m5:7,risk_status:'UNVERIFIED',
   provider:'DEX Screener'}
];
const setup=async(storage)=>{
  const ui=await tableSandbox(storage);
  ui.evalJS('setAssetData('+JSON.stringify(example)+')');
  return ui;
};
test('Mobile dashboard exposes sort, drag and reset instructions',async()=>{
  const {html}=await tableSandbox();
  assert.match(html,/Reset columns/);
  assert.match(html,/Drag headings to move columns/);
  assert.match(html,/touch-action:pan-y/);
  assert.match(html,/aria-sort/);
});
test('Score defaults high-first; tap toggles ascending then descending',async()=>{
  const ui=await setup();
  assert.ok(ui.assets.innerHTML.indexOf('A_CAT')<ui.assets.innerHTML.indexOf('B_DOG'));
  ui.evalJS("sortAssets('score')");
  assert.ok(ui.assets.innerHTML.indexOf('B_DOG')<ui.assets.innerHTML.indexOf('A_CAT'));
  ui.evalJS("sortAssets('score')");
  assert.ok(ui.assets.innerHTML.indexOf('A_CAT')<ui.assets.innerHTML.indexOf('B_DOG'));
});
test('Financial columns use numeric rather than alphabetical sorting',async()=>{
  const ui=await setup();
  ui.evalJS("sortAssets('liquidity')");
  assert.ok(ui.assets.innerHTML.indexOf('B_DOG')<ui.assets.innerHTML.indexOf('A_CAT'));
  ui.evalJS("sortAssets('liquidity')");
  assert.ok(ui.assets.innerHTML.indexOf('A_CAT')<ui.assets.innerHTML.indexOf('B_DOG'));
  ui.evalJS("sortAssets('symbol')");
  assert.ok(ui.assets.innerHTML.indexOf('A_CAT')<ui.assets.innerHTML.indexOf('B_DOG'));
});
test('Dragged column preference and sorting survive page reload',async()=>{
  const ui=await setup();
  assert.equal(ui.evalJS("moveAssetColumn('symbol','chain',false)"),true);
  assert.ok(ui.assets.innerHTML.indexOf('data-col="symbol"')<ui.assets.innerHTML.indexOf('data-col="chain"'));
  ui.evalJS("sortAssets('symbol')");
  const again=await setup(ui.storage);
  assert.ok(again.assets.innerHTML.indexOf('data-col="symbol"')<again.assets.innerHTML.indexOf('data-col="chain"'));
  assert.match(again.assets.innerHTML,/aria-sort="ascending"/);
  again.evalJS('resetAssetColumns()');
  assert.ok(again.assets.innerHTML.indexOf('data-col="chain"')<again.assets.innerHTML.indexOf('data-col="symbol"'));
});
test('Malicious saved layout and token symbol are sanitized',async()=>{
  const storage=new Map([['buyguy.assetColumns.v1',JSON.stringify(['symbol','unknown','symbol','chain'])]]);
  const ui=await tableSandbox(storage);
  ui.evalJS("setAssetData("+JSON.stringify([{...example[0],symbol:'<img src=x onerror=alert(1)>'}])+")");
  assert.ok(ui.assets.innerHTML.indexOf('data-col="symbol"')<ui.assets.innerHTML.indexOf('data-col="chain"'));
  assert.doesNotMatch(ui.assets.innerHTML,/<img src=x/);
  assert.match(ui.assets.innerHTML,/&lt;img src=x/);
});
