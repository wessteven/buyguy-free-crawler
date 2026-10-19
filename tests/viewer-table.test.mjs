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
    querySelector(){return null},
    addEventListener(name,handler){this.listeners=this.listeners||{};this.listeners[name]=handler}
  };
  const ui=new Map([['assets',assets],['assetOrderStatus',{textContent:''}]]);
  const doc={
    getElementById:id=>{
      if(!ui.has(id))ui.set(id,{onclick:null,value:'',textContent:'',innerHTML:'',style:{},hidden:false,
        attributes:{},listeners:{},tabIndex:-1,
        setAttribute(name,value){this.attributes[name]=value},
        addEventListener(name,listener){this.listeners[name]=listener},
        focus(){this.focused=true}});
      return ui.get(id);
    },
    querySelectorAll:()=>[],
    elementsFromPoint:()=>[]
  };
  const localStorage={
    getItem:key=>storage.has(key)?storage.get(key):null,
    setItem:(key,value)=>storage.set(key,String(value))
  };
  const context=vm.createContext({document:doc,localStorage,Date,Intl,Number,URL,
    JSON,String,Array,Object,Math,console,fetch:()=>{throw Error('Network not needed for table test');}});
  vm.runInContext(match[1],context,{timeout:2000});
  const evalJS=code=>vm.runInContext(code,context,{timeout:2000});
  return {evalJS,assets,storage,html,ui};
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

test('Navigation order is research, wallet, recent runs, then outcomes',async()=>{
 const {html,evalJS,ui}=await tableSandbox();
 const names=['tab-research','tab-wallet','tab-runs','tab-outcomes'];
 for(let i=1;i<names.length;i++)assert.ok(html.indexOf('id="'+names[i-1]+'"')<html.indexOf('id="'+names[i]+'"'));
 assert.equal(evalJS('activeTab'),'research');
 assert.equal(ui.get('panel-research').hidden,false);
 assert.equal(ui.get('panel-wallet').hidden,true);
 assert.equal(ui.get('panel-runs').hidden,true);
 assert.equal(ui.get('panel-outcomes').hidden,true);
 assert.match(html,/id="panel-research"[\s\S]*?id="routeReviews"/);
});
test('Tabs switch without rebuilding token table or changing sort/order and persist across refresh',async()=>{
 const first=await setup();
 first.evalJS("moveAssetColumn('symbol','chain',false)");
 const htmlBefore=first.assets.innerHTML;
 assert.equal(first.evalJS("activateTab('wallet')"),true);
 assert.equal(first.ui.get('panel-research').hidden,true);
 assert.equal(first.ui.get('panel-wallet').hidden,false);
 assert.equal(first.assets.innerHTML,htmlBefore);
 assert.equal(first.evalJS("activateTab('runs')"),true);
 assert.equal(first.ui.get('panel-runs').hidden,false);
 assert.equal(first.evalJS("activateTab('outcomes')"),true);
 const reload=await setup(first.storage);
 assert.equal(reload.evalJS('activeTab'),'outcomes');
 assert.equal(reload.ui.get('panel-outcomes').hidden,false);
 assert.equal(reload.ui.get('panel-runs').hidden,true);
 assert.ok(reload.assets.innerHTML.indexOf('data-col="symbol"')<reload.assets.innerHTML.indexOf('data-col="chain"'));
 assert.equal(reload.storage.has('loginToken'),false);
});
test('Tabs support tap/click and arrow-key keyboard navigation',async()=>{
 const page=await tableSandbox();
 page.ui.get('tab-wallet').listeners.click();
 assert.equal(page.evalJS('activeTab'),'wallet');
 let prevented=false;
 page.ui.get('tab-wallet').listeners.keydown({key:'ArrowRight',preventDefault(){prevented=true}});
 assert.equal(prevented,true);
 assert.equal(page.evalJS('activeTab'),'runs');
 assert.equal(page.ui.get('tab-runs').focused,true);
 assert.equal(page.ui.get('tab-runs').attributes['aria-selected'],'true');
 assert.equal(page.ui.get('tab-wallet').attributes['aria-selected'],'false');
 page.ui.get('tab-runs').listeners.keydown({key:'Home',preventDefault(){}});
 assert.equal(page.evalJS('activeTab'),'research');
 assert.equal(page.evalJS("activateTab('injected')"),false);
 assert.equal(page.evalJS('activeTab'),'research');
});

