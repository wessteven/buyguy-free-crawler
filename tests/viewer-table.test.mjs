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
        querySelectorAll(){return []},querySelector(){return null},scrollLeft:0,contains(){return false},
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
test('Liquidity-to-market-cap ratio is numeric, sortable, formatted, and absent for invalid caps',async()=>{
 const page=await tableSandbox();
 const mint='So11111111111111111111111111111111111111112';
 const rows=[
  {...example[0],asset_key:'solana:'+mint,address:mint,symbol:'THIN',liquidity:10000,market_cap:100000},
  {...example[0],asset_key:'solana:ESnW5ZbLmoEAg2QEMxnMsY9R3aS8Kw58HJacYURmpump',
   address:'ESnW5ZbLmoEAg2QEMxnMsY9R3aS8Kw58HJacYURmpump',symbol:'DEEP',liquidity:75000,market_cap:100000},
  {...example[0],asset_key:'solana:9A1VFXY8ETKNSP2jN3rnTF99jDTnbR8j3JqVHas4pump',
   address:'9A1VFXY8ETKNSP2jN3rnTF99jDTnbR8j3JqVHas4pump',symbol:'NO_CAP',liquidity:90000,market_cap:0}
 ];
 page.evalJS('setAssetData('+JSON.stringify(rows)+')');
 const order=page.evalJS('assetOrder.join(",")').split(',');
 assert.equal(order[order.indexOf('market_cap')+1],'liq_cap_pct');
 assert.match(page.assets.innerHTML,/Liq\/Cap %/);
 assert.match(page.assets.innerHTML,/10\.0%/);
 assert.match(page.assets.innerHTML,/75\.0%/);
 assert.equal(page.evalJS('liquidityCapPercentage(40000,80000)'),50);
 assert.equal(page.evalJS('liquidityCapPercentage(0,80000)'),0);
 assert.equal(page.evalJS('liquidityCapPercentage(null,80000)'),null);
 assert.equal(page.evalJS('liquidityCapPercentage(20000,0)'),null);
 assert.equal(page.evalJS('liquidityCapPercentage(20000,null)'),null);
 assert.equal(page.evalJS('liquidityCapPercentage(-1,80000)'),null);
 assert.equal(page.evalJS('formatLiqCapPct(null)'),'—');
 assert.equal(page.evalJS('formatLiqCapPct(0.0625)'),'0.063%');
 page.evalJS("sortAssets('liq_cap_pct')");
 const desc=page.assets.innerHTML;
 assert.ok(desc.indexOf('DEEP')<desc.indexOf('THIN'));
 assert.ok(desc.indexOf('THIN')<desc.indexOf('NO_CAP'));
 page.evalJS("sortAssets('liq_cap_pct')");
 const asc=page.assets.innerHTML;
 assert.ok(asc.indexOf('THIN')<asc.indexOf('DEEP'));
 assert.ok(asc.indexOf('DEEP')<asc.indexOf('NO_CAP'));
 assert.match(page.ui.get('hotAssets').innerHTML,/Liq\/Cap %/);
 assert.match(page.ui.get('notAssets').innerHTML,/Liq\/Cap %/);
});
test('Liq/Cap shows lock icon only when current matched-pool LP custody gate passes',async()=>{
 const page=await tableSandbox();
 const base={...example[0],chain:'solana',market_cap:100000,liquidity:75000,
   asset_key:'solana:So11111111111111111111111111111111111111112',
   address:'So11111111111111111111111111111111111111112',tier:'HOT'};
 const verified={...base,symbol:'LOCKED',green:{status:'PARTIAL',
   checks:[{name:'Pool custody / LP lock',passed:true}]}};
 const without={...base,symbol:'UNVERIFIED',green:{status:'PARTIAL',
   checks:[{name:'Pool custody / LP lock',passed:false}]}};
 const absent={...base,symbol:'NO_AUDIT',green:{checks:[]}};
 const misleading={...base,symbol:'OTHER_CHECK',green:{green:true,passed:6,
   checks:[{name:'Current pool liquidity',passed:true}]}};
 for(const [row,icon] of [[verified,true],[without,false],[absent,false],[misleading,false]]){
   page.evalJS('setAssetData('+JSON.stringify([row])+')');
   assert.equal(page.evalJS('verifiedPoolLock(assetRows[0])'),icon);
   const cells=page.assets.innerHTML;
   assert.match(cells,/75\.0%/);
   assert.equal(cells.includes('lp-lock-verified'),icon);
   assert.equal(cells.includes('🔒'),icon);
   assert.equal(page.ui.get('hotAssets').innerHTML.includes('lp-lock-verified'),icon);
 }
 const unknownCap={...verified,market_cap:0,symbol:'LOCKED_NO_RATIO'};
 page.evalJS('setAssetData('+JSON.stringify([unknownCap])+')');
 assert.doesNotMatch(page.assets.innerHTML,/lp-lock-verified/);
 assert.equal(page.evalJS('formatLiqCapPct(assetRows[0].liq_cap_pct)'),'—');
 // Numerical sorting is still based on raw percentage, not the icon HTML.
 const lower={...base,symbol:'LOWER',liquidity:10000,green:{checks:[]}};
 page.evalJS('setAssetData('+JSON.stringify([lower,verified])+')');
 page.evalJS("sortAssets('liq_cap_pct')");
 const html=page.assets.innerHTML;
 assert.ok(html.indexOf('LOCKED')<html.indexOf('LOWER'));
});
test('Market Score and Safety Evidence are distinct columns with unchanged stable keys',async()=>{
 const page=await tableSandbox();
 assert.match(page.html,/Market Score/);
 assert.match(page.html,/Safety Evidence/);
 assert.match(page.html,/seven-check safety screen/);
 const order=page.evalJS('assetOrder.join(",")').split(',');
 assert.ok(order.includes('score'));
 assert.ok(order.includes('safety'));
 assert.equal(page.evalJS("columnByKey.score.name"),'Market Score');
 assert.equal(page.evalJS("columnByKey.safety.name"),'Safety Evidence');
 const oldLayout=await tableSandbox(new Map([['buyguy.assetColumns.v2',
   JSON.stringify(['symbol','market_cap','buys_m5','score','safety'])]]));
 const saved=oldLayout.evalJS('assetOrder.join(",")').split(',');
 assert.equal(saved[saved.indexOf('market_cap')+1],'liq_cap_pct');
 assert.equal(saved[saved.indexOf('liq_cap_pct')+1],'buys_m5');
 assert.ok(saved.indexOf('score')<saved.indexOf('safety'));
});
test('OUR SCORE normalizes nine market and safety factors with transparent weights',async()=>{
 const ui=await tableSandbox();
 const mint='So11111111111111111111111111111111111111112';
 const base={...example[0],asset_key:'solana:'+mint,address:mint,
  symbol:'PROMISING',status:'ALIVE',liquidity:70000,market_cap:110000,
  price:0.00012,buys_m5:28,sells_m5:9,change_h1:9,score:78,
  quote_age:7,risk_status:'PARTIAL_ONCHAIN_REVIEW',
  last_seen:new Date(Date.now()-7*60000).toISOString()};
 const strong=ui.evalJS('assetRow('+JSON.stringify(base)+')');
 // vm context objects are cross-realm; assert scalar results rather than deep equal.
 assert.equal(strong.ourScoreInfo.factors.length,9);
 assert.equal(strong.ourScoreInfo.factors.reduce((a,f)=>a+f.weight,0),100);
 assert.ok(strong.our_score>40&&strong.our_score<=100);
 assert.ok(strong.ourScoreInfo.factors.every(f=>f.rating>=0&&f.rating<=100));
 assert.ok(strong.ourScoreInfo.factors.every(f=>f.points>=0&&f.points<=f.weight));
 const huge=ui.evalJS('assetRow('+JSON.stringify({...base,symbol:'PARABOLIC',change_h1:761})+')');
 assert.ok(huge.our_score<=60,'Do not reward chasing 761% candles');
 const thin=ui.evalJS('assetRow('+JSON.stringify({...base,liquidity:9000})+')');
 assert.ok(thin.our_score<=40,'Thin liquidity limits final score');
 const risky=ui.evalJS('assetRow('+JSON.stringify({...base,risk_status:'MINT_CONTROL_RISK'})+')');
 assert.ok(risky.our_score<=15,'Critical contract risk overrides momentum');
 const stale=ui.evalJS('assetRow('+JSON.stringify({...base,quote_age:181})+')');
 assert.ok(stale.our_score<=35,'Stale quote must not lead');
 const missing=ui.evalJS('assetRow('+JSON.stringify({...base,market_cap:0})+')');
 assert.equal(missing.our_score,null,'Missing cap is unranked rather than 0%');
 const dead=ui.evalJS('assetRow('+JSON.stringify({...base,status:'DEAD'})+')');
 assert.equal(dead.our_score,null,'Archive cases cannot lead live rankings');
});
test('OUR SCORE column sorts descending, opens breakdown, and preserves saved layouts',async()=>{
 const ui=await tableSandbox();
 const mint='So11111111111111111111111111111111111111112';
 const now=new Date(Date.now()-6*60000).toISOString();
 const baseline={...example[0],asset_key:'solana:'+mint,address:mint,chain:'solana',
   status:'ALIVE',market_cap:120000,price:0.0001,quote_age:6,last_seen:now,
   score:85,risk_status:'PARTIAL_ONCHAIN_REVIEW',change_h1:8};
 const high={...baseline,symbol:'HIGH',liquidity:90000,buys_m5:40,sells_m5:9};
 const low={...baseline,asset_key:'robinhood:0x2cc0fac44b8252f6b10208b091aff2c94b4da77d',
   address:'0x2cc0fac44b8252f6b10208b091aff2c94b4da77d',
   chain:'robinhood',symbol:'LOW',liquidity:12000,buys_m5:3,sells_m5:29,change_h1:-25};
 ui.evalJS('setAssetData('+JSON.stringify([low,high])+')');
 const order=ui.evalJS('assetOrder.join(",")').split(',');
 assert.equal(order[order.indexOf('audit')+1],'our_score');
 assert.match(ui.assets.innerHTML,/OUR SCORE/);
 assert.match(ui.assets.innerHTML,/our-score-btn/);
 ui.evalJS("sortAssets('our_score')");
 assert.ok(ui.assets.innerHTML.indexOf('HIGH')<ui.assets.innerHTML.indexOf('LOW'));
 ui.evalJS("sortAssets('our_score')");
 assert.ok(ui.assets.innerHTML.indexOf('LOW')<ui.assets.innerHTML.indexOf('HIGH'));
 assert.match(ui.ui.get('hotAssets').innerHTML,/OUR SCORE/);
 assert.match(ui.ui.get('notAssets').innerHTML,/OUR SCORE/);
 const saved=await tableSandbox(new Map([['buyguy.assetColumns.v2',
   JSON.stringify(['market_cap','symbol','score','safety'])]]));
 const migrate=saved.evalJS('assetOrder.join(",")').split(',');
 assert.equal(migrate[migrate.indexOf('audit')+1],'our_score');
 assert.equal(saved.evalJS('columnByKey.our_score.type'),'number');
 assert.match(saved.html,/id="ourScoreDialog"/);
 assert.match(saved.html,/id="ourScoreClose"/);
});
test('Rank OUR SCORE shortcut sorts high-to-low and is visible above the token grid',async()=>{
 const page=await tableSandbox();
 assert.match(page.html,/id="sortOurScore"[^>]*>Rank OUR SCORE/);
 const base={...example[0],status:'ALIVE',market_cap:120000,price:0.001,
   score:75,quote_age:7,change_h1:10,risk_status:'PARTIAL_ONCHAIN_REVIEW'};
 const rich={...base,symbol:'STRONG',liquidity:90000,buys_m5:29,sells_m5:8};
 const weak={...base,symbol:'WEAK',liquidity:18000,buys_m5:5,sells_m5:32};
 page.evalJS('setAssetData('+JSON.stringify([weak,rich])+')');
 page.ui.get('sortOurScore').onclick();
 assert.equal(page.evalJS('assetSort.key'),'our_score');
 assert.equal(page.evalJS('assetSort.direction'),'desc');
 assert.ok(page.assets.innerHTML.indexOf('STRONG')<page.assets.innerHTML.indexOf('WEAK'));
 assert.equal(JSON.parse(page.storage.get('buyguy.assetSort.v1')).key,'our_score');
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
  assert.ok(again.assets.innerHTML.indexOf('data-col="symbol"')<again.assets.innerHTML.indexOf('data-col="chain"'));
  assert.ok(again.assets.innerHTML.indexOf('data-col="address"')<again.assets.innerHTML.indexOf('data-col="socials"'));
  assert.ok(again.assets.innerHTML.indexOf('data-col="socials"')<again.assets.innerHTML.indexOf('data-col="flags"'));
});
test('Malicious saved layout and token symbol are sanitized',async()=>{
  const storage=new Map([['buyguy.assetColumns.v2',JSON.stringify(['symbol','unknown','symbol','chain'])]]);
  const ui=await tableSandbox(storage);
  ui.evalJS("setAssetData("+JSON.stringify([{...example[0],symbol:'<img src=x onerror=alert(1)>'}])+")");
  assert.ok(ui.assets.innerHTML.indexOf('data-col="symbol"')<ui.assets.innerHTML.indexOf('data-col="chain"'));
  assert.doesNotMatch(ui.assets.innerHTML,/<img src=x/);
  assert.match(ui.assets.innerHTML,/&lt;img src=x/);
});

