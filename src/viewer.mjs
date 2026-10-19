import {getPaperSnapshot} from './paper-ops.mjs';
import {scheduledResearch} from './scheduled-research.mjs';
const headers={'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'};
const json=(v,s=200)=>new Response(JSON.stringify(v),{status:s,headers});
const esc=s=>String(s??'—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const page=`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>BuyGuy Free Radar</title>
<style>body{background:#0a1610;color:#e6f9eb;font:14px system-ui;margin:auto;padding:24px;max-width:1000px}h1{color:#9cfdc6}input,button{padding:12px;background:#173426;border:1px solid #477b5b;border-radius:8px;color:#e8ffee}button{cursor:pointer}.hint{color:#a4baa9}section{margin:20px 0;overflow:auto}table{border-collapse:collapse;width:100%;font-size:13px}th,td{border-bottom:1px solid #31513b;padding:10px;text-align:left;white-space:nowrap}th{color:#8dc5a0}#assets{max-width:100%;overflow-x:auto;overscroll-behavior-x:contain}#assets table{min-width:max-content;width:100%}#assets th{position:sticky;top:0;z-index:2;background:#163423;cursor:grab;user-select:none;-webkit-user-select:none;touch-action:pan-y;min-width:68px}#assets th:focus-visible{outline:2px solid #9cfdc6}#assets th.drag-active{background:#286548;cursor:grabbing}#assets th.drop-target{box-shadow:inset 3px 0 #9cfdc6}#assets td{font-variant-numeric:tabular-nums}#assets .sort-indicator{display:inline-block;min-width:1em;color:#9cfdc6;margin-left:5px}#assets .social-cell{white-space:nowrap;min-width:85px}#assets .social-link{display:inline-block;color:#b9ffd0;background:#234b32;border:1px solid #3d8053;border-radius:6px;padding:5px 7px;margin:1px 3px 1px 0;text-decoration:none;font-weight:650}#assets .social-link:focus-visible{outline:2px solid #b9ffd0}#assets .social-link:hover{text-decoration:underline}#assets .safety-cell{font-weight:700;font-variant-numeric:tabular-nums}#assets .risk-note{display:block;font-size:10px;font-weight:400;color:#bdcbbc}#assets .signal-cell{font-size:19px;text-align:center}#assets .direction-cell{font-weight:700;text-align:center;font-variant-numeric:tabular-nums}#assets .dir-arrow{display:inline-block;font-size:18px;transition:transform .35s ease}.indicator-legend{font-size:12px;line-height:1.6;margin:6px 0 12px}.asset-toolbar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:8px}.asset-toolbar button{padding:8px 10px}.asset-toolbar .hint{font-size:12px}#board{display:none}.stat{display:inline-block;border:1px solid #416449;border-radius:10px;padding:15px;margin:4px;background:#112a19}.bg-tablist{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:5px;margin:16px 0 10px;position:sticky;top:0;z-index:5;background:#0a1610;padding:7px 0}.bg-tab{min-width:0;padding:12px 3px;font-size:clamp(10px,2.6vw,13px);font-weight:650;line-height:1.25;white-space:normal;background:#12271b;border:1px solid #416449;border-radius:9px;color:#b3d9bd;touch-action:manipulation}.bg-tab[aria-selected="true"]{background:#265b3e;color:#bfffd5;border-color:#8ddda8;box-shadow:inset 0 -3px #a1f3bb}.bg-tab:focus-visible{outline:2px solid #b7ffd2;outline-offset:2px}.tab-panel[hidden]{display:none!important}.tab-panel{min-height:160px}.tab-panel>section:first-child{margin-top:6px}@media(max-width:410px){body{padding:14px}.bg-tablist{gap:4px}.bg-tab{padding:11px 2px}} </style></head><body>
<h1>BUYGUY // FREE RADAR</h1><p class="hint">Read-only research • Robinhood + Solana • Indicative prices • Paper wallet experimental</p>
<div id="login"><input type="password" id="pass" placeholder="Dashboard secret" autocomplete="off"><button id="enter">Open</button><p id="msg"></p></div>
<div id="board"><button id="refresh">Refresh data</button><div id="overview"></div>
<nav class="bg-tablist" role="tablist" aria-label="BuyGuy dashboard sections">
<button class="bg-tab" id="tab-research" role="tab" type="button" data-tab="research" aria-controls="panel-research" aria-selected="true" tabindex="0">Token Research</button>
<button class="bg-tab" id="tab-wallet" role="tab" type="button" data-tab="wallet" aria-controls="panel-wallet" aria-selected="false" tabindex="-1">Wallet</button>
<button class="bg-tab" id="tab-runs" role="tab" type="button" data-tab="runs" aria-controls="panel-runs" aria-selected="false" tabindex="-1">Recent Runs</button>
<button class="bg-tab" id="tab-outcomes" role="tab" type="button" data-tab="outcomes" aria-controls="panel-outcomes" aria-selected="false" tabindex="-1">Outcomes</button>
</nav>
<div class="tab-panel" id="panel-research" role="tabpanel" aria-labelledby="tab-research">
<section><h2>Token research</h2><p class="hint indicator-legend">Safety: 🟢 fully screened · 🟡 partial evidence · 🔴 identified risk · ⚫ unknown. Score is 0–100 based on evidence, <strong>not a guarantee of safety</strong>. Signal: 🚀 acceleration · 📈 rising · 📉 falling · 🥱 quiet · ☠️ inactive. 180° direction: ⬆️ ↗️ ➡️ ↘️ ⬇️ tracks recorded 1-hour price change, not future direction.</p><p class="hint">Tap a heading to sort ↑ ↓. Drag headings to move columns (including on mobile); swipe the rows sideways to see more columns. Social links are project-supplied and unverified. Keyboard: Shift + ←/→ moves a selected heading.</p><div class="asset-toolbar"><button id="resetAssetColumns" type="button">Reset columns</button><span class="hint" id="assetOrderStatus" role="status" aria-live="polite"></span></div><div id="assets" aria-label="Sortable, rearrangeable token research table"></div></section>
<section><h2>Read-only $40 round-trip quotes</h2><p class="hint">Quote availability is NOT proof of an executable sale. No trade has been sent.</p><div id="routeReviews"></div></section>
</div>
<div class="tab-panel" id="panel-wallet" role="tabpanel" aria-labelledby="tab-wallet" hidden><section><h2>Paper wallet</h2><div id="wallet"></div></section></div>
<div class="tab-panel" id="panel-runs" role="tabpanel" aria-labelledby="tab-runs" hidden><section><h2>Recent runs</h2><div id="runs"></div></section></div>
<div class="tab-panel" id="panel-outcomes" role="tabpanel" aria-labelledby="tab-outcomes" hidden><section><h2>Prediction outcomes</h2><div id="predictions"></div></section></div>
</div>
<p class="hint">Research only. Top token accounts can include AMM pools, escrows and custodians, not unique holder wallets. Mint checks do not verify liquidity locks or executable exits. Paper trades remain disabled.</p>
<script>
let token='';
const cell=v=>'<td>'+String(v??'—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))+'</td>';
function table(keys,rows){return '<table><thead><tr>'+keys.map(k=>'<th>'+k+'</th>').join('')+'</tr></thead><tbody>'+rows.map(r=>'<tr>'+r.map(cell).join('')+'</tr>').join('')+'</tbody></table>';}

// Only display preferences go to this device's storage. Never store the login token.
const layoutKey='buyguy.assetColumns.v1',sortKey='buyguy.assetSort.v1';
const assetColumns=[
 {key:'chain',name:'Chain',type:'text'},
 {key:'symbol',name:'Token',type:'text'},
 {key:'socials',name:'Socials',type:'number'},
 {key:'safety',name:'Safety',type:'number'},
 {key:'momentum',name:'Signal',type:'number'},
 {key:'direction',name:'Direction 1h',type:'number'},
 {key:'score',name:'Score',type:'number'},
 {key:'status',name:'Status',type:'text'},
 {key:'liquidity',name:'Liquidity $',type:'number'},
 {key:'market_cap',name:'Cap $',type:'number'},
 {key:'price',name:'Price $',type:'number'},
 {key:'buys_m5',name:'5m buys/sells',type:'number'},
 {key:'risk',name:'Mint review',type:'text'},
 {key:'topBps',name:'Top acct %',type:'number'},
 {key:'flags',name:'Mint/holder flags',type:'text'},
 {key:'provider',name:'Provider',type:'text'}
];
const columnByKey=Object.fromEntries(assetColumns.map(c=>[c.key,c]));
const initialColumnKeys=assetColumns.map(c=>c.key);
function storedValue(key){try{return JSON.parse(localStorage.getItem(key)||'null')}catch{return null}}
function saveValue(key,value){try{localStorage.setItem(key,JSON.stringify(value))}catch{}}
function validOrder(maybe){
 const current=Array.isArray(maybe)?maybe.filter((key,index)=>typeof key==='string'&&columnByKey[key]&&maybe.indexOf(key)===index):[];
 const order=current.concat(initialColumnKeys.filter(key=>!current.includes(key)));
 // Introduce new metadata columns beside Token without overwriting a chosen layout.
 if(order.includes('symbol')){
   let insertAfter=order.indexOf('symbol');
   for(const key of ['socials','safety','momentum','direction']){
     if(current.includes(key))continue;
     const previous=order.indexOf(key);if(previous>=0)order.splice(previous,1);
     order.splice(++insertAfter,0,key);
   }
 }
 return order;
}
let assetOrder=validOrder(storedValue(layoutKey));
const savedSort=storedValue(sortKey);
let assetSort=(savedSort&&columnByKey[savedSort.key]&&['asc','desc'].includes(savedSort.direction))?
 savedSort:{key:'score',direction:'desc'};
let assetRows=[];
const tabKey='buyguy.activeTab.v1';
const dashboardTabs=['research','wallet','runs','outcomes'];
let activeTab=dashboardTabs.includes(storedValue(tabKey))?storedValue(tabKey):'research';
function activateTab(tab,{focus=false}={}){
 if(!dashboardTabs.includes(tab))return false;
 activeTab=tab;
 saveValue(tabKey,tab); // Layout preference only; never save credentials.
 for(const id of dashboardTabs){
   const button=document.getElementById('tab-'+id);
   const panel=document.getElementById('panel-'+id);
   if(button){
     button.setAttribute('aria-selected',String(id===tab));
     button.tabIndex=id===tab?0:-1;
     if(id===tab&&focus)button.focus();
   }
   if(panel)panel.hidden=id!==tab;
 }
 return true;
}
function initTabs(){
 for(const id of dashboardTabs){
   const button=document.getElementById('tab-'+id);
   if(!button)continue;
   button.addEventListener('click',()=>activateTab(id));
   button.addEventListener('keydown',event=>{
     let target=null;
     if(event.key==='ArrowRight')target=dashboardTabs[(dashboardTabs.indexOf(id)+1)%dashboardTabs.length];
     else if(event.key==='ArrowLeft')target=dashboardTabs[(dashboardTabs.indexOf(id)-1+dashboardTabs.length)%dashboardTabs.length];
     else if(event.key==='Home')target=dashboardTabs[0];
     else if(event.key==='End')target=dashboardTabs[dashboardTabs.length-1];
     if(target){
       event.preventDefault();
       activateTab(target,{focus:true});
     }
   });
 }
 activateTab(activeTab);
}
function riskInfo(a){try{return JSON.parse(a.risk_note||'{}')}catch{return {}}}
function safeExternalLink(value){
 if(typeof value!=='string'||value.length>1200||!value.toLowerCase().startsWith('https://')||Array.from(value).some(ch=>ch.charCodeAt(0)<32||ch.charCodeAt(0)===127))return null;
 try{const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||!u.hostname||
   u.hostname==='localhost'||u.hostname.endsWith('.local'))return null;return u.href;}catch{return null}
}
function escapeSocial(s){return String(s??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]))}
function socialCell(row){
 if(!row.socialLinks||!row.socialLinks.length)return '<td class="social-cell">—</td>';
 return '<td class="social-cell">'+row.socialLinks.map(link=>
   '<a class="social-link" href="'+escapeSocial(link.url)+'" target="_blank" rel="noopener noreferrer nofollow" referrerpolicy="no-referrer" title="Unverified project-supplied social link" aria-label="Open unverified '+escapeSocial(link.label)+' for '+escapeSocial(row.symbol)+'">'+escapeSocial(link.label)+'</a>'
 ).join('')+'</td>';
}
function recentEnough(value,minutes){
 const ts=Date.parse(value||''),age=Date.now()-ts;
 return Number.isFinite(ts)&&age>=0&&age<=minutes*60000;
}
function latestRoute(row,routes){
 if(!Array.isArray(routes))return null;
 const match=routes.find(x=>x.asset_key===row.asset_key&&recentEnough(x.at,60));
 if(!match)return null;
 try{return JSON.parse(match.note||'{}')}catch{return null}
}
// Evidence score 0–100. Controls 35, token accounts 20, DEX liquidity 15,
// two-way indicative quote 15, freshness 15. Unknown != safe; LP locks unverified.
function safetyAssessment(row,routes=[]){
 const status=row.risk_status||'UNVERIFIED',audit=riskInfo(row);
 if(status==='UNVERIFIED')return {score:null,icon:'⚫',label:'Unassessed',detail:'No on-chain authority review; score unavailable.'};
 const mint=['MINT_CONTROLS_REVOKED','PARTIAL_ONCHAIN_REVIEW','HOLDER_DATA_UNAVAILABLE','TOKEN_2022_METADATA_ONLY','HOLDER_CONCENTRATION_RISK','FULL_REVIEW_PASSED'].includes(status)?35:0;
 const holders=audit.holderStatus==='TOKEN_ACCOUNT_BALANCES_SCREENED'?20:0;
 const liq=Number(row.liquidity);
 const liquidity=Number.isFinite(liq)&&liq>=50000?15:Number.isFinite(liq)&&liq>=25000?8:0;
 const route=latestRoute(row,routes)?.label==='BOTH_DIRECTIONS_QUOTED'?15:0;
 const fresh=recentEnough(row.last_seen,20)?15:recentEnough(row.last_seen,120)?7:0;
 let score=mint+holders+liquidity+route+fresh;
 const flags=Array.isArray(audit.mintFlags)?audit.mintFlags:[];
 const risky=status==='MINT_CONTROL_RISK'||status==='HOLDER_CONCENTRATION_RISK'||
   flags.some(x=>x==='MINT_AUTHORITY_ACTIVE'||x==='FREEZE_AUTHORITY_ACTIVE');
 if(risky)score=Math.min(score,25);
 const full=status==='FULL_REVIEW_PASSED'&&route===15&&score>=85;
 const icon=risky?'🔴':full?'🟢':'🟡';
 const label=risky?'Identified risk':full?'Verified screen':'Partial evidence';
 const detail='Evidence '+score+'/100: mint '+mint+'/35, token accounts '+
   holders+'/20, liquidity '+liquidity+'/15, two-way quote '+route+'/15, quote freshness '+
   fresh+'/15. '+(risky?'Critical risk caps the score at 25. ':'')+
   'Not proof of safety, locked liquidity or a successful sale.';
 return {score,icon,label,detail};
}
function signalAssessment(row){
 const change=Number(row.change_h1),score=Number(row.score);
 const buys=Number(row.buys_m5)||0,sells=Number(row.sells_m5)||0,liq=Number(row.liquidity);
 if(row.status==='DEAD'||row.status==='TRASH'||(Number.isFinite(liq)&&liq<=0))
   return {rank:0,icon:'☠️',label:'Inactive or no liquidity'};
 if(!recentEnough(row.last_seen,120)||row.change_h1===null||!Number.isFinite(change))
   return {rank:1,icon:'🥱',label:'No recent movement evidence'};
 if(score>=80&&change>=12&&buys>=Math.max(8,sells*1.5)&&liq>=50000)
   return {rank:5,icon:'🚀',label:'Acceleration signal, not a buy recommendation'};
 if(change>=2&&buys>=sells)return {rank:4,icon:'📈',label:'Rising with buy pressure'};
 if(change<=-2||sells>buys*1.3)return {rank:2,icon:'📉',label:'Falling or sell pressure'};
 return {rank:1,icon:'🥱',label:'Quiet / sideways'};
}
function directionAssessment(row){
 if(!recentEnough(row.last_seen,120)||row.change_h1===null||row.change_h1===undefined)
   return {value:null,icon:'⚫',label:'One-hour direction unavailable'};
 const value=Number(row.change_h1);
 if(!Number.isFinite(value))return {value:null,icon:'⚫',label:'One-hour direction unavailable'};
 const icon=value>=12?'⬆️':value>=2?'↗️':value<=-12?'⬇️':value<=-2?'↘️':'➡️';
 return {value,icon,label:'Recorded 1-hour change '+(value>=0?'+':'')+value.toFixed(1)+'% (not forecast)'};
}
function indicatorCell(row,key){
 if(key==='safety'){
   const s=row.safetyInfo;
   return '<td class="safety-cell" title="'+escapeSocial(s.detail)+'">'+s.icon+' '+
     (s.score===null?'—':s.score+'/100')+'<span class="risk-note">'+escapeSocial(s.label)+'</span></td>';
 }
 if(key==='momentum')return '<td class="signal-cell" title="'+escapeSocial(row.signalInfo.label)+'">'+row.signalInfo.icon+'</td>';
 if(key==='direction'){
   const d=row.directionInfo;
   return '<td class="direction-cell" title="'+escapeSocial(d.label)+'"><span class="dir-arrow">'+d.icon+'</span> '+
     (d.value===null?'—':(d.value>=0?'+':'')+d.value.toFixed(1)+'%')+'</td>';
 }
 return '';
}
function assetRow(a,routes=[]){
 const audit=riskInfo(a);
 const safetyInfo=safetyAssessment(a,routes),signalInfo=signalAssessment(a),directionInfo=directionAssessment(a);
 const flags=[...(Array.isArray(audit.mintFlags)?audit.mintFlags:[]),
              ...(Array.isArray(audit.holderFlags)?audit.holderFlags:[])];
 const topBps=typeof audit.top1Bps==='number'&&Number.isFinite(audit.top1Bps)?audit.top1Bps:null;
 let supplied=[];
 try{const raw=JSON.parse(a.socials_json||'[]');if(Array.isArray(raw))supplied=raw;}catch{}
 const socialLinks=supplied.filter(item=>item&&typeof item==='object'&&safeExternalLink(item.url))
    .slice(0,24).map(item=>({label:String(item.label||'Link').slice(0,18),url:safeExternalLink(item.url)}));
 return {...a,buys_m5:Number(a.buys_m5)||0,sells_m5:Number(a.sells_m5)||0,
   socials:socialLinks.length,socialLinks,
   safety:safetyInfo.score,momentum:signalInfo.rank,direction:directionInfo.value,
   safetyInfo,signalInfo,directionInfo,
   topBps,risk:a.risk_status||'UNVERIFIED',flags:flags.join(', ')||'Not fully reviewed'};
}
function formatUsd(raw){
 if(raw===null||raw===undefined||raw==='')return '—';
 const n=Number(raw);
 if(!Number.isFinite(n))return '—';
 return '$'+(Math.abs(n)>0&&Math.abs(n)<0.0001?n.toPrecision(4):
   new Intl.NumberFormat('en-US',{maximumFractionDigits:Math.abs(n)<1?6:2}).format(n));
}
function columnValue(row,key){
 if(key==='buys_m5')return row.buys_m5+'/'+row.sells_m5;
 if(key==='topBps')return row.topBps===null?'Unknown':(row.topBps/100).toFixed(1)+'%';
 if(['liquidity','market_cap','price'].includes(key))return formatUsd(row[key]);
 return row[key]??'—';
}
function cmpRow(a,b,key){
 const col=columnByKey[key],av=a[key],bv=b[key];
 if(col.type==='number'){
   const num=v=>(v===null||v===undefined||v===''||!Number.isFinite(Number(v)))?null:Number(v);
   const an=num(av),bn=num(bv);
   if(an===null&&bn===null)return 0;
   if(an===null)return 1; // unknown remains last in both directions
   if(bn===null)return -1;
   return an-bn;
 }
 const absent=v=>v===null||v===undefined||v==='';
 if(absent(av)&&absent(bv))return 0;
 if(absent(av))return 1;
 if(absent(bv))return -1;
 return String(av).localeCompare(String(bv),undefined,{numeric:true,sensitivity:'base'});
}
function orderedAssetRows(){
 const key=assetSort.key,dir=assetSort.direction==='asc'?1:-1;
 return assetRows.map((row,index)=>({row,index})).sort((a,b)=>{
   const av=a.row[key],bv=b.row[key];
   const missing=v=>v===null||v===undefined||v===''||(columnByKey[key].type==='number'&&!Number.isFinite(Number(v)));
   if(missing(av)!==missing(bv))return missing(av)?1:-1;
   return dir*cmpRow(a.row,b.row,key)||a.index-b.index;
 }).map(x=>x.row);
}
function sortAssets(key){
 if(!columnByKey[key])return;
 assetSort=assetSort.key===key?{key,direction:assetSort.direction==='asc'?'desc':'asc'}:
   {key,direction:columnByKey[key].type==='number'?'desc':'asc'};
 saveValue(sortKey,assetSort);
 renderAssets();
}
function moveAssetColumn(from,to,after=false){
 if(!columnByKey[from]||!columnByKey[to]||from===to)return false;
 const order=assetOrder.filter(key=>key!==from);
 const index=order.indexOf(to);
 if(index<0)return false;
 order.splice(index+(after?1:0),0,from);
 assetOrder=validOrder(order);saveValue(layoutKey,assetOrder);renderAssets();
 return true;
}
function resetAssetColumns(){
 assetOrder=[...initialColumnKeys];
 assetSort={key:'score',direction:'desc'};
 saveValue(layoutKey,assetOrder);saveValue(sortKey,assetSort);
 renderAssets();
}
function setAssetData(records,routes=[]){assetRows=(Array.isArray(records)?records:[]).map(a=>assetRow(a,routes));renderAssets()}
let drag=null,suppressSortUntil=0;
function headerAt(x,y){
 const hits=document.elementsFromPoint?document.elementsFromPoint(x,y):[document.elementFromPoint(x,y)];
 for(const node of hits){
   const th=node&&node.closest?node.closest('th[data-col]'):null;
   if(th&&document.getElementById('assets').contains(th))return th;
 }
 return null;
}
function clearDropHighlight(){
 document.querySelectorAll('#assets th').forEach(th=>th.classList.remove('drop-target','drag-active'));
}
function renderAssets(){
 const wrap=document.getElementById('assets');
 if(!wrap)return;
 const left=wrap.scrollLeft;
 const colHtml=assetOrder.map(key=>{
   const c=columnByKey[key],active=assetSort.key===key;
   const indicator=active?(assetSort.direction==='asc'?' ▲':' ▼'):' ↕';
   const aria=active?(assetSort.direction==='asc'?'ascending':'descending'):'none';
   return '<th scope="col" tabindex="0" data-col="'+key+'" aria-sort="'+aria+'" aria-label="Sort by '+c.name+'; drag to move">'+c.name+
     '<span class="sort-indicator" aria-hidden="true">'+indicator+'</span></th>';
 }).join('');
 const rows=orderedAssetRows().map(row=>'<tr>'+assetOrder.map(key=>key==='socials'?socialCell(row):['safety','momentum','direction'].includes(key)?indicatorCell(row,key):cell(columnValue(row,key))).join('')+'</tr>').join('');
 wrap.innerHTML='<table><thead><tr>'+colHtml+'</tr></thead><tbody>'+rows+'</tbody></table>';
 wrap.scrollLeft=left;
 wrap.querySelectorAll('th[data-col]').forEach(th=>{
   th.addEventListener('click',()=>{
     if(Date.now()<suppressSortUntil)return;
     sortAssets(th.dataset.col);
   });
   th.addEventListener('keydown',e=>{
     if(e.shiftKey&&(e.key==='ArrowLeft'||e.key==='ArrowRight')){
       e.preventDefault();
       const current=assetOrder.indexOf(th.dataset.col);
       const next=assetOrder[current+(e.key==='ArrowLeft'?-1:1)];
       if(next){const moved=th.dataset.col;moveAssetColumn(moved,next,e.key==='ArrowRight');
         const nextTh=wrap.querySelector('th[data-col="'+moved+'"]');if(nextTh)nextTh.focus();}
     }else if(e.key==='Enter'||e.key===' '){e.preventDefault();sortAssets(th.dataset.col);}
   });
   th.addEventListener('pointerdown',e=>{
     if(e.button!==undefined&&e.button!==0)return;
     drag={key:th.dataset.col,pointerId:e.pointerId,startX:e.clientX,startY:e.clientY,moving:false,x:e.clientX,y:e.clientY};
     try{th.setPointerCapture(e.pointerId)}catch{}
   });
   th.addEventListener('pointermove',e=>{
     if(!drag||drag.pointerId!==e.pointerId)return;
     const dx=e.clientX-drag.startX,dy=e.clientY-drag.startY;
     if(!drag.moving&&Math.abs(dx)>10&&Math.abs(dx)>Math.abs(dy)*1.1)drag.moving=true;
     if(!drag.moving)return;
     e.preventDefault();
     drag.x=e.clientX;drag.y=e.clientY;
     clearDropHighlight();th.classList.add('drag-active');
     const target=headerAt(e.clientX,e.clientY);
     if(target)target.classList.add('drop-target');
     const rect=wrap.getBoundingClientRect();
     if(e.clientX>rect.right-25)wrap.scrollLeft+=18;
     if(e.clientX<rect.left+25)wrap.scrollLeft-=18;
   });
   function endDrag(e){
     if(!drag||drag.pointerId!==e.pointerId)return;
     const state=drag;drag=null;
     clearDropHighlight();
     if(!state.moving)return;
     suppressSortUntil=Date.now()+450;
     const target=headerAt(e.clientX,e.clientY);
     if(!target||target.dataset.col===state.key)return;
     const rect=target.getBoundingClientRect();
     moveAssetColumn(state.key,target.dataset.col,e.clientX>=rect.left+rect.width/2);
     const status=document.getElementById('assetOrderStatus');
     if(status)status.textContent='Columns rearranged and saved on this device.';
   }
   th.addEventListener('pointerup',endDrag);
   th.addEventListener('pointercancel',()=>{drag=null;clearDropHighlight()});
 });
 const status=document.getElementById('assetOrderStatus');
 if(status&&!assetRows.length)status.textContent='No token data returned.';
 else if(status&&assetRows.length&&!status.textContent)status.textContent='Sorting '+columnByKey[assetSort.key].name+' '+(assetSort.direction==='asc'?'ascending':'descending')+'.';
}
async function refresh(){try{
 const r=await fetch('/api/status',{headers:{authorization:'Bearer '+token},cache:'no-store'});
 if(!r.ok)throw Error('HTTP '+r.status);
 const x=await r.json();
 document.getElementById('login').style.display='none';
 document.getElementById('board').style.display='block';
 const recent=x.runs?.[0]||{},elapsed=recent.started_at?Math.round((Date.now()-Date.parse(recent.started_at))/60000):null;
 document.getElementById('overview').innerHTML='<div class="stat">Cash: $'+Number(x.wallet?.cash??0).toFixed(2)+'</div><div class="stat">Last scan: '+(recent.state??'None')+(elapsed===null?'':' ('+elapsed+'m ago)')+'</div><div class="stat">Tracked: '+(x.assets?.length??0)+'</div>';
 document.getElementById('runs').innerHTML=table(['UTC','Status','Assets','Errors'],(x.runs||[]).map(v=>[v.started_at,v.state,v.observed,v.provider_errors]));
 setAssetData(x.assets,x.routes);
 document.getElementById('routeReviews').innerHTML=table(['UTC','Mint','Result','Approx. round-trip loss','Top impact'],(x.routes||[]).map(r=>{
 let report={};try{report=JSON.parse(r.note||'{}')}catch{}
 return [r.at,r.asset_key,report.label||'Unknown',report.estimatedRoundTripLossPct===null||report.estimatedRoundTripLossPct===undefined?'Unknown':report.estimatedRoundTripLossPct+'%',report.maxImpactPct===null||report.maxImpactPct===undefined?'Unknown':report.maxImpactPct+'%'];
 }));
 document.getElementById('wallet').innerHTML=table(['Starting','Cash','Realised P&L','Estimated equity','Stale marks'],[[
 x.paper?.starting_cash,x.paper?.cash,x.paper?.realised,x.paper?.estimated_total===null?'Unknown':x.paper?.estimated_total,x.paper?.unknown_marks]])+
 table(['Token','Cost USD','Est. sale value','Unrealised P&L','Price stale'],(x.paper?.positions||[]).map(p=>[
 p.asset_key,p.cost,p.estimatedValue===null?'Unknown':p.estimatedValue,p.unrealized===null?'Unknown':p.unrealized,p.stale]));
 document.getElementById('predictions').innerHTML=table(['Token','Status','Horizon min','Change %'],(x.predictions||[]).map(p=>[p.asset_key,p.status,p.horizon_min,p.change_pct]));
}catch(e){document.getElementById('msg').textContent='Access or service error: '+e.message}}
document.getElementById('enter').onclick=()=>{token=document.getElementById('pass').value;document.getElementById('pass').value='';refresh()};
document.getElementById('refresh').onclick=refresh;
document.getElementById('resetAssetColumns').onclick=()=>{resetAssetColumns();document.getElementById('assetOrderStatus').textContent='Default layout restored.'};
initTabs();


