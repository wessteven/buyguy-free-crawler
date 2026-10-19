import {getPaperSnapshot} from './paper-ops.mjs';
import {scheduledResearch} from './scheduled-research.mjs';
const headers={'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'};
const json=(v,s=200)=>new Response(JSON.stringify(v),{status:s,headers});
const esc=s=>String(s??'—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const page=`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>BuyGuy Free Radar</title>
<style>body{background:#0a1610;color:#e6f9eb;font:14px system-ui;margin:auto;padding:24px;max-width:1000px}h1{color:#9cfdc6}input,button{padding:12px;background:#173426;border:1px solid #477b5b;border-radius:8px;color:#e8ffee}button{cursor:pointer}.hint{color:#a4baa9}section{margin:20px 0;overflow:auto}table{border-collapse:collapse;width:100%;font-size:13px}th,td{border-bottom:1px solid #31513b;padding:10px;text-align:left;white-space:nowrap}th{color:#8dc5a0}#board{display:none}.stat{display:inline-block;border:1px solid #416449;border-radius:10px;padding:15px;margin:4px;background:#112a19}</style></head><body>
<h1>BUYGUY // FREE RADAR</h1><p class="hint">Read-only research • Robinhood + Solana • Indicative prices • Paper wallet experimental</p>
<div id="login"><input type="password" id="pass" placeholder="Dashboard secret" autocomplete="off"><button id="enter">Open</button><p id="msg"></p></div>
<div id="board"><button id="refresh">Refresh data</button><div id="overview"></div><section><h2>Recent runs</h2><div id="runs"></div></section><section><h2>Token research</h2><div id="assets"></div></section><section><h2>Read-only $40 round-trip quotes</h2><p class="hint">Quote availability is NOT proof of an executable sale. No trade has been sent.</p><div id="routeReviews"></div></section><section><h2>Paper wallet</h2><div id="wallet"></div></section><section><h2>Prediction outcomes</h2><div id="predictions"></div></section></div>
<p class="hint">Research only. Top token accounts can include AMM pools, escrows and custodians, not unique holder wallets. Mint checks do not verify liquidity locks or executable exits. Paper trades remain disabled.</p>
<script>
let token='';
const cell=v=>'<td>'+String(v??'—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))+'</td>';
function table(keys,rows){return '<table><thead><tr>'+keys.map(k=>'<th>'+k+'</th>').join('')+'</tr></thead><tbody>'+rows.map(r=>'<tr>'+r.map(cell).join('')+'</tr>').join('')+'</tbody></table>';}
async function refresh(){try{const r=await fetch('/api/status',{headers:{authorization:'Bearer '+token},cache:'no-store'});if(!r.ok)throw Error('HTTP '+r.status);const x=await r.json();document.getElementById('login').style.display='none';document.getElementById('board').style.display='block';
const recent=x.runs?.[0]||{},elapsed=recent.started_at?Math.round((Date.now()-Date.parse(recent.started_at))/60000):null;
document.getElementById('overview').innerHTML='<div class="stat">Cash: $'+Number(x.wallet?.cash??0).toFixed(2)+'</div><div class="stat">Last scan: '+(recent.state??'None')+(elapsed===null?'':' ('+elapsed+'m ago)')+'</div><div class="stat">Tracked: '+(x.assets?.length??0)+'</div>';
document.getElementById('runs').innerHTML=table(['UTC','Status','Assets','Errors'],(x.runs||[]).map(v=>[v.started_at,v.state,v.observed,v.provider_errors]));
const riskInfo=a=>{try{return JSON.parse(a.risk_note||'{}')}catch{return {}}};
document.getElementById('assets').innerHTML=table(['Chain','Token','Score','Status','Liquidity $','5m buys/sells','Mint review','Top acct %','Mint/holder flags','Provider'],(x.assets||[]).map(a=>{
const audit=riskInfo(a);
return [a.chain,a.symbol,a.score,a.status,a.liquidity,a.buys_m5+'/'+a.sells_m5,
a.risk_status,audit.top1Bps===null||audit.top1Bps===undefined?'Unknown':(audit.top1Bps/100).toFixed(1)+'%',
[...(audit.mintFlags||[]),...(audit.holderFlags||[])].join(', ')||'Not fully reviewed',a.provider];
}));
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
document.getElementById('enter').onclick=()=>{token=document.getElementById('pass').value;document.getElementById('pass').value='';refresh()};document.getElementById('refresh').onclick=refresh;
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
list("SELECT * FROM assets WHERE status IN ('ALIVE','STATIC') ORDER BY score DESC LIMIT 80"),
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