test('Socials column renders safe, clickable project-supplied HTTPS links',async()=>{
 const ui=await tableSandbox();
 const row={...example[0],socials_json:JSON.stringify([
   {label:'X',url:'https://x.com/project'},
   {label:'TG',url:'https://t.me/project'},
   {label:'Web',url:'https://project.example/'},
   {label:'BAD',url:'javascript:alert(1)'},
   {label:'<img src=x onerror=alert(1)>',url:'https://safe.example'}])};
 ui.evalJS('setAssetData('+JSON.stringify([row])+')');
 assert.match(ui.assets.innerHTML,/data-col="socials"/);
 assert.match(ui.assets.innerHTML,/href="https:\/\/x.com\/project"/);
 assert.match(ui.assets.innerHTML,/href="https:\/\/t.me\/project"/);
 assert.match(ui.assets.innerHTML,/href="https:\/\/project.example\/"/);
 assert.match(ui.assets.innerHTML,/rel="noopener noreferrer nofollow"/);
 assert.doesNotMatch(ui.assets.innerHTML,/href="javascript:/);
 assert.doesNotMatch(ui.assets.innerHTML,/<img src=x/);
 assert.match(ui.assets.innerHTML,/&lt;img src=x/);
});
test('New socials/safety/signal/direction columns merge into existing saved drag layout',async()=>{
 const storage=new Map([['buyguy.assetColumns.v1',JSON.stringify(['symbol','chain','score'])]]);
 const ui=await setup(storage);
 assert.ok(ui.assets.innerHTML.indexOf('data-col="socials"')>ui.assets.innerHTML.indexOf('data-col="symbol"'));
 assert.ok(ui.assets.innerHTML.includes('data-col="safety"'));
 assert.ok(ui.assets.innerHTML.includes('data-col="momentum"'));
 assert.ok(ui.assets.innerHTML.includes('data-col="direction"'));
 ui.evalJS("moveAssetColumn('direction','symbol',false)");
 assert.ok(ui.assets.innerHTML.indexOf('data-col="direction"')<ui.assets.innerHTML.indexOf('data-col="symbol"'));
});
test('Unverified token is black unknown, even with high liquidity and chart score',async()=>{
 const ui=await tableSandbox();
 const sample={...example[0],score:99,liquidity:200000,risk_status:'UNVERIFIED',
    last_seen:new Date().toISOString(),change_h1:30};
 const result=ui.evalJS('safetyAssessment('+JSON.stringify(sample)+')');
 assert.equal(result.icon,'⚫');
 assert.equal(result.score,null);
});
test('Reviewed but incomplete onchain research is yellow and scored from evidence',async()=>{
 const ui=await tableSandbox();
 const sample={...example[0],risk_status:'PARTIAL_ONCHAIN_REVIEW',liquidity:75000,
  last_seen:new Date().toISOString(),risk_note:JSON.stringify({holderStatus:'TOKEN_ACCOUNT_BALANCES_SCREENED'})};
 const result=ui.evalJS('safetyAssessment('+JSON.stringify(sample)+')');
 assert.equal(result.icon,'🟡');
 assert.equal(result.score,85); // 35 mint + 20 concentration + 15 liquidity + 15 freshness
 assert.match(result.detail,/two-way quote 0\/15/);
});
test('Active mint controls and concentration risk show red, not a passing green',async()=>{
 const ui=await tableSandbox();
 const sample={...example[0],risk_status:'MINT_CONTROL_RISK',liquidity:100000,
  risk_note:JSON.stringify({mintFlags:['MINT_AUTHORITY_ACTIVE']}),last_seen:new Date().toISOString()};
 const result=ui.evalJS('safetyAssessment('+JSON.stringify(sample)+')');
 assert.equal(result.icon,'🔴');
 assert.ok(result.score<=25);
});
test('Direction tracks last one-hour change across full five-point 180-degree arc',async()=>{
 const ui=await tableSandbox(),last_seen=new Date().toISOString();
 const cases=[[30,'⬆️'],[6,'↗️'],[0,'➡️'],[-6,'↘️'],[-30,'⬇️']];
 for(const [change,icon] of cases){
  const d=ui.evalJS('directionAssessment('+JSON.stringify({last_seen,change_h1:change})+')');
  assert.equal(d.icon,icon);
  assert.equal(d.value,change);
 }
 assert.equal(ui.evalJS("directionAssessment({last_seen:'2020-01-01T00:00:00Z',change_h1:50})").icon,'⚫');
});
test('Momentums distinguish acceleration, increasing, declining, quiet, inactive',async()=>{
 const ui=await tableSandbox(),last_seen=new Date().toISOString();
 const sample={score:90,status:'ALIVE',liquidity:75000,last_seen,buys_m5:50,sells_m5:10,change_h1:20};
 const expected=[[sample,'🚀'],[{...sample,score:50,change_h1:7},'📈'],
   [{...sample,change_h1:-5},'📉'],[{...sample,change_h1:0},'🥱'],
   [{...sample,status:'DEAD'},'☠️']];
 for(const [a,icon] of expected)assert.equal(ui.evalJS('signalAssessment('+JSON.stringify(a)+')').icon,icon);
});

test('Legend and column instructions appear below research table and quote checks, not above them',async()=>{
 const {html}=await tableSandbox();
 const panel=html.slice(html.indexOf('id="panel-research"'),html.indexOf('id="panel-wallet"'));
 const heading=panel.indexOf('<h2>Token research</h2>');
 const table=panel.indexOf('id="assets"');
 const quotes=panel.indexOf('id="routeReviews"');
 const guide=panel.indexOf('Guide &amp; indicators');
 const legend=panel.indexOf('Safety: 🟢');
 const gestures=panel.indexOf('Tap a heading to sort');
 assert.ok(heading>=0&&table>heading,'Token Research must open directly with the table');
 assert.ok(quotes>table,'Quote results follow research table');
 assert.ok(guide>quotes&&legend>quotes&&gestures>quotes,'Guide belongs at the end');
 assert.equal(panel.match(/Tap a heading to sort/g)?.length,1,'Instructions must appear exactly once');
 assert.equal(panel.match(/Safety: 🟢/g)?.length,1,'Legend must appear exactly once');
});

test('BuyGuy GOGET terminal theme, compact tabs and permanent last address column',async()=>{
 const {html,evalJS,assets,ui}=await setup();
 assert.match(html,/the\s+BUYGUY GOGET/);
 assert.match(html,/font-family:ui-monospace/);
 assert.match(html,/id="tab-address"/);
 assert.match(html,/id="watchForm"/);
 assert.equal(evalJS('assetOrder[assetOrder.length-1]'),'address');
 assert.ok(assets.innerHTML.indexOf('data-col="address"')>assets.innerHTML.indexOf('data-col="provider"'));
 assert.equal(evalJS("moveAssetColumn('address','symbol',false)"),false);
 assert.equal(evalJS("moveAssetColumn('symbol','address',false)"),false);
 evalJS("sortAssets('liquidity')");
 assert.equal(evalJS('assetOrder[assetOrder.length-1]'),'address');
 assert.match(assets.innerHTML,/class="ticker"/);
 });
test('Watch Address tab remains accessible after saved navigation preference',async()=>{
 const ui=await tableSandbox();
 assert.equal(ui.evalJS("activateTab('address')"),true);
 assert.equal(ui.ui.get('panel-address').hidden,false);
 assert.equal(ui.ui.get('panel-wallet').hidden,true);
 const saved=await tableSandbox(ui.storage);
 assert.equal(saved.evalJS('activeTab'),'address');
});

test('A status label or big numerical safety score alone cannot trigger green lamp',async()=>{
 const page=await tableSandbox();
 const sample={chain:'solana',asset_key:'solana:demo',symbol:'DEMO',
   risk_status:'FULL_REVIEW_PASSED',liquidity:100000,
   risk_note:JSON.stringify({holderStatus:'TOKEN_ACCOUNT_BALANCES_SCREENED'}),
   last_seen:new Date().toISOString()};
 const badge=page.evalJS('safetyAssessment('+JSON.stringify(sample)+')');
 assert.equal(badge.icon,'🟡');
 assert.equal(badge.score,85); // even a high numerical score cannot self-certify as green
});
test('Tap-to-inspect green checklist is a compact button, with unknowns visible',async()=>{
 const page=await tableSandbox();
 const sample={...example[0],asset_key:'solana:test-mint',risk_status:'PARTIAL_ONCHAIN_REVIEW',
   green:{version:'GREEN_V1',green:false,passed:3,total:7,status:'PARTIAL',
     checks:[{name:'Pool custody / LP lock',passed:false,reason:'On-chain proof pending'}],
     warning:'Research only'}};
 page.evalJS('setAssetData('+JSON.stringify([sample])+')');
 assert.match(page.assets.innerHTML,/data-green-key="solana:test-mint"/);
 assert.match(page.assets.innerHTML,/3\/7 CHECKS/);
 assert.match(page.html,/id="greenDialog"/);
});