test('Navigation order is TOKEN DATA, HOT, NOT, wallet, recent runs, outcomes, address',async()=>{
 const {html,evalJS,ui}=await tableSandbox();
 const names=['tab-research','tab-hot','tab-not','tab-archive','tab-wallet','tab-runs','tab-outcomes','tab-address'];
 for(let i=1;i<names.length;i++)assert.ok(html.indexOf('id="'+names[i-1]+'"')<html.indexOf('id="'+names[i]+'"'));
 assert.equal(evalJS('activeTab'),'research');
 assert.equal(ui.get('panel-research').hidden,false);
 assert.equal(ui.get('panel-wallet').hidden,true);
 assert.equal(ui.get('panel-runs').hidden,true);
 assert.equal(ui.get('panel-outcomes').hidden,true);
 assert.match(html,/id="panel-research"[\s\S]*?id="routeReviews"/);
});
test('Archive keeps learning-rich cases visible and hides low-signal history behind a collapsed section',async()=>{
 const page=await tableSandbox();
 assert.match(page.html,/id="panel-archive"/);
 assert.equal(page.evalJS("activateTab('archive')"),true);
 assert.equal(page.ui.get('panel-archive').hidden,false);
 const learned={...example[0],asset_key:'solana:ESnW5ZbLmoEAg2QEMxnMsY9R3aS8Kw58HJacYURmpump',
   address:'ESnW5ZbLmoEAg2QEMxnMsY9R3aS8Kw58HJacYURmpump',
   symbol:'LEARNING',status:'DEAD',peak_score:82,observations:15,score:2,
   last_action:'ARCHIVED: sustained weak buy interest',prediction_count:2,
   research_count:0,paper_count:0};
 const quiet={...example[0],asset_key:'solana:9A1VFXY8ETKNSP2jN3rnTF99jDTnbR8j3JqVHas4pump',
   address:'9A1VFXY8ETKNSP2jN3rnTF99jDTnbR8j3JqVHas4pump',
   symbol:'QUIET',status:'DEAD',peak_score:15,observations:2,
   last_action:'ARCHIVED: no fresh market observations',prediction_count:0,
   research_count:0,paper_count:0};
 page.evalJS('renderArchive('+JSON.stringify([learned,quiet])+',{"dead":2,"trash":7})');
 assert.match(page.ui.get('archiveAssets').innerHTML,/LEARNING/);
 assert.match(page.ui.get('archiveAssets').innerHTML,/Prediction outcome/);
 assert.doesNotMatch(page.ui.get('archiveAssets').innerHTML,/QUIET/);
 assert.match(page.ui.get('archiveQuietWrap').innerHTML,/<details>/);
 assert.match(page.ui.get('archiveQuietWrap').innerHTML,/QUIET/);
 assert.match(page.ui.get('trashSummary').textContent,/TRASH: 7/);
 assert.equal(page.ui.get('archiveCount').textContent,'(2)');
 page.evalJS('setAssetData('+JSON.stringify([{...example[0],symbol:'ACTIVE'}])+')');
 assert.match(page.assets.innerHTML,/ACTIVE/);
 assert.doesNotMatch(page.assets.innerHTML,/LEARNING/);
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
 const storage=new Map([['buyguy.assetColumns.v2',JSON.stringify(['symbol','chain','score'])]]);
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

test('Buyer-first default layout puts price and market before safety, then copy address, socials and flags',async()=>{
 const {html,evalJS,assets}=await setup();
 assert.match(html,/the\s+BUYGUY GOGET/);
 assert.match(html,/font-family:ui-monospace/);
 assert.match(html,/id="tab-address"/);
 assert.match(html,/id="watchForm"/);
 const order=evalJS("assetOrder.join(',')").split(',');
 for(const [a,b] of [['symbol','audit'],['audit','price'],['price','liquidity'],
   ['liquidity','safety'],['safety','address'],['address','socials'],
   ['socials','flags']]){
   assert.ok(order.indexOf(a)<order.indexOf(b),a+' must precede '+b);
 }
 assert.equal(order.at(-1),'flags');
 assert.equal(evalJS("moveAssetColumn('address','symbol',false)"),true);
 assert.equal(evalJS("moveAssetColumn('socials','flags',true)"),true);
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

test('HOT and NOT tabs use the same columns, preserve master tokens and sorting',async()=>{
 const page=await tableSandbox();
 const hot={...example[0],asset_key:'solana:hot',tier:'HOT',quote_age:5};
 const not={...example[1],asset_key:'robinhood:not',tier:'NOT',quote_age:230,status:'DEAD'};
 page.evalJS('setAssetData('+JSON.stringify([hot,not])+')');
 assert.match(page.ui.get('hotAssets').innerHTML,/B_DOG/);
 assert.doesNotMatch(page.ui.get('hotAssets').innerHTML,/A_CAT/);
 assert.match(page.ui.get('notAssets').innerHTML,/A_CAT/);
 assert.doesNotMatch(page.ui.get('notAssets').innerHTML,/B_DOG/);
 assert.match(page.assets.innerHTML,/B_DOG/);
 assert.match(page.assets.innerHTML,/A_CAT/);
 const original=page.evalJS('assetOrder.join(",")');
 page.evalJS("sortAssets('score')");
 assert.equal(page.evalJS('assetOrder.join(",")'),original);
 assert.match(page.ui.get('hotAssets').innerHTML,/data-col="address"/);
 assert.match(page.ui.get('notAssets').innerHTML,/data-col="address"/);
 assert.equal(page.evalJS("activateTab('hot')"),true);
 assert.equal(page.ui.get('panel-hot').hidden,false);
 assert.equal(page.evalJS("activateTab('not')"),true);
 assert.equal(page.ui.get('panel-not').hidden,false);
});

test('AUDIT action is reachable beside the token in TOKEN DATA, HOT and NOT; address stays last',async()=>{
 const page=await tableSandbox();
 const sample={...example[0],asset_key:'solana:So11111111111111111111111111111111111111112',
  address:'So11111111111111111111111111111111111111112',tier:'HOT'};
 page.evalJS('setAssetData('+JSON.stringify([sample])+')');
 const order=page.evalJS('assetOrder.join(",")').split(',');
 assert.equal(order[order.indexOf('symbol')+1],'audit');
 assert.equal(order.at(-1),'flags');
 assert.match(page.assets.innerHTML,/data-audit-key="solana:So11111111111111111111111111111111111111112"/);
 assert.match(page.ui.get('hotAssets').innerHTML,/class="audit-btn"/);
 assert.match(page.html,/id="auditDialog"/);
 const saved=await tableSandbox(new Map([['buyguy.assetColumns.v2',JSON.stringify(['symbol','chain','score'])]]));
 assert.equal(saved.evalJS("assetOrder.indexOf('audit')"),saved.evalJS("assetOrder.indexOf('symbol')")+1);
});

test('Long social and mint-flag columns are collapsed by default and reveal full details when toggled',async()=>{
 const page=await tableSandbox();
 const row={...example[0],
   risk_note:JSON.stringify({mintFlags:['TOKEN_2022_EXTENSIONS_UNREVIEWED'],
     holderFlags:['TOP_FIVE_ACCOUNTS_OVER_85_PERCENT']}),
   socials_json:JSON.stringify([
     {label:'X',url:'https://x.com/project'},
     {label:'Web',url:'https://example.com'},
     {label:'TG',url:'https://t.me/project'}])};
 page.evalJS('setAssetData('+JSON.stringify([row])+')');
 assert.match(page.assets.innerHTML,/data-fold-col="socials"/);
 assert.match(page.assets.innerHTML,/data-fold-col="flags"/);
 assert.match(page.assets.innerHTML,/class="flags-short"/);
 assert.match(page.assets.innerHTML,/class="social-link social-extra"/);
 assert.equal(page.evalJS("toggleColumnFold('flags')"),true);
 assert.equal(page.evalJS("toggleColumnFold('socials')"),true);
 assert.match(page.assets.innerHTML,/class="flags-full"/);
 assert.match(page.assets.innerHTML,/class="social-cell expanded"/);
 const reload=await tableSandbox(page.storage);
 assert.equal(reload.evalJS('columnFolded.flags'),false);
 assert.equal(reload.evalJS('columnFolded.socials'),false);
});
test('Socials and long mint-flag headings can move by explicit controls even on touch devices',async()=>{
 const page=await tableSandbox();
 const before=page.evalJS("assetOrder.indexOf('flags')");
 assert.equal(page.evalJS("moveColumnByStep('flags',-1)"),true);
 assert.equal(page.evalJS("assetOrder.indexOf('flags')"),before-1);
 assert.equal(page.evalJS("moveColumnToEnd('socials')"),true);
 assert.equal(page.evalJS("assetOrder.at(-1)"),'socials');
 assert.match(page.html,/data-fold-col/); // dynamically generated on render
 assert.match(page.html,/max-height:70dvh/);
 assert.match(page.html,/position:sticky!important/);
});

test('Mobile page clips outer overflow while each supporting data table scrolls within its own width',async()=>{
 const ui=await tableSandbox();
 assert.match(ui.html,/html\{width:100%;max-width:100%;overflow-x:clip\}/);
 assert.match(ui.html,/#board,#overview,\.tab-panel/);
 assert.match(ui.html,/\.data-scroll\{display:block;width:100%;max-width:100%;min-width:0;overflow-x:auto/);
 assert.match(ui.html,/\.data-scroll th,\.data-scroll td\{white-space:normal!important/);
 const big='solana:So11111111111111111111111111111111111111112';
 const rendered=ui.evalJS("table(['Mint','Result'],[["+JSON.stringify(big)+",'BOTH_DIRECTIONS_QUOTED']])");
 assert.match(rendered,/^<div class="data-scroll" role="region"/);
 assert.match(rendered,/tabindex="0"/);
 assert.match(rendered,/solana:So11111111111111111111111111111111111111112/);
 assert.match(rendered,/<\/table><\/div>$/);
 // Sticky mobile research table must still scroll independently.
 assert.match(ui.html,/#assets,\.asset-view\{height:min\(70dvh,750px\)!important/);
});

test('Trade on follows Copy address in all views and opens a chain-specific Moby token page',async()=>{
 const page=await tableSandbox();
 const sol='So11111111111111111111111111111111111111112';
 const rh='0x2cc0fac44b8252f6b10208b091aff2c94b4da77d';
 const rows=[
  {...example[0],asset_key:'solana:'+sol,address:sol,tier:'HOT'},
  {...example[1],asset_key:'robinhood:'+rh,address:rh,tier:'NOT'}
 ];
 page.evalJS('setAssetData('+JSON.stringify(rows)+')');
 const order=page.evalJS('assetOrder.join(",")').split(',');
 assert.equal(order[order.indexOf('address')+1],'trade_on');
 assert.match(page.assets.innerHTML,/href="https:\/\/mobyscreener\.com\/solana\/So11111111111111111111111111111111111111112"/);
 assert.match(page.assets.innerHTML,/href="https:\/\/www\.mobyscreener\.com\/token\/0x2cc0fac44b8252f6b10208b091aff2c94b4da77d"/);
 assert.match(page.ui.get('hotAssets').innerHTML,/Moby web ↗/);
 assert.match(page.ui.get('notAssets').innerHTML,/Moby web ↗/);
 assert.match(page.assets.innerHTML,/target="_self" rel="nofollow"/);
 assert.equal(page.evalJS("mobyChartUrl('solana','<script>alert(1)</script>')"),null);
 assert.equal(page.evalJS("mobyChartUrl('robinhood','0xNOTANADDRESS')"),null);
 const saved=await tableSandbox(new Map([['buyguy.assetColumns.v2',JSON.stringify(['chain','address','symbol'])]]));
 assert.equal(saved.evalJS("assetOrder.indexOf('trade_on')"),saved.evalJS("assetOrder.indexOf('address')")+1);
});
test('Chart follows Trade on and opens the exact Solana or Robinhood token on DEX Screener',async()=>{
 const page=await tableSandbox();
 const sol='ESnW5ZbLmoEAg2QEMxnMsY9R3aS8Kw58HJacYURmpump';
 const rh='0x2cc0fac44b8252f6b10208b091aff2c94b4da77d';
 const rows=[
  {...example[0],asset_key:'solana:'+sol,address:sol,symbol:'COLLECTOOOR',tier:'HOT'},
  {...example[1],asset_key:'robinhood:'+rh,address:rh,symbol:'INJOH',tier:'NOT'}
 ];
 page.evalJS('setAssetData('+JSON.stringify(rows)+')');
 const order=page.evalJS('assetOrder.join(",")').split(',');
 assert.equal(order[order.indexOf('trade_on')+1],'chart');
 assert.equal(page.evalJS("dexChartUrl('solana','"+sol+"')"),'https://dexscreener.com/solana/'+sol);
 assert.equal(page.evalJS("dexChartUrl('robinhood','"+rh+"')"),'https://dexscreener.com/robinhood/'+rh);
 assert.match(page.assets.innerHTML,/href="https:\/\/dexscreener\.com\/solana\/ESnW5ZbLmoEAg2QEMxnMsY9R3aS8Kw58HJacYURmpump"/);
 assert.match(page.assets.innerHTML,/href="https:\/\/dexscreener\.com\/robinhood\/0x2cc0fac44b8252f6b10208b091aff2c94b4da77d"/);
 assert.match(page.assets.innerHTML,/target="_blank" rel="noopener noreferrer nofollow"/);
 assert.match(page.ui.get('hotAssets').innerHTML,/View chart ↗/);
 assert.match(page.ui.get('notAssets').innerHTML,/View chart ↗/);
 assert.equal(page.evalJS("dexChartUrl('solana','<script>alert(1)</script>')"),null);
 assert.equal(page.evalJS("dexChartUrl('robinhood','0xWRONG')"),null);
 assert.equal(page.evalJS("dexChartUrl('unknown','"+sol+"')"),null);
});
test('Chart column is added alongside Trade on for saved layouts without rearranging other columns',async()=>{
 const key='buyguy.assetColumns.v2';
 const old=['symbol','chain','address','trade_on','socials','risk','flags'];
 const saved=await tableSandbox(new Map([[key,JSON.stringify(old)]]));
 const order=saved.evalJS('assetOrder.join(",")').split(',');
 assert.equal(order[order.indexOf('trade_on')+1],'chart');
 assert.ok(order.indexOf('socials')>order.indexOf('chart'));
 const muchOlder=await tableSandbox(new Map([[key,JSON.stringify(['symbol','address','socials'])]]));
 const migrated=muchOlder.evalJS('assetOrder.join(",")').split(',');
 assert.equal(migrated[migrated.indexOf('address')+1],'trade_on');
 assert.equal(migrated[migrated.indexOf('trade_on')+1],'chart');
});
test('Ten-minute scan timer shows countdown, overdue overtime and unknown runs without resets from wall clock',async()=>{
 const page=await tableSandbox();
 const epoch=Date.parse('2026-10-20T00:00:00.000Z');
 const evaluate=(iso,at)=>page.evalJS('scanCountdown('+JSON.stringify(iso)+','+at+')');
 const last='2026-10-20T00:00:00Z';
 assert.equal(evaluate(last,epoch).text,'NEXT 10:00');
 assert.equal(evaluate(last,epoch+5*60000).text,'NEXT 05:00');
 assert.equal(evaluate(last,epoch+600000).text,'NEXT 00:00');
 const late=evaluate(last,epoch+690000);
 assert.equal(late.text,'OVERDUE +01:30');
 assert.equal(late.overdue,true);
 assert.equal(evaluate(null,epoch).unknown,true);
 assert.equal(evaluate('bad timestamp',epoch).unknown,true);
 assert.equal(evaluate('2026-10-20T03:00:00Z',epoch).unknown,true);
 assert.match(page.html,/id="scanClock"/);
 assert.match(page.html,/\/api\/scan-clock/);
 assert.match(page.html,/setInterval\(pollScanClock,30000\)/);
});

test('Moby links never use app invites that can silently load the wrong token',async()=>{
 const page=await tableSandbox();
 const known=[
  'YE2mBZx8sL1bhfWpoR9dPAozmKhGE8eKa4sEEQ5pump',
  'ESnW5ZbLmoEAg2QEMxnMsY9R3aS8Kw58HJacYURmpump',
  '9A1VFXY8ETKNSP2jN3rnTF99jDTnbR8j3JqVHas4pump',
  '6NLUC3veg7NGuQBNewE1UM7G6ir2mymJM4PvwdkGpump'
 ];
 const urls=known.map(mint=>page.evalJS("mobyChartUrl('solana','"+mint+"')"));
 assert.equal(new Set(urls).size,known.length);
 for(let i=0;i<known.length;i++){
   assert.equal(urls[i],'https://mobyscreener.com/solana/'+known[i]);
   assert.equal(urls[i].includes('invite.mobyscreener.com'),false);
   assert.equal(urls[i].includes('twitter.mobyscreener.com'),false);
 }
 assert.equal(page.evalJS("mobyChartUrl('solana','invalid-address!')"),null);
 const rh='0x2cc0fac44b8252f6b10208b091aff2c94b4da77d';
 assert.equal(page.evalJS("mobyChartUrl('robinhood','"+rh+"')"),
  'https://www.mobyscreener.com/token/'+rh);
 const rows=known.map(address=>({...example[0],asset_key:'solana:'+address,address,tier:'HOT'}));
 page.evalJS('setAssetData('+JSON.stringify(rows)+')');
 const html=page.assets.innerHTML;
 assert.equal((html.match(/Moby web ↗/g)||[]).length,known.length);
 assert.equal((html.match(/Moby app ↗/g)||[]).length,0);
 assert.doesNotMatch(html,/invite\.mobyscreener\.com/);
 assert.doesNotMatch(html,/twitter\.mobyscreener\.com/);
 for(const mint of known)assert.ok(html.includes('href="https://mobyscreener.com/solana/'+mint+'"'));
});