</script></body></html>`;
function auth(given,secret){if(!secret||!given||given.length!==secret.length)return false;let n=0;for(let i=0;i<given.length;i++)n|=given.charCodeAt(i)^secret.charCodeAt(i);return n===0;}
export default {async fetch(request,env){const path=new URL(request.url).pathname;
if(path==='/health')return json({server:'online',scan_status:'not_verified'});
if(path==='/'||path==='/dashboard')return new Response(page,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
if(path!=='/api/status')return json({error:'not_found'},404);
const bearer=(request.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
if(!auth(bearer,env.ADMIN_TOKEN||''))return json({error:'unauthorized'},401);
if(!env.DB)return json({error:'database_not_configured'},503);
try{const list=async(sql)=>(await env.DB.prepare(sql).all()).results||[];
const [runs,assets,wallet,predictions,routes]=await Promise.all([
list('SELECT * FROM runs ORDER BY id DESC LIMIT 12'),
list("SELECT a.*, (SELECT e.note FROM research_events e WHERE e.asset_key=a.asset_key AND e.kind='TOKEN_SOCIALS' ORDER BY e.id DESC LIMIT 1) AS socials_json FROM assets a WHERE a.status IN ('ALIVE','STATIC') ORDER BY a.score DESC LIMIT 500"),
list("SELECT * FROM paper_account WHERE account='buyguy-v3'"),
list("SELECT * FROM predictions ORDER BY id DESC LIMIT 30"),
list("SELECT at,asset_key,note FROM research_events WHERE kind='ROUNDTRIP_QUOTE' ORDER BY id DESC LIMIT 15")]);
const paper=await getPaperSnapshot(env);
return json({runs,assets,wallet:wallet[0]||null,predictions,paper,routes});
}catch(e){return json({error:'D1 query failed',message:String(e).slice(0,180)},503)}
},async scheduled(controller,env,ctx){
  await scheduledResearch(env);
}
};
