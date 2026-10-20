import {getPaperSnapshot} from './paper-ops.mjs';
import {scheduledResearch} from './scheduled-research.mjs';
import {issueSession,validSession,readSessionCookie,sessionCookie,clearSessionCookie} from './auth-session.mjs';
import {addWatchedAddress} from './watchlist.mjs';
import {assessGreenLight} from './green-gate.mjs';
import {tokenTier,countCoverage} from './token-tiers.mjs';
import {runTokenAuditStage} from './on-demand-audit.mjs';
const headers={'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'};
const json=(v,s=200)=>new Response(JSON.stringify(v),{status:s,headers});
const esc=s=>String(s??'—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const page=`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>BuyGuy Free Radar</title>
<style>body{background:#0a1610;color:#e6f9eb;font:14px system-ui;margin:auto;padding:24px;max-width:1000px}h1{color:#9cfdc6}input,button{padding:12px;background:#173426;border:1px solid #477b5b;border-radius:8px;color:#e8ffee}#remember{width:18px;height:18px;padding:0;margin:0;accent-color:#9cfdc6;flex:none}.remember-choice{display:flex;align-items:center;gap:10px;margin:12px 0;color:#c9efd4}.login-note{max-width:370px}.login-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap}#logout{padding:8px 12px}button{cursor:pointer}.hint{color:#a4baa9}section{margin:20px 0;overflow:auto}table{border-collapse:collapse;width:100%;font-size:13px}th,td{border-bottom:1px solid #31513b;padding:10px;text-align:left;white-space:nowrap}th{color:#8dc5a0}#assets{max-width:100%;overflow-x:auto;overscroll-behavior-x:contain}#assets table{min-width:max-content;width:100%}#assets th{position:sticky;top:0;z-index:2;background:#163423;cursor:grab;user-select:none;-webkit-user-select:none;touch-action:pan-y;min-width:68px}#assets th:focus-visible{outline:2px solid #9cfdc6}#assets th.drag-active{background:#286548;cursor:grabbing}#assets th.drop-target{box-shadow:inset 3px 0 #9cfdc6}#assets td{font-variant-numeric:tabular-nums}#assets .sort-indicator{display:inline-block;min-width:1em;color:#9cfdc6;margin-left:5px}#assets .social-cell{white-space:nowrap;min-width:85px}#assets .social-link{display:inline-block;color:#b9ffd0;background:#234b32;border:1px solid #3d8053;border-radius:6px;padding:5px 7px;margin:1px 3px 1px 0;text-decoration:none;font-weight:650}#assets .social-link:focus-visible{outline:2px solid #b9ffd0}#assets .social-link:hover{text-decoration:underline}#assets .safety-cell{font-weight:700;font-variant-numeric:tabular-nums}#assets .risk-note{display:block;font-size:10px;font-weight:400;color:#bdcbbc}#assets .signal-cell{font-size:19px;text-align:center}#assets .direction-cell{font-weight:700;text-align:center;font-variant-numeric:tabular-nums}#assets .dir-arrow{display:inline-block;font-size:18px;transition:transform .35s ease}.indicator-legend{font-size:12px;line-height:1.6;margin:6px 0 12px}.asset-toolbar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:8px}.asset-toolbar button{padding:8px 10px}.asset-toolbar .hint{font-size:12px}#board{display:none}.stat{display:inline-block;border:1px solid #416449;border-radius:10px;padding:15px;margin:4px;background:#112a19}.bg-tablist{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:5px;margin:16px 0 10px;position:sticky;top:0;z-index:5;background:#0a1610;padding:7px 0}.bg-tab{min-width:0;padding:12px 3px;font-size:clamp(10px,2.6vw,13px);font-weight:650;line-height:1.25;white-space:normal;background:#12271b;border:1px solid #416449;border-radius:9px;color:#b3d9bd;touch-action:manipulation}.bg-tab[aria-selected="true"]{background:#265b3e;color:#bfffd5;border-color:#8ddda8;box-shadow:inset 0 -3px #a1f3bb}.bg-tab:focus-visible{outline:2px solid #b7ffd2;outline-offset:2px}.tab-panel[hidden]{display:none!important}.tab-panel{min-height:160px}.tab-panel>section:first-child{margin-top:6px}@media(max-width:410px){body{padding:14px}.bg-tablist{gap:4px}.bg-tab{padding:11px 2px}} .ascii-title{white-space:pre;margin:0 0 4px;overflow:hidden;color:#91ffae;font-size:clamp(10px,2.9vw,13px);line-height:1.18;font-weight:700;letter-spacing:.05em}
body{padding:7px!important;max-width:none!important;min-height:100vh;background:#07100a!important;color:#b7f9c6!important;font-family:ui-monospace,SFMono-Regular,Consolas,'Liberation Mono',Menlo,monospace!important;font-size:11px!important;line-height:1.3}
#board{border:1px solid #2f5638;background:#09180f}
h2{font-size:12px!important;font-weight:800;color:#96ffb0;letter-spacing:.02em;margin:0 0 5px;text-transform:uppercase}
.hint{font-size:10px!important;color:#82aa8a!important}
section{margin:0!important;padding:5px!important;overflow:visible!important;border-top:1px solid #294a31}
button,input,select{font-family:inherit!important;font-size:11px!important;border-radius:2px!important;padding:5px 7px!important}
button{min-height:27px}input,select{max-width:100%}
table{font-family:inherit!important;font-size:10px!important;line-height:1.22}
th,td{padding:3px 5px!important;border-bottom:1px solid #25432e!important;vertical-align:middle}
tbody tr:nth-child(even){background:#0c2013}
tbody tr:hover{background:#174029}
#assets th,.asset-view th{min-width:42px!important;top:0;background:#142d1b!important}
#assets,.asset-view{border:1px solid #2d5536;overflow:auto;max-width:100%}
#assets .social-link{padding:2px 3px!important;margin:0 1px!important;border-radius:2px!important}
#assets .risk-note{font-size:9px}
#assets .signal-cell,#assets .dir-arrow{font-size:13px!important}
.asset-toolbar{margin:2px 0 4px!important;gap:4px!important}
#overview{padding:3px;border-top:1px solid #294a31}
.stat{border:0!important;border-right:1px solid #335e41!important;border-radius:0!important;background:transparent!important;padding:3px 6px!important;margin:0!important;font-size:10px}
.bg-tablist{grid-template-columns:repeat(4,minmax(0,1fr));margin:0!important;padding:3px!important;gap:2px!important;background:#0b2012!important;position:sticky;top:0}
.bg-tab{font-size:10px!important;padding:5px 2px!important;min-height:29px;border-radius:2px!important;white-space:nowrap}
.tab-panel{min-height:70px!important}
.login-actions{padding:3px;gap:4px}
.copy-address{border:0!important;background:transparent!important;color:#93ffae!important;text-decoration:underline;white-space:nowrap;font-size:10px!important;padding:2px!important;min-height:0!important}
.ticker{font-weight:900;color:#e3ffec;letter-spacing:.03em}
#copyStatus{font-size:10px;display:block;min-height:0}
#address-entry-panel{margin:0;padding:0}
#watchForm{display:flex;align-items:flex-end;flex-wrap:wrap;gap:5px}
#watchForm label{display:flex;flex-direction:column;gap:3px;min-width:90px}
#watchAddress{width:min(94vw,480px);flex:1;min-width:220px}
#watchList{margin-top:8px;max-width:100%;overflow:auto}
#watchMsg{font-size:11px;min-height:13px}
#login{margin:8px 0;padding:8px;border:1px solid #315b3d}
#login>label{display:block;margin-bottom:5px}
#login #pass{min-width:180px}
#assets .audit-btn,.asset-view .audit-btn{font-size:10px!important;min-height:22px!important;
 color:#acffd0!important;background:#163c26!important;border:1px solid #4d9866!important;
 padding:2px 5px!important;white-space:nowrap}
#auditDialog{background:#08160c;color:#d5ffe3;border:1px solid #407653;
 font:11px ui-monospace,Consolas,monospace;width:min(94vw,520px);
 max-height:82vh;overflow:auto;padding:10px}
#auditDialog::backdrop{background:rgba(0,0,0,.8)}
#auditProgress{white-space:pre-wrap;line-height:1.65;overflow-wrap:anywhere}
.audit-row{border-bottom:1px solid #30523b;padding:6px 0}
.audit-status{color:#a3dfb5;font-size:10px}
#scanClock{display:inline-flex;align-items:center;white-space:nowrap;font-size:11px;
 padding:4px 6px;background:#0d2919;color:#a8f7bf;border:1px solid #2d5e3f;
 border-radius:2px;min-width:112px;justify-content:center;font-variant-numeric:tabular-nums}
#scanClock.overdue{color:#ffd185;border-color:#926d38;background:#362516}
#scanClock.unknown{color:#9eae9e}
.moby-chart-link{color:#b8ffce!important;border:1px solid #376c4a;
 border-radius:2px;padding:3px 5px;white-space:nowrap;text-decoration:none;
 background:#173e26;font-weight:bold;display:inline-block}
.moby-chart-link:focus-visible{outline:2px solid #a1ffc0}
.dex-chart-link{color:#c5fce2!important;border:1px solid #457b65;
 border-radius:2px;padding:3px 5px;white-space:nowrap;text-decoration:none;
 background:#103728;font-weight:bold;display:inline-block}
.dex-chart-link:focus-visible{outline:2px solid #a1ffc0}
.lp-lock-verified{display:inline-block;margin-left:3px;white-space:nowrap;vertical-align:baseline;cursor:help}
.good-title{display:flex;gap:8px;align-items:baseline;flex-wrap:wrap}
.good-title strong{font-size:19px;letter-spacing:.035em;color:#c0ffd5}
.good-intro{white-space:normal;max-width:750px}
.good-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:7px;margin:7px 0}
.good-item{min-width:0;background:#0d2417;border:1px solid #315c41;border-left:3px solid #589b6c;padding:8px}
.good-item h3{display:flex;align-items:center;gap:6px;justify-content:space-between;font-size:13px;margin:0 0 4px;overflow-wrap:anywhere}
.good-item .good-grade{font-size:19px;font-weight:900;color:#c2ffcb;font-variant-numeric:tabular-nums}
.good-verdict{display:inline-block;font-size:10px;padding:2px 5px;border:1px solid #588b65;color:#e6ffe8;white-space:nowrap}
.good-verdict.caution{border-color:#ba965c;color:#ffdc9e}
.good-item p{white-space:normal;overflow-wrap:anywhere;margin:4px 0;line-height:1.4}
.good-meta{font-variant-numeric:tabular-nums;color:#a8d1b4;font-size:10px}
.good-actions{display:flex;flex-wrap:wrap;gap:5px;margin-top:6px}
.good-actions button,.good-actions a{font-size:10px;padding:4px 6px;background:#183a28;border:1px solid #497a57;color:#dcffe4;text-decoration:none;min-height:24px}
.good-empty{white-space:normal;color:#e2c998;padding:9px;border:1px dashed #75633e}
.research-guide{font-size:10px}
#greenDialog{background:#09190e;color:#bbfccc;border:1px solid #467553;font:11px ui-monospace,Consolas,monospace;
 width:min(92vw,520px);max-height:76vh;overflow:auto;padding:12px}
#greenDialog::backdrop{background:rgba(0,0,0,.78)}
#greenDialog .audit-check{border-bottom:1px solid #34543e;padding:6px 0;white-space:normal}
#greenDialog .audit-detail{font-size:10px;color:#a3c7a8;white-space:normal}
#greenDialog .audit-title{font-weight:800;color:#d5ffdc}
#assets .green-button,.asset-view .green-button{min-height:0!important;padding:1px 2px!important;border:0!important;background:transparent!important;font-weight:800;line-height:1.15;white-space:nowrap}
#assets .green-progress{font-size:9px;color:#9cc3a4;display:block}
#assets .our-score-btn,.asset-view .our-score-btn{padding:2px 5px!important;min-height:0!important;border:1px solid #3c9062!important;background:#14402b!important;color:#e0ffe7!important;font-weight:900;font-variant-numeric:tabular-nums}
#ourScoreDialog{background:#08180f;color:#d8fce5;border:1px solid #47835b;font:11px ui-monospace,Consolas,monospace;width:min(94vw,550px);max-height:80vh;overflow:auto;padding:12px}
#ourScoreDialog::backdrop{background:rgba(0,0,0,.8)}
#ourScoreBreakdown table{width:100%;font-size:10px}
#ourScoreBreakdown td,#ourScoreBreakdown th{white-space:normal!important;text-align:left}

@media(max-width:400px){body{padding:4px!important}.bg-tab{font-size:9px!important}.stat{padding:2px 4px!important}th,td{padding:3px 4px!important}}
/* The token table owns vertical scroll, so the column header remains visible.
   Both directions are scrolled by the same native element on Android. */
#assets,.asset-view{height:min(70dvh,750px)!important;max-height:70dvh!important;
 overflow:auto!important;overscroll-behavior:contain;position:relative;
 -webkit-overflow-scrolling:touch;scrollbar-gutter:stable}
#assets table,.asset-view table{min-width:max-content;width:max-content}
#assets thead,.asset-view thead{position:sticky;top:0;z-index:12}
#assets th,.asset-view th{position:sticky!important;top:0!important;z-index:12!important;
 background:#14321d!important;box-shadow:0 2px 0 #3c7951}
#assets .head-controls,.asset-view .head-controls{display:inline-flex;gap:2px;
 align-items:center;margin-left:4px;vertical-align:middle}
#assets .head-controls button,.asset-view .head-controls button{min-height:19px!important;
 padding:0 3px!important;border:1px solid #386c47!important;line-height:16px;
 background:#1e462b!important;font-size:12px!important;touch-action:manipulation}
#assets .social-cell,.asset-view .social-cell{max-width:175px;white-space:normal}
#assets .social-cell.folded,.asset-view .social-cell.folded{white-space:nowrap;max-width:108px}
#assets .social-cell .social-extra,.asset-view .social-cell .social-extra{display:none!important}
#assets .social-cell.expanded .social-extra,.asset-view .social-cell.expanded .social-extra{display:inline-block!important}
#assets .social-link,.asset-view .social-link{padding:2px 3px!important;margin:0 1px!important;
 border-radius:2px!important;font-size:10px!important}
#assets .social-count,.asset-view .social-count{color:#a2e2b1;margin-left:3px}
#assets .flags-cell,.asset-view .flags-cell{max-width:225px;white-space:normal!important;
 overflow-wrap:anywhere;word-break:break-word}
#assets .flags-cell.folded,.asset-view .flags-cell.folded{white-space:nowrap!important;max-width:170px}
#assets .flags-full,.asset-view .flags-full{display:inline-block;max-width:210px;white-space:normal;
 overflow-wrap:anywhere}

/* Mobile overflow containment: long supplementary tables must never stretch the page.
   Only the table viewport can scroll sideways; the TOKEN DATA grid keeps its own
   independent scrolling and pinned column headings. */
html{width:100%;max-width:100%;overflow-x:clip}
body{box-sizing:border-box;width:100%;max-width:100%;overflow-x:clip}
*,*::before,*::after{box-sizing:border-box}
#board,#overview,.tab-panel,.tab-panel>section,.research-guide{
 width:100%;max-width:100%;min-width:0
}
#routeReviews,#wallet,#runs,#predictions,#watchList{width:100%;max-width:100%;min-width:0}
.data-scroll{display:block;width:100%;max-width:100%;min-width:0;overflow-x:auto;
 overflow-y:hidden;overscroll-behavior-x:contain;-webkit-overflow-scrolling:touch}
.data-scroll table{width:max-content;min-width:100%;max-width:none;table-layout:auto}
.data-scroll th,.data-scroll td{white-space:normal!important;max-width:175px;
 min-width:56px;overflow-wrap:anywhere;word-break:break-word}
.data-scroll th{position:sticky;top:0;background:#14321d}
.research-guide,.research-guide p{overflow-wrap:anywhere;white-space:normal}

</style></head><body>
<pre class="ascii-title" role="heading" aria-level="1">+----------------------------+
| the   BUYGUY GOGET         |
+----------------------------+</pre><p class="hint">[ RH + SOL ] // RESEARCH // PAPER EXPERIMENT // NO REAL TRADES</p>
<div id="login"><label for="pass">Dashboard password</label><div class="login-actions"><input type="password" id="pass" placeholder="Dashboard password" autocomplete="current-password"><button id="enter" type="button">Open</button></div><label class="remember-choice" for="remember"><input id="remember" type="checkbox"> Remember me on this device (30 days)</label><p class="hint login-note">Your password is never saved in the page or browser storage. Uncheck on shared devices.</p><p id="msg" role="status" aria-live="polite"></p><p id="d1ResetClock" role="timer" aria-live="off" style="display:none;font-weight:bold;color:#8ae6a6"></p></div>
<div id="board"><div class="login-actions"><button id="refresh" type="button">Refresh data</button><button id="logout" type="button">Sign out</button><span id="scanClock" role="status" aria-live="off" aria-label="Estimated time until next ten-minute scan">NEXT SCAN --:--</span></div><div id="overview"></div>
<nav class="bg-tablist" role="tablist" aria-label="BuyGuy dashboard sections">
<button class="bg-tab" id="tab-good" role="tab" type="button" data-tab="good" aria-controls="panel-good" aria-selected="true" tabindex="0">WHAT'S GOOD?</button>
<button class="bg-tab" id="tab-research" role="tab" type="button" data-tab="research" aria-controls="panel-research" aria-selected="false" tabindex="-1">TOKEN DATA</button>
<button class="bg-tab" id="tab-hot" role="tab" type="button" data-tab="hot" aria-controls="panel-hot" aria-selected="false" tabindex="-1">🔥 HOT</button>
<button class="bg-tab" id="tab-not" role="tab" type="button" data-tab="not" aria-controls="panel-not" aria-selected="false" tabindex="-1">🥱 NOT</button>
<button class="bg-tab" id="tab-archive" role="tab" type="button" data-tab="archive" aria-controls="panel-archive" aria-selected="false" tabindex="-1">📚 Archive</button>
<button class="bg-tab" id="tab-wallet" role="tab" type="button" data-tab="wallet" aria-controls="panel-wallet" aria-selected="false" tabindex="-1">Wallet</button>
<button class="bg-tab" id="tab-runs" role="tab" type="button" data-tab="runs" aria-controls="panel-runs" aria-selected="false" tabindex="-1">Recent Runs</button>
<button class="bg-tab" id="tab-outcomes" role="tab" type="button" data-tab="outcomes" aria-controls="panel-outcomes" aria-selected="false" tabindex="-1">Outcomes</button>
<button class="bg-tab" id="tab-address" role="tab" type="button" data-tab="address" aria-controls="panel-address" aria-selected="false" tabindex="-1">+ Address</button>
</nav>
<div class="tab-panel" id="panel-good" role="tabpanel" aria-labelledby="tab-good">
<section><h2 class="good-title"><strong>WHAT'S GOOD?</strong> TOP RESEARCH CANDIDATES <span id="goodCount"></span></h2>
<p class="hint good-intro">Only the best five eligible signals, ranked by OUR SCORE. Each verdict describes research priority, not a recommendation to buy. No qualifying candidates? We show none rather than fill the list with noise.</p>
<p id="goodDataStatus" class="hint" role="status" aria-live="polite">Waiting for market data…</p>
<div id="goodCards" class="good-list" aria-live="polite" aria-label="Five strongest currently qualified crypto research candidates"></div>
<p id="goodFootnote" class="hint">Evidence is indicative; prices and buying activity can be spoofed. Never assume an LP lock or executable exit.</p>
<button type="button" id="goodResearch" aria-label="Open full sortable token research">Full research + all tokens ↗</button>
</section></div>
<div class="tab-panel" id="panel-research" role="tabpanel" aria-labelledby="tab-research" hidden>
<section><h2>Token research</h2><div class="asset-toolbar"><button id="sortOurScore" type="button" title="Sort all visible tokens from highest to lowest OUR SCORE">Rank OUR SCORE ▼</button><button id="resetAssetColumns" type="button">Reset columns</button><span class="hint" id="assetOrderStatus" role="status" aria-live="polite"></span></div><div id="assets" aria-label="Sortable, rearrangeable token research table"></div><span id="copyStatus" role="status" aria-live="polite"></span>
</section>
<section><h2>Read-only $40 round-trip quotes</h2><p class="hint">Quote availability is NOT proof of an executable sale. No trade has been sent.</p><div id="routeReviews"></div></section>
<section aria-label="Token research guide" class="research-guide"><h2>Guide &amp; indicators</h2><p class="hint indicator-legend"><strong>Market Score (0–100)</strong> ranks observed trading opportunity from liquidity, market-cap fit, buyer flow, volume, price change and pool age — not safety or a forecast. <strong>Safety Evidence (0–100 or —)</strong> reflects mint/holder review, pool liquidity, indicative round-trip quote and quote freshness. Tap it to inspect the independent <strong>seven-check safety screen</strong>. <strong>OUR SCORE (0–100)</strong> ranks independently rated factors using explicit weights. Tap for the breakdown. Thin liquidity, extreme spikes, stale quotes and flagged risk reduce the score. It is a research ranking, not a trade or safety verdict. <strong>Liq/Cap %</strong> = USD pool liquidity ÷ reported USD market cap × 100; missing cap means —. 🔒 appears beside the ratio only when the independent <strong>Pool custody / LP lock</strong> safety check passes for the matched pool with recent on-chain evidence. The lock does not mean 100% of liquidity is locked or guarantee sellability. A high ratio alone does not verify LP locks or a sell route. Safety: 🟢 7/7 independently confirmed · 🟡 partial evidence · 🔴 identified risk · ⚫ unknown. Signal: 🚀 acceleration · 📈 rising · 📉 falling · 🥱 quiet · ☠️ inactive. 180° direction: ⬆️ ↗️ ➡️ ↘️ ⬇️ tracks recorded 1-hour price change, not future direction.</p><p class="hint">Tap a heading to sort ↑ ↓. Drag headings to move columns (including on mobile); swipe the rows sideways to see more columns. Social links are project-supplied and unverified. Keyboard: Shift + ←/→ moves a selected heading.</p></section>
</div>
<div class="tab-panel" id="panel-hot" role="tabpanel" aria-labelledby="tab-hot" hidden>
<section><h2>HOT // FRESH MOMENTUM <span id="hotCount" class="hint"></span></h2>
<p class="hint">Fresh buyer momentum, not a safety verdict. Shared TOKEN DATA columns and sorting.</p>
<div class="asset-view" id="hotAssets" aria-label="Live HOT token subset"></div></section></div>
<div class="tab-panel" id="panel-not" role="tabpanel" aria-labelledby="tab-not" hidden>
<section><h2>NOT // COOLING <span id="notCount" class="hint"></span></h2>
<p class="hint">Recently observed but not currently accelerating; persistently inactive tokens move into Archive.</p>
<div class="asset-view" id="notAssets" aria-label="Background monitored NOT token subset"></div></section></div>
<div class="tab-panel" id="panel-archive" role="tabpanel" aria-labelledby="tab-archive" hidden>
<section><h2>LEARNING ARCHIVE <span id="archiveCount" class="hint"></span></h2>
<p class="hint">Historically interesting coins, predictions and audits stay visible. Archived candidates get occasional comeback checks. Pinned tokens and open paper positions stay active.</p>
<div class="asset-view" id="archiveAssets" aria-label="Archived tokens worth learning from"></div>
<div id="archiveQuietWrap"></div>
<p id="trashSummary" class="hint"></p></section></div>
<div class="tab-panel" id="panel-wallet" role="tabpanel" aria-labelledby="tab-wallet" hidden><section><h2>Paper wallet</h2><div id="wallet"></div></section></div>
<div class="tab-panel" id="panel-runs" role="tabpanel" aria-labelledby="tab-runs" hidden><section><h2>Recent runs</h2><div id="runs"></div></section></div>
<div class="tab-panel" id="panel-outcomes" role="tabpanel" aria-labelledby="tab-outcomes" hidden>
<section><h2>OUR SCORE LEARNING JOURNAL</h2>
<p class="hint">Immutable hourly Top 5 snapshots plus three rotating lower-ranked comparison tokens. Same-pool price observations after 15m, 1h, 6h and 24h; NOT executable trade P&amp;L. Missing observations and pool changes are not counted as wins or losses.</p>
<div id="scoreJournal"></div></section>
<section><h2>Original Market Score prediction outcomes</h2><div id="predictions"></div></section></div>
<div class="tab-panel" id="panel-address" role="tabpanel" aria-labelledby="tab-address" hidden>
<section id="address-entry-panel"><h2>Watch an address</h2>
<p class="hint">Pin an exact token contract. Research and prices appear when available; adding an address does not certify it or trade it.</p>
<form id="watchForm"><label for="watchChain">CHAIN<select id="watchChain"><option value="solana">Solana</option><option value="robinhood">Robinhood</option></select></label>
<label for="watchAddress">TOKEN CONTRACT<input id="watchAddress" type="text" autocomplete="off" spellcheck="false" maxlength="100" placeholder="Paste token address" required></label>
<button type="submit" id="watchSubmit">+ WATCH</button></form>
<p id="watchMsg" role="status" aria-live="polite"></p>
<h2>PINNED // WATCHLIST</h2><div id="watchList"></div>
</section></div>
<dialog id="auditDialog" aria-labelledby="auditTitle"><h2 id="auditTitle">TOKEN AUDIT</h2>
<p class="hint">Direct Cloudflare check • stored D1 evidence • no trades.</p>
<div id="auditProgress" role="status" aria-live="polite"></div>
<button id="auditClose" type="button">CLOSE</button></dialog>
<dialog id="greenDialog" aria-labelledby="greenTitle"><h2 id="greenTitle">GREEN LIGHT CHECK</h2>
<div id="greenDetails"></div><button id="greenClose" type="button">CLOSE</button></dialog>
<dialog id="ourScoreDialog" aria-labelledby="ourScoreTitle"><h2 id="ourScoreTitle">OUR SCORE // FACTORS</h2><div id="ourScoreBreakdown"></div><button id="ourScoreClose" type="button">CLOSE</button></dialog>
</div>
<p class="hint">Research only. Top token accounts can include AMM pools, escrows and custodians, not unique holder wallets. Mint checks do not verify liquidity locks or executable exits. Paper trades remain disabled.</p>
<script>
// Authentication uses signed HttpOnly cookies; password exists only during login.
const cell=v=>'<td>'+String(v??'—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))+'</td>';
function table(keys,rows){return '<div class="data-scroll" role="region" aria-label="'+keys.join(' / ')+'" tabindex="0"><table><thead><tr>'+keys.map(k=>'<th>'+k+'</th>').join('')+'</tr></thead><tbody>'+rows.map(r=>'<tr>'+r.map(cell).join('')+'</tr>').join('')+'</tbody></table></div>';}

// Only display preferences go to this device's storage. Never store the login token.
const layoutKey='buyguy.assetColumns.v2',sortKey='buyguy.assetSort.v1',foldKey='buyguy.columnFolds.v1';
// Buying decision -> market structure -> token safety -> contract -> supporting details.
const assetColumns=[
 {key:'symbol',name:'Token',type:'text'},
 {key:'our_score',name:'OUR SCORE',type:'number'},
 {key:'audit',name:'Audit',type:'text'},
 {key:'chain',name:'Chain',type:'text'},
 {key:'price',name:'Price $',type:'number'},
 {key:'liquidity',name:'Liquidity $',type:'number'},
 {key:'market_cap',name:'Cap $',type:'number'},
 {key:'liq_cap_pct',name:'Liq/Cap %',type:'number'},
 {key:'buys_m5',name:'5m buys/sells',type:'number'},
 {key:'momentum',name:'Signal',type:'number'},
 {key:'direction',name:'Direction 1h',type:'number'},
 {key:'score',name:'Market Score',type:'number'},
 {key:'quote_age',name:'Quote age',type:'number'},
 {key:'tier',name:'Lane',type:'text'},
 {key:'status',name:'Status',type:'text'},
 {key:'provider',name:'Provider',type:'text'},
 {key:'safety',name:'Safety Evidence',type:'number'},
 {key:'topBps',name:'Top acct %',type:'number'},
 {key:'address',name:'Copy address',type:'text'},
 {key:'trade_on',name:'Trade on',type:'text'},
 {key:'chart',name:'Chart',type:'text'},
 {key:'socials',name:'Socials',type:'number'},
 {key:'risk',name:'Mint review',type:'text'},
 {key:'flags',name:'Mint/holder flags',type:'text'}
];
const columnByKey=Object.fromEntries(assetColumns.map(c=>[c.key,c]));
const initialColumnKeys=assetColumns.map(c=>c.key);
function storedValue(key){try{return JSON.parse(localStorage.getItem(key)||'null')}catch{return null}}
function saveValue(key,value){try{localStorage.setItem(key,JSON.stringify(value))}catch{}}
function validOrder(maybe){
 const current=Array.isArray(maybe)?maybe.filter((key,index)=>
   typeof key==='string'&&columnByKey[key]&&maybe.indexOf(key)===index):[];
 const order=current.concat(initialColumnKeys.filter(key=>!current.includes(key)));
 // Inject newly introduced columns into saved layouts without resetting other positions.
 if(!current.includes('liq_cap_pct')&&order.includes('market_cap')){
   order.splice(order.indexOf('liq_cap_pct'),1);
   order.splice(order.indexOf('market_cap')+1,0,'liq_cap_pct');
 }
 if(!current.includes('our_score')&&order.includes('symbol')){
   order.splice(order.indexOf('our_score'),1);
   order.splice(order.indexOf('symbol')+1,0,'our_score');
 }
 if(!current.includes('audit')&&order.includes('symbol')){
   order.splice(order.indexOf('audit'),1);
   order.splice(order.indexOf('symbol')+1,0,'audit');
 }
 if(!current.includes('trade_on')&&order.includes('address')){
   order.splice(order.indexOf('trade_on'),1);
   order.splice(order.indexOf('address')+1,0,'trade_on');
 }
 if(!current.includes('chart')&&order.includes('trade_on')){
   order.splice(order.indexOf('chart'),1);
   order.splice(order.indexOf('trade_on')+1,0,'chart');
 }
 return order;
}
const savedFolds=storedValue(foldKey);
let columnFolded={
 socials:savedFolds?.socials===false?false:true,
 flags:savedFolds?.flags===false?false:true
};
function toggleColumnFold(key){
 if(!['socials','flags'].includes(key))return false;
 columnFolded[key]=!columnFolded[key];
 saveValue(foldKey,columnFolded);
 renderAssets();return true;
}
let assetOrder=validOrder(storedValue(layoutKey));
const savedSort=storedValue(sortKey);
let assetSort=(savedSort&&columnByKey[savedSort.key]&&['asc','desc'].includes(savedSort.direction))?
 savedSort:{key:'score',direction:'desc'};
let assetRows=[];
// New default landing page; keep users' new choice across reloads, but migrate
// old v1 research-panel preference to the clearer WHAT'S GOOD? home.
const tabKey='buyguy.activeTab.v2';
const dashboardTabs=['good','research','hot','not','archive','wallet','runs','outcomes','address'];
let activeTab=dashboardTabs.includes(storedValue(tabKey))?storedValue(tabKey):'good';
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
function tokenCell(row){
 const ticker=escapeSocial(row.symbol||'PENDING'),name=row.name?escapeSocial(row.name):'';
 return '<td><strong class="ticker">'+ticker+'</strong>'+(name&&name!==ticker?
   '<span class="hint" style="margin-left:4px;font-weight:800">'+name+'</span>':'')+'</td>';
}
function auditCell(row){
 const address=String(row.asset_key||'');
 if(!address)return '<td>—</td>';
 return '<td><button type="button" class="audit-btn" data-audit-key="'+escapeSocial(address)+
  '" aria-label="Run live audit of '+escapeSocial(row.symbol||'token')+'">⚡ AUDIT</button></td>';
}
// Moby invite URLs and app handoff have repeatedly opened the WRONG token
// (NEETOPIA) on the user's Android device, including with token-specific codes.
// Do not advertise an unverified app deep link for real-money trading.
// Use the exact mint-specific WEBSITE URL, plus the existing Copy address
// button as a safe manual lookup fallback. No buy/sell action is initiated.
function mobyChartUrl(chain,address){
 const token=String(address||'');
 if(chain==='solana'&&/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(token))
   return 'https://mobyscreener.com/solana/'+token;
 if(chain==='robinhood'&&/^0x[0-9a-fA-F]{40}$/.test(token))
   return 'https://www.mobyscreener.com/token/'+token.toLowerCase();
 return null;
}
function tradeOnCell(row){
 const url=mobyChartUrl(row.chain,row.address);
 if(!url)return '<td>—</td>';
 return '<td><a class="moby-chart-link" href="'+escapeSocial(url)+
   '" target="_self" rel="nofollow" referrerpolicy="no-referrer" '+
   'title="Moby WEBSITE for this exact contract (not verified as an in-app deeplink). Check the contract address before trading." '+
   'aria-label="Open '+escapeSocial(row.symbol||'token')+' on Moby website">Moby web ↗</a></td>';
}
// DEX Screener resolves chart pages from exact chain + token contract, not
// ticker/symbol. Do not guess a pool, follow a social URL, or substitute mints.
function dexChartUrl(chain,address){
 const token=String(address||'');
 if(chain==='solana'&&/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(token))
   return 'https://dexscreener.com/solana/'+token;
 if(chain==='robinhood'&&/^0x[0-9a-fA-F]{40}$/.test(token))
   return 'https://dexscreener.com/robinhood/'+token.toLowerCase();
 return null;
}
function chartCell(row){
 const url=dexChartUrl(row.chain,row.address);
 if(!url)return '<td>—</td>';
 return '<td><a class="dex-chart-link" href="'+escapeSocial(url)+
   '" target="_blank" rel="noopener noreferrer nofollow" referrerpolicy="no-referrer" '+
   'title="View this token contract on DEX Screener. If no pool is indexed, DEX Screener may not show a chart." '+
   'aria-label="View DEX Screener chart for '+escapeSocial(row.symbol||'token')+'">View chart ↗</a></td>';
}
function addressCell(row){
 const address=String(row.address||'');
 if(!address)return '<td>—</td>';
 return '<td><button type="button" class="copy-address" data-address="'+escapeSocial(address)+
   '" title="Tap to copy full '+escapeSocial(row.chain)+' token contract" aria-label="Copy full contract address '+escapeSocial(address)+'">'+
   escapeSocial(address.length>23?address.slice(0,9)+'…'+address.slice(-7):address)+' ⧉</button></td>';
}
async function copyAddress(address){
 const status=document.getElementById('copyStatus');
 if(!address){if(status)status.textContent='No address to copy';return false;}
 try{
   if(!navigator.clipboard||!navigator.clipboard.writeText)throw Error('Clipboard API unavailable');
   await navigator.clipboard.writeText(address);
   if(status)status.textContent='Copied full contract: '+address.slice(0,10)+'…';
   return true;
 }catch{
   if(status)status.textContent='Copy blocked by browser; long-press the address or use Chrome clipboard permissions.';
   return false;
 }
}
function socialCell(row){
 if(!row.socialLinks||!row.socialLinks.length)return '<td class="social-cell">—</td>';
 const links=row.socialLinks.map((link,i)=>
   '<a class="social-link'+(columnFolded.socials&&i>=2?' social-extra':'')+
   '" href="'+escapeSocial(link.url)+'" target="_blank" rel="noopener noreferrer nofollow" referrerpolicy="no-referrer" title="Unverified project-supplied social link" aria-label="Open unverified '+escapeSocial(link.label)+' for '+escapeSocial(row.symbol)+'">'+escapeSocial(link.label)+'</a>'
 ).join('');
 const hidden=columnFolded.socials&&row.socialLinks.length>2?
   '<span class="social-count">+'+(row.socialLinks.length-2)+'</span>':'';
 return '<td class="social-cell'+(columnFolded.socials?' folded':' expanded')+'">'+links+hidden+'</td>';
}
function flagsCell(row){
 const content=String(row.flags||'Not fully reviewed'),long=content.length>25;
 if(!long)return '<td class="flags-cell" title="'+escapeSocial(content)+'">'+escapeSocial(content)+'</td>';
 return '<td class="flags-cell '+(columnFolded.flags?'folded':'expanded')+
   '" title="'+escapeSocial(content)+'">'+
   (columnFolded.flags?'<span class="flags-short">'+escapeSocial(content.slice(0,21))+'…</span>':
     '<span class="flags-full">'+escapeSocial(content)+'</span>')+'</td>';
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
 const risky=row.green?.status==='RISK'||status==='MINT_CONTROL_RISK'||status==='HOLDER_CONCENTRATION_RISK'||
   flags.some(x=>x==='MINT_AUTHORITY_ACTIVE'||x==='FREEZE_AUTHORITY_ACTIVE');
 if(risky)score=Math.min(score,25);
 const full=row.green?.green===true; // independently computed seven-stage server gate, not a status flag
 const icon=risky?'🔴':full?'🟢':'🟡';
 const label=risky?'Identified risk':full?'Verified screen':'Partial evidence';
 const detail='Evidence '+score+'/100 (green gate '+(row.green?.passed??0)+'/7): mint '+mint+'/35, token accounts '+
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
   return '<td class="safety-cell"><button type="button" class="green-button" data-green-key="'+escapeSocial(row.asset_key)+'" title="'+escapeSocial(s.detail)+'" aria-label="Inspect green light checklist for '+escapeSocial(row.symbol)+'">'+s.icon+' '+
     (s.score===null?'—':s.score+'/100')+'<span class="green-progress">'+(row.green?.passed??0)+'/7 CHECKS</span></button></td>';
 }
 if(key==='momentum')return '<td class="signal-cell" title="'+escapeSocial(row.signalInfo.label)+'">'+row.signalInfo.icon+'</td>';
 if(key==='direction'){
   const d=row.directionInfo;
   return '<td class="direction-cell" title="'+escapeSocial(d.label)+'"><span class="dir-arrow">'+d.icon+'</span> '+
     (d.value===null?'—':(d.value>=0?'+':'')+d.value.toFixed(1)+'%')+'</td>';
 }
 return '';
}
// Market depth indicator: pool liquidity divided by the reported market cap.
// Never treat missing/zero cap as valid or fabricate a 0% quote.
function liquidityCapPercentage(liquidity,marketCap){
 if(liquidity===null||liquidity===undefined||liquidity===''||marketCap===null||marketCap===undefined||marketCap==='')return null;
 const liq=Number(liquidity),cap=Number(marketCap);
 if(!Number.isFinite(liq)||liq<0||!Number.isFinite(cap)||cap<=0)return null;
 const pct=liq/cap*100;
 return Number.isFinite(pct)?pct:null;
}
function formatLiqCapPct(pct){
 if(pct===null||pct===undefined||!Number.isFinite(pct))return '—';
 return (pct!==0&&pct<0.1?pct.toFixed(3):pct<10?pct.toFixed(2):pct.toFixed(1))+'%';
}
// Only the server-side seven-check gate can verify a lock. Do not infer one
// from Liq/Cap %, token claims, LP supply gaps, burns or partial safety scores.
function verifiedPoolLock(row){
 return Array.isArray(row?.green?.checks)&&
  row.green.checks.some(c=>c?.name==='Pool custody / LP lock'&&c.passed===true);
}
function liqCapCell(row){
 const ratio=formatLiqCapPct(row.liq_cap_pct);
 if(ratio==='—'||!verifiedPoolLock(row))return cell(ratio);
 return '<td>'+ratio+' <span class="lp-lock-verified" role="img" aria-label="Verified pool LP lock" '+
   'title="Recent independent on-chain LP custody and lock verification for the matched pool. Locked share is not quantified; this does not guarantee a successful exit.">🔒</span></td>';
}
// OUR SCORE is a transparent weighted research heuristic, not a predicted return.
// Related metrics are weighted modestly to reduce double-counting. No ticker,
// token unit price, or cosmetic indicator receives points.
const ourScoreWeights=[['Liquidity / Cap',20],['Pool liquidity',15],
 ['Market cap',10],['Buy/sell balance',15],['5m activity',10],
 ['1h trend',10],['Quote freshness',5],['Market Score',5],['Safety Evidence',10]];
const ourNum=v=>v===null||v===undefined||v===''?null:(Number.isFinite(Number(v))?Number(v):null);
const ourClamp=n=>Math.max(0,Math.min(100,n));
function ourScoreAssessment(row){
 const missing={score:null,base:null,factors:[],caveats:['Missing core market evidence.']};
 if(!row||['DEAD','TRASH'].includes(row.status))return missing;
 const liq=ourNum(row.liquidity),cap=ourNum(row.market_cap),
  price=ourNum(row.price),ratio=ourNum(row.liq_cap_pct);
 if(!(liq>0&&cap>0&&price>0&&ratio!==null))return missing;
 const buys=ourNum(row.buys_m5),sells=ourNum(row.sells_m5);
 const volume=buys===null||sells===null?null:buys+sells;
 const trend=ourNum(row.change_h1),age=ourNum(row.quote_age);
 const market=ourNum(row.score),safety=ourNum(row.safety);
 const factors=[];
 function add(name,weight,quality,reason){
  const rating=quality===null?0:Math.round(ourClamp(quality)*10)/10;
  factors.push({name,weight,rating,points:weight*rating/100,
   reason:(quality===null?'Missing data (0 credit). ':'')+reason});
 }
 const ratioRating=ratio<=10?ratio*3.5:ratio<=25?35+(ratio-10)*1.7:
  ratio<=50?60.5+(ratio-25)*1.58:ratio<=100?100:ratio<=200?95:75;
 add('Liquidity / Cap',20,ratioRating,'Quoted USD liquidity relative to market cap; not lock verification.');
 add('Pool liquidity',15,liq>=100000?100:liq>=50000?90:liq>=25000?75:
  liq>=15000?55:liq>=5000?30:5,'Depth of reported USD pool liquidity.');
 add('Market cap',10,cap>=50000&&cap<=250000?100:cap>250000&&cap<=1000000?80:
  cap>1000000&&cap<=10000000?60:cap>10000000?35:cap>=20000?70:30,
  'Early-discovery target; market cap is not intrinsic value.');
 add('Buy/sell balance',15,volume===null||volume<=0?null:
  volume<5?Math.max(0,(buys/volume-.3)*100):ourClamp((buys/volume-.3)*200),
  '5m buy share; trades may be bots or wash activity.');
 add('5m activity',10,volume===null?null:volume>=100?100:volume>=50?85:
  volume>=20?70:volume>=12?55:volume>=5?25:5,'5m transactions, not unique buyers.');
 add('1h trend',10,trend===null?null:trend>150?5:trend>80?35:
  trend>35?75:trend>=0?85+Math.min(trend,12)*1.25:
  trend>=-10?60:trend>=-25?30:5,'Big parabolic spikes and sharp drops score poorly.');
 add('Quote freshness',5,age===null||age<0?null:age<=15?100:
  age<=30?80:age<=60?50:age<=120?20:0,'Minutes since last matched market quote.');
 add('Market Score',5,market,'Existing market model with low weight to avoid double counting.');
 add('Safety Evidence',10,safety,'Independent partial evidence; unknown is not safe.');
 const base=factors.reduce((acc,f)=>acc+f.points,0);let total=base;
 const caveats=[];
 function limit(max,explanation){if(total>max)total=max;caveats.push(explanation);}
 if(safety===null)limit(75,'No completed safety evidence: maximum 75.');
 if(liq<15000)limit(40,'Thin pool (<$15k): maximum 40.');
 if(ratio>200)limit(70,'Ratio >200% requires cap verification: maximum 70.');
 if(trend!==null&&trend>150)limit(60,'1h spike over 150%: maximum 60.');
 if(age===null||age<0||age>120)limit(35,'Stale or missing quote: maximum 35.');
 else if(age>30)limit(65,'Quote older than 30 minutes: maximum 65.');
 if(row.green?.status==='RISK'||['MINT_CONTROL_RISK','HOLDER_CONCENTRATION_RISK'].includes(row.risk_status))
  limit(15,'On-chain safety risk flagged: maximum 15.');
 if(row.topBps!==null&&row.topBps!==undefined&&Number(row.topBps)>4000)
  limit(35,'Largest token account >40% of supply: maximum 35.');
 return {score:Math.round(total*10)/10,base:Math.round(base*10)/10,factors,caveats};
}
function ourScoreCell(row){
 const value=row.our_score===null||row.our_score===undefined?'—':row.our_score.toFixed(1);
 return '<td><button type="button" class="our-score-btn" data-our-key="'+
  escapeSocial(row.asset_key||'')+'" aria-label="OUR SCORE breakdown for '+
  escapeSocial(row.symbol||'token')+'" title="View factor weights and rankings">'+value+'</button></td>';
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
 const enriched={...a,liq_cap_pct:liquidityCapPercentage(a.liquidity,a.market_cap),
   buys_m5:Number(a.buys_m5)||0,sells_m5:Number(a.sells_m5)||0,
   tier:a.tier||'NOT',tier_reason:a.tier_reason||'QUOTE_UNVERIFIED',quote_age:a.quote_age??null,
   socials:socialLinks.length,socialLinks,
   safety:safetyInfo.score,momentum:signalInfo.rank,direction:directionInfo.value,
   safetyInfo,signalInfo,directionInfo,
   topBps,risk:a.risk_status||'UNVERIFIED',flags:flags.join(', ')||'Not fully reviewed'};
 const ranked=ourScoreAssessment(enriched);
 return {...enriched,our_score:ranked.score,ourScoreInfo:ranked};
}
function formatUsd(raw){
 if(raw===null||raw===undefined||raw==='')return '—';
 const n=Number(raw);
 if(!Number.isFinite(n))return '—';
 return '$'+(Math.abs(n)>0&&Math.abs(n)<0.0001?n.toPrecision(4):
   new Intl.NumberFormat('en-US',{maximumFractionDigits:Math.abs(n)<1?6:2}).format(n));
}
function columnValue(row,key){
 if(key==='liq_cap_pct')return formatLiqCapPct(row.liq_cap_pct);
 if(key==='buys_m5')return row.buys_m5+'/'+row.sells_m5;
 if(key==='topBps')return row.topBps===null?'Unknown':(row.topBps/100).toFixed(1)+'%';
 if(key==='quote_age')return row.quote_age===null?'—':row.quote_age+'m';
 if(key==='tier')return row.tier==='HOT'?'🔥 HOT':'🥱 NOT';
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
 columnFolded={socials:true,flags:true};saveValue(foldKey,columnFolded);
 assetSort={key:'score',direction:'desc'};
 saveValue(layoutKey,assetOrder);saveValue(sortKey,assetSort);
 renderAssets();
}
function moveColumnByStep(key,step){
 const i=assetOrder.indexOf(key),next=assetOrder[i+step];
 if(!next)return false;
 return moveAssetColumn(key,next,step>0);
}
function moveColumnToEnd(key){
 if(!columnByKey[key])return false;
 assetOrder=assetOrder.filter(item=>item!==key).concat(key);
 saveValue(layoutKey,assetOrder);renderAssets();return true;
}
function setAssetData(records,routes=[]){assetRows=(Array.isArray(records)?records:[]).map(a=>assetRow(a,routes));renderAssets();renderGood()}
// WHAT'S GOOD? deliberately uses only fresh, chain-address-validated market records.
// Do not promote risks, stale data, archived assets or missing-cap tokens just
// to make the top five. OUR SCORE itself remains a heuristic, not a buy signal.
function goodVerdict(row){
 const age=ourNum(row.quote_age),liq=ourNum(row.liquidity),
  buys=ourNum(row.buys_m5),sells=ourNum(row.sells_m5),
  change=ourNum(row.change_h1),safety=ourNum(row.safety);
 if(row.green?.status==='RISK'||['MINT_CONTROL_RISK','HOLDER_CONCENTRATION_RISK'].includes(row.risk_status))
  return {label:'AVOID',tone:'caution',reason:'Critical on-chain risk evidence outweighs momentum.'};
 if(age===null||age>30||liq===null||liq<15000)
  return {label:'CAUTION',tone:'caution',reason:'Market data or pool depth is not strong enough for a live watch.'};
 if(change!==null&&change>80)
  return {label:'CAUTION',tone:'caution',reason:'Large one-hour spike — potential late-entry or reversal risk.'};
 if(safety===null||safety<35)
  return {label:'CAUTION',tone:'caution',reason:'Market momentum may be real, but safety evidence is incomplete.'};
 if(row.our_score>=78&&row.tier==='HOT'&&age<=20&&liq>=50000&&
    buys!==null&&sells!==null&&buys>=10&&buys>=1.25*Math.max(1,sells))
  return {label:'BUY WATCH',tone:'',reason:'Strong recent activity and relatively deep liquidity merit a closer look, not an automatic buy.'};
 if(row.our_score>=68&&row.tier==='HOT')
  return {label:'RISING',tone:'',reason:'Recent buying conditions are strengthening, pending confirmation.'};
 if(row.our_score>=55)
  return {label:'WAIT',tone:'',reason:'Worth monitoring, but conviction or follow-through is insufficient.'};
 return {label:'CAUTION',tone:'caution',reason:'Low composite ranking; not an immediate priority.'};
}
function goodReasons(row){
 const positive=[],cautions=[];
 const buys=ourNum(row.buys_m5),sells=ourNum(row.sells_m5),
  age=ourNum(row.quote_age),liq=ourNum(row.liquidity),
  move=ourNum(row.change_h1),ratio=ourNum(row.liq_cap_pct);
 if(buys!==null&&sells!==null&&buys>=8&&buys>=1.25*Math.max(1,sells))
  positive.push('5m buying trades exceed selling trades');
 if(liq!==null&&liq>=50000)positive.push('pool liquidity at least $50k');
 if(ratio!==null&&ratio>=25&&ratio<=200)
  positive.push('liquidity is '+formatLiqCapPct(ratio)+' of reported cap');
 if(age!==null&&age<=15)positive.push('recent quote');
 if(row.tier==='HOT')positive.push('HOT momentum screen');
 if(!positive.length)positive.push('meets the minimum current-data screen');
 if(row.safety===null||row.safety<35)cautions.push('safety evidence limited');
 if(!verifiedPoolLock(row))cautions.push('LP lock not independently verified');
 if(liq!==null&&liq<50000)cautions.push('pool liquidity below $50k');
 if(buys===null||sells===null||buys<=sells)cautions.push('buying pressure not yet convincing');
 if(move!==null&&move>35)cautions.push('1h move may be extended');
 if(row.topBps!==null&&row.topBps!==undefined&&Number(row.topBps)>2000)
  cautions.push('large token-account concentration; owners unconfirmed');
 if(row.green?.status==='RISK')cautions.push('on-chain risk flag');
 if(!cautions.length)cautions.push('trade execution and beneficial ownership not fully verified');
 return {why:positive.slice(0,3).join(' · '),risk:cautions.slice(0,3).join(' · ')};
}
function goodCandidates(rows=assetRows){
 return (Array.isArray(rows)?rows:[]).filter(row=>{
  // A name or ticker is not a trading identity. Require chain + exact contract
  // before surfacing actionable chart/audit shortcuts.
  if(!dexChartUrl(row.chain,row.address) ||
     row.asset_key!==(row.chain+':'+(row.chain==='robinhood'?String(row.address).toLowerCase():String(row.address))))
    return false;
  const liq=ourNum(row.liquidity),age=ourNum(row.quote_age),
   buy=ourNum(row.buys_m5),sell=ourNum(row.sells_m5),cap=ourNum(row.market_cap);
  return ['ALIVE','STATIC'].includes(row.status)&&
   row.our_score!==null&&Number.isFinite(row.our_score)&&
   row.our_score>=35&&liq!==null&&liq>=15000&&
   cap!==null&&cap>0&&age!==null&&age>=0&&age<=30&&
   buy!==null&&sell!==null&&buy+sell>=5&&
   row.green?.status!=='RISK'&&
   !['MINT_CONTROL_RISK','HOLDER_CONCENTRATION_RISK'].includes(row.risk_status);
 }).sort((a,b)=>b.our_score-a.our_score||
   (ourNum(b.liquidity)||0)-(ourNum(a.liquidity)||0)||
   String(a.asset_key||'').localeCompare(String(b.asset_key||''))).slice(0,5);
}
function renderGood(){
 const wrap=document.getElementById('goodCards');
 if(!wrap)return;
 const picks=goodCandidates();
 const label=document.getElementById('goodCount');
 if(label)label.textContent='('+picks.length+'/5)';
 if(!picks.length){
  wrap.innerHTML='<p class="good-empty">No currently qualified candidates. BuyGuy has not verified enough fresh, liquid activity to highlight a token. Check HOT or full research for the underlying observations.</p>';
  return;
 }
 wrap.innerHTML=picks.map((row,i)=>{
  const verdict=goodVerdict(row),proof=goodReasons(row),url=dexChartUrl(row.chain,row.address);
  const link=url?'<a href="'+escapeSocial(url)+'" target="_blank" rel="noopener noreferrer nofollow" referrerpolicy="no-referrer">Chart ↗</a>':'';
  const name=escapeSocial(row.symbol||'Unnamed token'),key=escapeSocial(row.asset_key||'');
  return '<article class="good-item"><h3><span>#'+(i+1)+' '+name+'</span><span class="good-grade">'+row.our_score.toFixed(1)+'/100</span></h3>'+
    '<span class="good-verdict '+verdict.tone+'">'+verdict.label+'</span>'+
    '<p><strong>Why:</strong> '+escapeSocial(proof.why)+'.</p>'+
    '<p><strong>Watch out:</strong> '+escapeSocial(proof.risk)+'.</p>'+
    '<p class="good-meta">'+escapeSocial(row.chain)+' · Liq '+formatUsd(row.liquidity)+
     ' · Liq/Cap '+formatLiqCapPct(row.liq_cap_pct)+' · 5m '+row.buys_m5+'/'+row.sells_m5+
     ' · Quote '+(ourNum(row.quote_age)===null?'unknown':ourNum(row.quote_age)+'m')+'</p>'+
    '<p class="hint">'+escapeSocial(verdict.reason)+'</p>'+
    '<div class="good-actions"><button type="button" data-our-key="'+key+'">Why this score?</button>'+
    '<button type="button" data-green-key="'+key+'">Safety checks</button>'+
    '<button type="button" data-audit-key="'+key+'">Run audit</button>'+link+'</div></article>';
 }).join('');
}

function archiveLesson(a){
 if(Number(a.paper_count)>0)return 'Paper trading case study';
 if(Number(a.prediction_count)>0)return 'Prediction outcome';
 if(Number(a.research_count)>0)return 'Contract or liquidity research';
 if(Number(a.peak_score)>=60)return 'Historic momentum';
 if(Number(a.observations)>=10)return 'Extended market history';
 return null;
}
function archiveTable(items){
 if(!items.length)return '<p class="hint">No archived tokens in this group.</p>';
 const head='<thead><tr><th>Token</th><th>Chain</th><th>Peak market score</th><th>Quotes</th><th>Lesson</th><th>Last seen</th><th>Archive reason</th><th>Chart</th><th>Address</th></tr></thead>';
 return '<table>'+head+'<tbody>'+items.map(a=>'<tr>'+tokenCell(a)+cell(a.chain)+
    cell(a.peak_score??'—')+cell(a.observations??0)+
    cell(archiveLesson(a)||'Low-signal reference')+cell(a.last_seen||'No verified quote')+
    cell(a.last_action||'Quiet background')+chartCell(a)+addressCell(a)+'</tr>').join('')+
  '</tbody></table>';
}
function renderArchive(records,totals={}){
 const entries=Array.isArray(records)?records:[],learning=[],quiet=[];
 for(const a of entries)(archiveLesson(a)?learning:quiet).push(a);
 document.getElementById('archiveAssets').innerHTML=archiveTable(learning);
 document.getElementById('archiveQuietWrap').innerHTML='<details><summary>Quiet storage ('+
   quiet.length+' shown) — low current learning value</summary>'+
   '<div class="asset-view" id="archiveQuietAssets">'+archiveTable(quiet)+'</div></details>';
 document.getElementById('archiveCount').textContent='('+Number(totals.dead??entries.length)+')';
 document.getElementById('trashSummary').textContent='TRASH: '+
   Number(totals.trash??0)+' unresolved/no-data entries excluded from scans. No history deleted.';
}

let drag=null,suppressSortUntil=0;
function headerAt(x,y){
 const hits=document.elementsFromPoint?document.elementsFromPoint(x,y):[document.elementFromPoint(x,y)];
 for(const node of hits){
   const th=node&&node.closest?node.closest('th[data-col]'):null;
   if(th&&['assets','hotAssets','notAssets'].some(id=>document.getElementById(id)?.contains(th)))return th;
 }
 return null;
}
function clearDropHighlight(){
 document.querySelectorAll('#assets th, #hotAssets th, #notAssets th').forEach(th=>th.classList.remove('drop-target','drag-active'));
}
function renderAssets(){
 for(const [view,id] of [['all','assets'],['hot','hotAssets'],['not','notAssets']]){
 const wrap=document.getElementById(id);
 if(!wrap)continue;
 const left=wrap.scrollLeft,top=wrap.scrollTop;
 const colHtml=assetOrder.map(key=>{
   const c=columnByKey[key],active=assetSort.key===key;
   const indicator=active?(assetSort.direction==='asc'?' ▲':' ▼'):' ↕';
   const aria=active?(assetSort.direction==='asc'?'ascending':'descending'):'none';
   // Mobile: explicit repositioning buttons for unusually wide supporting columns.
   const controls=['socials','flags'].includes(key)?
     '<span class="head-controls">'+
     '<button type="button" class="head-step" data-step="-1" aria-label="Move '+c.name+' left">‹</button>'+
     '<button type="button" class="head-step" data-step="1" aria-label="Move '+c.name+' right">›</button>'+
     '<button type="button" class="head-end" aria-label="Move '+c.name+' to last column">⇥</button>'+
     '<button type="button" class="head-fold" data-fold-col="'+key+'" aria-expanded="'+
       String(!columnFolded[key])+'" aria-label="'+(columnFolded[key]?'Expand ':'Collapse ')+c.name+
       '">'+(columnFolded[key]?'⊞':'⊟')+'</button></span>':'';
   return '<th scope="col" tabindex="0" data-col="'+key+'" aria-sort="'+aria+
     '" aria-label="Sort by '+c.name+'; drag to move"><span class="head-label">'+c.name+
     '<span class="sort-indicator" aria-hidden="true">'+indicator+'</span></span>'+controls+'</th>';
 }).join('');
 const rows=orderedAssetRows().filter(row=>view==='all'||(view==='hot')===(row.tier==='HOT')).map(row=>'<tr>'+assetOrder.map(key=>
 key==='socials'?socialCell(row):key==='flags'?flagsCell(row):key==='audit'?auditCell(row):key==='address'?addressCell(row):key==='trade_on'?tradeOnCell(row):key==='chart'?chartCell(row):key==='liq_cap_pct'?liqCapCell(row):key==='our_score'?ourScoreCell(row):key==='symbol'?tokenCell(row):
 ['safety','momentum','direction'].includes(key)?indicatorCell(row,key):cell(columnValue(row,key))
 ).join('')+'</tr>').join('');
 wrap.innerHTML='<table><thead><tr>'+colHtml+'</tr></thead><tbody>'+rows+'</tbody></table>';
 wrap.scrollLeft=left;wrap.scrollTop=top;
 wrap.querySelectorAll('th[data-col]').forEach(th=>{
   th.querySelectorAll('.head-controls button').forEach(btn=>{
     btn.addEventListener('pointerdown',e=>e.stopPropagation());
     btn.addEventListener('click',e=>{
       e.stopPropagation();e.preventDefault();
       const key=th.dataset.col;
       if(btn.classList.contains('head-step'))moveColumnByStep(key,Number(btn.dataset.step));
       else if(btn.classList.contains('head-end'))moveColumnToEnd(key);
       else if(btn.classList.contains('head-fold'))toggleColumnFold(key);
       const status=document.getElementById('assetOrderStatus');
       if(status)status.textContent='Column preference saved on this device.';
     });
   });
   th.addEventListener('click',e=>{
     if(e.target?.closest?.('.head-controls'))return;
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
     if(e.target?.closest?.('.head-controls'))return;
     if(e.button!==undefined&&e.button!==0)return;
     drag={key:th.dataset.col,pointerId:e.pointerId,startX:e.clientX,startY:e.clientY,moving:false,x:e.clientX,y:e.clientY};
     try{th.setPointerCapture(e.pointerId)}catch{}
   });
   th.addEventListener('pointermove',e=>{
     if(e.target?.closest?.('.head-controls'))return;
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
 }
 const status=document.getElementById('assetOrderStatus');
 if(status&&!assetRows.length)status.textContent='No token data returned.';
 else if(status&&assetRows.length&&!status.textContent)status.textContent='Sorting '+columnByKey[assetSort.key].name+' '+(assetSort.direction==='asc'?'ascending':'descending')+'.';
}
// Countdown is anchored to a real recorded scan; it is not a guaranteed run time.
let scanClockAnchor=null,scanClockStatus=null;
function scanCountdown(lastStarted,now=Date.now()){
 const time=Date.parse(lastStarted||'');
 if(!Number.isFinite(time)||time>now+60000)return {text:'NEXT SCAN --:--',overdue:false,unknown:true};
 const seconds=Math.floor((time+600000-now)/1000);
 const late=seconds<0;
 const magnitude=late?-seconds:seconds;
 const mm=String(Math.floor(magnitude/60)).padStart(2,'0');
 const ss=String(magnitude%60).padStart(2,'0');
 return {text:(late?'OVERDUE +':'NEXT ')+mm+':'+ss,
   overdue:late,unknown:false};
}
function showScanCountdown(){
 const clock=document.getElementById('scanClock');
 if(!clock)return;
 const state=scanCountdown(scanClockAnchor);
 clock.textContent=state.text;
 clock.classList.toggle('overdue',state.overdue);
 clock.classList.toggle('unknown',state.unknown);
 const status=scanClockStatus?' · '+scanClockStatus:'';
 clock.title='Approx. 10 minutes after last recorded scan'+status+'. Actual Cloudflare runs can be late.';
}
async function pollScanClock(){
 // Lightweight timestamp-only endpoint prevents a full 500-asset D1 query every 30 seconds.
 if(document.getElementById('board')?.style.display==='none')return;
 try{
   const response=await fetch('/api/scan-clock',{credentials:'same-origin',cache:'no-store'});
   if(!response.ok)return;
   const data=await response.json();
   if(data.started_at)scanClockAnchor=data.started_at;
   scanClockStatus=data.state||null;
   showScanCountdown();
 }catch{}
}
if(typeof setInterval==='function'){
 setInterval(showScanCountdown,1000);
 setInterval(pollScanClock,30000);
}
function scoreJournalTable(rows,state){
 if(state!=='READY')return '<p class="hint">OUR SCORE journal: '+escapeSocial(state==='SCHEMA_PENDING'?'awaiting D1 schema activation':state==='UNAVAILABLE'?'temporarily unavailable':state)+'. No historical performance claims yet.</p>';
 if(!Array.isArray(rows)||!rows.length)
   return '<p class="hint">No immutable OUR SCORE snapshots yet. The first set can appear after a successful hourly research cycle.</p>';
 const minutes=[15,60,360,1440],snapshots=new Map();
 for(const r of rows){
  if(!snapshots.has(r.id))snapshots.set(r.id,{...r,results:new Map()});
  snapshots.get(r.id).results.set(r.horizon_min,r);
 }
 const counts={observed:0,positive:0,missed:0};
 const oneHour={TOP5:[],COMPARATOR:[]};
 const data=[...snapshots.values()].map(s=>{
  const results=minutes.map(h=>{
   const r=s.results.get(h);
   if(!r)return '—';
   if(r.status==='EVALUATED'&&r.return_pct!==null&&Number.isFinite(Number(r.return_pct))){
    counts.observed++;if(Number(r.return_pct)>0)counts.positive++;
    const value=Number(r.return_pct);
    if(h===60)oneHour[s.cohort==='COMPARATOR'?'COMPARATOR':'TOP5'].push(value);
    return (value>=0?'+':'')+value.toFixed(1)+'%';
   }
   if(r.status==='MISSED_DATA')counts.missed++;
   return r.status==='POOL_CHANGED'?'Pool changed':r.status==='MISSED_DATA'?'Missing':'Pending';
  });
  return [s.captured_at,s.cohort==='COMPARATOR'?'Comparison':'Top 5',s.symbol||s.asset_key,s.our_score+'/100',...results];
 });
 const mean=list=>list.length?(list.reduce((sum,v)=>sum+v,0)/list.length):null;
 const leader=mean(oneHour.TOP5),control=mean(oneHour.COMPARATOR);
 const comparison=leader===null||control===null?'Comparison not yet measurable on both groups.':
  '1h indicative mean: Top 5 '+leader.toFixed(1)+'% (n='+oneHour.TOP5.length+
  '), lower-ranked controls '+control.toFixed(1)+'% (n='+oneHour.COMPARATOR.length+').';
 return '<p class="hint">'+counts.observed+' measured horizon observations; '+counts.positive+
  ' positive, '+(counts.observed-counts.positive)+' flat/negative; '+counts.missed+
  ' missed. '+comparison+' Small, incomplete samples are not proof of prediction or executable P&amp;L.</p>'+
  table(['Snapshot UTC','Group','Token','OUR SCORE','15m','1h','6h','24h'],data);
}
// D1 Free daily allowance normally resets at 00:00 UTC. This is an estimate,
// not proof that a particular database is healthy or its quota has recovered.
let d1QuotaBlocked=false;
// Remember the quota error for this UTC day so the password screen can show
// the countdown after reload without saving any credentials.
const d1QuotaKey='buyguy-d1-quota-day';
const utcDay=()=>new Date().toISOString().slice(0,10);
try{d1QuotaBlocked=sessionStorage.getItem(d1QuotaKey)===utcDay();}catch{}
function setD1QuotaBlocked(blocked){
 d1QuotaBlocked=blocked;
 try{if(blocked)sessionStorage.setItem(d1QuotaKey,utcDay());
 else sessionStorage.removeItem(d1QuotaKey);}catch{}
 updateD1ResetCountdown();
}

function updateD1ResetCountdown(){
 const node=document.getElementById('d1ResetClock');
 if(!node)return;
 node.style.display=d1QuotaBlocked?'block':'none';
 if(!d1QuotaBlocked)return;
 const now=Date.now(),next=Math.floor(now/86400000)*86400000+86400000;
 const seconds=Math.max(0,Math.ceil((next-now)/1000));
 const hh=String(Math.floor(seconds/3600)).padStart(2,'0');
 const mm=String(Math.floor(seconds%3600/60)).padStart(2,'0');
 const ss=String(seconds%60).padStart(2,'0');
 node.textContent='D1 estimated UTC quota reset in '+hh+':'+mm+':'+ss+' (00:00 UTC). Refresh after reset to verify recovery.';
}
if(typeof setInterval==='function')setInterval(updateD1ResetCountdown,1000);
if(typeof queueMicrotask==='function')queueMicrotask(updateD1ResetCountdown);
async function refresh(){try{
 const r=await fetch('/api/status',{credentials:'same-origin',cache:'no-store'});
 if(r.status===401){
   document.getElementById('board').style.display='none';
   document.getElementById('login').style.display='block';
   return false;
 }
 if(!r.ok){
   let message='HTTP '+r.status;
   try{const failure=await r.json();
     if(failure.error==='D1_READ_QUOTA'){
       setD1QuotaBlocked(true);
       message='Cloudflare D1 daily row-read allowance exhausted. Live rankings unavailable until midnight UTC reset.';
     }
   }catch{}
   throw Error(message);
 }
 const x=await r.json();
 setD1QuotaBlocked(false);
 document.getElementById('login').style.display='none';
 document.getElementById('board').style.display='block';
 document.getElementById('msg').textContent='';
 const live=document.getElementById('goodDataStatus');
 if(live)live.textContent='Dashboard market data refreshed at '+new Date().toLocaleTimeString()+'. Always check quote age.';
 const recent=x.runs?.[0]||{},elapsed=recent.started_at?Math.round((Date.now()-Date.parse(recent.started_at))/60000):null;
 if(recent.started_at)scanClockAnchor=recent.started_at;
 scanClockStatus=recent.state||null;
 showScanCountdown();
 const coverage=x.coverage||{};
 const items=[
   'Cash: USD '+Number(x.wallet?.cash??0).toFixed(2),
   'Discovery: '+(recent.state??'None')+(elapsed===null?'':' ('+elapsed+'m ago)'),
   'Active: '+Number(coverage.total??x.assets?.length??0),
   'HOT: '+Number(coverage.hot??0),
   'Cooling: '+Number(coverage.not??0),
   'Archived: '+Number(x.archiveStats?.dead??0),
   'Fresh 30m: '+Number(coverage.fresh30??0)+' / '+Number(coverage.total??0)
 ];
 document.getElementById('overview').innerHTML=items.map(s=>'<span class="stat">'+s+'</span>').join('');
 const hotLabel=document.getElementById('hotCount');
 const notLabel=document.getElementById('notCount');
 if(hotLabel)hotLabel.textContent='('+Number(coverage.hot??0)+')';
 if(notLabel)notLabel.textContent='('+Number(coverage.not??0)+')';
 document.getElementById('watchList').innerHTML=watchlistTable(x.pinned);
 document.getElementById('runs').innerHTML=table(['UTC','Status','Assets','Errors'],(x.runs||[]).map(v=>[v.started_at,v.state,v.observed,v.provider_errors]));
 setAssetData(x.assets,x.routes);
 renderArchive(x.archive,x.archiveStats);
 document.getElementById('routeReviews').innerHTML=table(['UTC','Mint','Result','Approx. round-trip loss','Top impact'],(x.routes||[]).map(r=>{
 let report={};try{report=JSON.parse(r.note||'{}')}catch{}
 return [r.at,r.asset_key,report.label||'Unknown',report.estimatedRoundTripLossPct===null||report.estimatedRoundTripLossPct===undefined?'Unknown':report.estimatedRoundTripLossPct+'%',report.maxImpactPct===null||report.maxImpactPct===undefined?'Unknown':report.maxImpactPct+'%'];
 }));
 document.getElementById('wallet').innerHTML=table(['Starting','Cash','Realised P&L','Estimated equity','Stale marks'],[[
 x.paper?.starting_cash,x.paper?.cash,x.paper?.realised,x.paper?.estimated_total===null?'Unknown':x.paper?.estimated_total,x.paper?.unknown_marks]])+
 table(['Token','Cost USD','Est. sale value','Unrealised P&L','Price stale'],(x.paper?.positions||[]).map(p=>[
 p.asset_key,p.cost,p.estimatedValue===null?'Unknown':p.estimatedValue,p.unrealized===null?'Unknown':p.unrealized,p.stale]));
 document.getElementById('predictions').innerHTML=table(['Token','Status','Horizon min','Change %'],(x.predictions||[]).map(p=>[p.asset_key,p.status,p.horizon_min,p.change_pct]));
 document.getElementById('scoreJournal').innerHTML=scoreJournalTable(x.scoreJournal,x.scoreJournalStatus||'UNAVAILABLE');
}catch(e){
 document.getElementById('msg').textContent='Service error: '+e.message;
 const live=document.getElementById('goodDataStatus');
 if(live)live.textContent='LIVE RANKING UNAVAILABLE: '+e.message;
 const cards=document.getElementById('goodCards');
 if(cards)cards.innerHTML='<p class="good-empty">Market data could not be verified. No live shortlist is available. Historical quotes may be stale.</p>';
 const count=document.getElementById('goodCount');
 if(count)count.textContent='(unavailable)';
 return false;
}
return true;
}
async function login(){
 const input=document.getElementById('pass'),button=document.getElementById('enter');
 const password=input.value,remember=document.getElementById('remember').checked;
 input.value='';
 if(!password){document.getElementById('msg').textContent='Enter your password.';return;}
 button.disabled=true;
 document.getElementById('msg').textContent='Signing in…';
 try{
   const r=await fetch('/api/login',{method:'POST',credentials:'same-origin',
     headers:{'content-type':'application/json'},body:JSON.stringify({password,remember})});
   if(!r.ok){document.getElementById('msg').textContent=r.status===401?'Incorrect password.':'Login unavailable. Try again.';return;}
   await refresh();
 }catch(e){document.getElementById('msg').textContent='Unable to connect. Try again.';}
 finally{button.disabled=false;}
}
async function logout(){
 try{await fetch('/api/logout',{method:'POST',credentials:'same-origin'});}catch{}
 document.getElementById('board').style.display='none';
 document.getElementById('login').style.display='block';
 document.getElementById('msg').textContent='Signed out on this device.';
}
document.getElementById('enter').onclick=login;
document.getElementById('pass').addEventListener('keydown',e=>{if(e.key==='Enter')login();});
document.getElementById('logout').onclick=logout;
document.getElementById('refresh').onclick=refresh;
document.getElementById('sortOurScore').onclick=()=>{assetSort={key:'our_score',direction:'desc'};saveValue(sortKey,assetSort);renderAssets();};
document.getElementById('goodResearch').onclick=()=>{activateTab('research',{focus:true});assetSort={key:'our_score',direction:'desc'};saveValue(sortKey,assetSort);renderAssets();};
document.getElementById('resetAssetColumns').onclick=()=>{resetAssetColumns();document.getElementById('assetOrderStatus').textContent='Default layout restored.'};
function inspectOurScore(key){
 const row=assetRows.find(r=>r.asset_key===key);
 if(!row)return;
 const dialog=document.getElementById('ourScoreDialog');
 const out=document.getElementById('ourScoreBreakdown');
 if(!dialog||!out)return;
 const info=row.ourScoreInfo;
 let body='<p><strong>'+escapeSocial(row.symbol||row.asset_key)+'</strong> · '+
  (info.score===null?'UNRANKED':info.score.toFixed(1)+'/100')+'</p>';
 if(info.factors.length){
  body+='<table><thead><tr><th>Factor</th><th>Rating</th><th>Weight</th><th>Points</th></tr></thead><tbody>'+
   info.factors.map(f=>'<tr title="'+escapeSocial(f.reason)+'"><td>'+escapeSocial(f.name)+
   '</td><td>'+f.rating.toFixed(1)+'/100</td><td>'+f.weight+'%</td><td>'+
   f.points.toFixed(2)+'</td></tr>').join('')+'</tbody></table>'+
   '<p>Weighted total before limits: '+info.base.toFixed(1)+'/100</p>'+
   info.factors.map(f=>'<p class="hint"><strong>'+escapeSocial(f.name)+
     ':</strong> '+escapeSocial(f.reason)+'</p>').join('');
 }else body+='<p>Core liquidity, cap or price data unavailable.</p>';
 if(info.caveats.length)body+='<p><strong>Adjustments:</strong> '+
  escapeSocial(info.caveats.join(' '))+'</p>';
 out.innerHTML=body+'<p class="hint">Research ranking only. Not a safety guarantee or forecast. Verify contract, pool and sell routes.</p>';
 if(!dialog.open)dialog.showModal();
}
function inspectGreen(key){
 const row=assetRows.find(x=>x.asset_key===key);
 if(!row)return;
 const gate=row.green;
 const dialog=document.getElementById('greenDialog'),details=document.getElementById('greenDetails');
 if(!dialog||!details)return;
 const title=escapeSocial(row.symbol||row.asset_key);
 if(!gate){details.textContent='No verified green-light evaluation is available.';dialog.showModal();return;}
 const icon=gate.status==='RISK'?'🔴':gate.green?'🟢':gate.status==='UNASSESSED'?'⚫':'🟡';
 details.innerHTML='<p><strong>'+title+'</strong> '+icon+' <strong>'+gate.passed+'/'+gate.total+
  ' checks</strong> · '+escapeSocial(gate.status)+'</p>'+
  gate.checks.map(c=>'<div class="audit-check"><div class="audit-title">'+(c.passed?'✓ ':'✕ ')+
  escapeSocial(c.name)+'</div><div class="audit-detail">'+escapeSocial(c.reason)+'</div></div>').join('')+
  '<p class="hint">'+(gate.partial_probes?.uniqueAuthorityCount!==null&&gate.partial_probes?.uniqueAuthorityCount!==undefined?
   'Owner sample: '+escapeSocial(gate.partial_probes.uniqueAuthorityCount)+' account authorities. ':'')+
   (gate.partial_probes?.poolAccountProgram?'Pool program: '+escapeSocial(gate.partial_probes.poolAccountProgram)+'. ':'')+
   (gate.partial_probes?.poolVaultsVerified?'✓ Verified Raydium CPMM vault identities. ':'')+
   (gate.partial_probes?.excludedVerifiedVaultAccounts>0?
     'Excluded verified pool vault token accounts: '+Number(gate.partial_probes.excludedVerifiedVaultAccounts)+'. ':'')+
   (gate.partial_probes?.poolProtocol?'Protocol: '+escapeSocial(gate.partial_probes.poolProtocol)+'. ':'')+
   (gate.partial_probes?.migrationStatus?
      'Migration profile: '+escapeSocial(gate.partial_probes.migrationStatus)+'. ':'')+
   (gate.partial_probes?.canonicalMigrationBurnPattern?
      'Canonical Pump authority + zero LP mint supply verified. ':'')+
   (gate.partial_probes?.migrationTxVerified?
     '✓ Historical Pump migrate transaction independently verified. ':
     'Historical migrate transaction not confirmed. ')+
   (gate.partial_probes?.programGovernance?
     'Code governance: '+escapeSocial(gate.partial_probes.programGovernance)+
     (gate.partial_probes.programUpgradeAuthorityPresent===true?' (upgrade authority present). ':' . '):'')+
   (Number.isFinite(gate.partial_probes?.lpSupplyGapBps)?
     'LP supply difference: '+(gate.partial_probes.lpSupplyGapBps/100).toFixed(1)+'% (not a confirmed lock). ':'')+
   escapeSocial(gate.partial_probes?.caveat||'')+'</p>'+
  '<p class="hint">'+escapeSocial(gate.warning)+'</p>'+
  '<p class="hint">Read-only screening. No real or paper order was placed by this check.</p>';
 if(!dialog.open)dialog.showModal();
}
let auditInProgress=false;
const auditStages=[['market','01 MARKET'],['mint','02 MINT + HOLDERS'],
 ['pool','03 POOL + ADMIN'],['route','04 BUY / SELL ROUTE']];
async function runAuditFromTable(key){
 if(auditInProgress)return;
 const asset=assetRows.find(x=>x.asset_key===key);
 if(!asset)return;
 const dialog=document.getElementById('auditDialog');
 const progress=document.getElementById('auditProgress');
 if(!dialog||!progress)return;
 auditInProgress=true;
 progress.textContent='AUDIT // '+(asset.symbol||'TOKEN')+String.fromCharCode(10)+key+
  String.fromCharCode(10)+'Exact contract only. No buy/sell orders.'+String.fromCharCode(10);
 if(!dialog.open)dialog.showModal();
 const append=(title,message,type)=>{
   const elem=document.createElement('div');
   elem.className='audit-row';
   const name=document.createElement('strong');name.textContent=title;
   const status=document.createElement('div');status.className='audit-status';
   status.textContent=(type||'')+' '+message;
   elem.append(name,status);progress.append(elem);
 };
 for(const [stage,label] of auditStages){
   append(label,'Checking provider…','⌛');
   const active=progress.lastChild?.lastChild;
   try{
     const result=await fetch('/api/audit',{method:'POST',credentials:'same-origin',
       headers:{'content-type':'application/json'},body:JSON.stringify({assetKey:key,stage})});
     const body=await result.json();
     const summary=body.message||body.error||'No evidence returned.';
     const state=body.status||('HTTP '+result.status);
     if(active)active.textContent=(body.updated?'✓ ':'• ')+state+' — '+summary+
       (body.retryAfterSeconds?' (retry in '+body.retryAfterSeconds+'s)':'');
     // Fetch newly written D1 evidence between stages without altering current tab.
     if(body.updated)await refresh();
   }catch{
     if(active)active.textContent='⚠ NETWORK ERROR — previous evidence unchanged.';
   }
 }
 append('FINISHED','Inspect Safety for current 7-check result. No trade sent.','✓');
 auditInProgress=false;
}
for(const id of ['assets','hotAssets','notAssets','archiveAssets','archiveQuietWrap','goodCards']){
 document.getElementById(id)?.addEventListener('click',event=>{
 const our=event.target?.closest?.('button[data-our-key]');
 if(our){inspectOurScore(our.dataset.ourKey);return;}
 const copy=event.target?.closest?.('button[data-address]');
 if(copy){copyAddress(copy.dataset.address);return;}
 const inspect=event.target?.closest?.('button[data-green-key]');
 if(inspect){inspectGreen(inspect.dataset.greenKey);return;}
 const audit=event.target?.closest?.('button[data-audit-key]');
 if(audit)runAuditFromTable(audit.dataset.auditKey);
 });
}
document.getElementById('auditClose').onclick=()=>document.getElementById('auditDialog').close();
document.getElementById('greenClose').onclick=()=>document.getElementById('greenDialog').close();
document.getElementById('ourScoreClose').onclick=()=>document.getElementById('ourScoreDialog').close();
function watchlistTable(pins){
 const rows=(Array.isArray(pins)?pins:[]).map(a=>[
 a.chain,a.symbol==='PENDING'||!a.symbol?'AWAITING QUOTE':a.symbol,
 a.status,a.risk_status||'UNVERIFIED',a.address
 ]);
 return table(['CHAIN','TOKEN','STATE','RISK','CONTRACT'],rows);
}
async function submitWatch(event){
 event.preventDefault();
 const chain=document.getElementById('watchChain').value,
       input=document.getElementById('watchAddress'),
       button=document.getElementById('watchSubmit'),
       status=document.getElementById('watchMsg');
 const address=input.value.trim();
 if(!address){status.textContent='Paste a token contract first.';return;}
 button.disabled=true;status.textContent='Validating and pinning…';
 try{
   const r=await fetch('/api/watchlist',{method:'POST',credentials:'same-origin',
     headers:{'content-type':'application/json'},body:JSON.stringify({chain,address})});
   const data=await r.json();
   if(!r.ok){status.textContent=data.error||'Unable to add token';return;}
   input.value='';
   await refresh();
   activateTab('address');
   status.textContent='WATCHING '+data.asset_key+'. Market data will populate when a verified pool quote is available.';
 }catch{status.textContent='Network error, try again.'}
 finally{button.disabled=false;}
}
document.getElementById('watchForm').addEventListener('submit',submitWatch);
initTabs();
// Reopen automatically when a valid remembered session cookie is present.
refresh();


</script></body></html>`;
function auth(given,secret){if(!secret||!given||given.length!==secret.length)return false;let n=0;for(let i=0;i<given.length;i++)n|=given.charCodeAt(i)^secret.charCodeAt(i);return n===0;}
export default {async fetch(request,env){const path=new URL(request.url).pathname;
if(path==='/health')return json({server:'online',scan_status:'not_verified'});
if(path==='/'||path==='/dashboard')return new Response(page,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'}});
const origin=request.headers.get('origin');
if((path==='/api/login'||path==='/api/logout'||path==='/api/watchlist'||path==='/api/audit')&&origin&&origin!==new URL(request.url).origin)
  return json({error:'forbidden'},403);
if(path==='/api/login'){
 if(request.method!=='POST')return json({error:'method_not_allowed'},405);
 if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))
   return json({error:'unsupported_media_type'},415);
 let body;
 try{body=await request.json();}catch{return json({error:'invalid_request'},400)}
 const password=body?.password,remember=body?.remember===true;
 if(typeof password!=='string'||password.length>2048||!auth(password,env.ADMIN_TOKEN||''))
   return json({error:'unauthorized'},401);
 const session=await issueSession(env.ADMIN_TOKEN,{remember});
 const output=json({ok:true,remember,expiresInSeconds:remember?2592000:43200});
 output.headers.set('set-cookie',sessionCookie(session,{remember}));
 return output;
}
if(path==='/api/logout'){
 if(request.method!=='POST')return json({error:'method_not_allowed'},405);
 const output=json({ok:true});
 output.headers.set('set-cookie',clearSessionCookie());
 return output;
}
if(path!=='/api/status'&&path!=='/api/watchlist'&&path!=='/api/audit'&&path!=='/api/scan-clock')return json({error:'not_found'},404);
if(((path==='/api/status'||path==='/api/scan-clock')&&request.method!=='GET')||((path==='/api/watchlist'||path==='/api/audit')&&request.method!=='POST'))
 return json({error:'method_not_allowed'},405);
const bearer=(request.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
const cookie=readSessionCookie(request.headers.get('cookie'));
const authorized=auth(bearer,env.ADMIN_TOKEN||'')||await validSession(env.ADMIN_TOKEN||'',cookie);
if(!authorized)return json({error:'unauthorized'},401);
if(!env.DB)return json({error:'database_not_configured'},503);
if(path==='/api/scan-clock'){
 try{
   const latest=await env.DB.prepare('SELECT started_at,state FROM runs ORDER BY id DESC LIMIT 1').first();
   return json({started_at:latest?.started_at||null,state:latest?.state||null,
     expected_interval_seconds:600});
 }catch{return json({error:'scan_clock_unavailable'},503)}
}
if(path==='/api/audit'){
 if((request.headers.get('sec-fetch-site')||'').toLowerCase()==='cross-site')
   return json({error:'forbidden'},403);
 if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))
   return json({error:'unsupported_media_type'},415);
 if(Number(request.headers.get('content-length')||0)>512)
   return json({error:'request_too_large'},413);
 let input;
 try{input=await request.json()}catch{return json({error:'invalid_json'},400)}
 if(!input||typeof input!=='object'||Array.isArray(input))
   return json({error:'invalid_input'},422);
 try{
   const result=await runTokenAuditStage(env,{
     assetKey:input.assetKey,stage:input.stage});
   const output=json(result,result.httpStatus||200);
   if(result.httpStatus===429)output.headers.set('retry-after',String(result.retryAfterSeconds||90));
   return output;
 }catch{return json({error:'audit_unavailable'},503)}
}
if(path==='/api/watchlist'){
 if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))
   return json({error:'unsupported_media_type'},415);
 const length=Number(request.headers.get('content-length')||0);
 if(length>1024)return json({error:'request_too_large'},413);
 let input;
 try{input=await request.json()}catch{return json({error:'invalid_json'},400)}
 if(!input||typeof input!=='object'||Array.isArray(input))return json({error:'invalid_input'},422);
 try{
   const result=await addWatchedAddress(env.DB,input.chain,input.address);
   return json(result.ok?result:{error:result.error},result.status);
 }catch{return json({error:'watchlist_write_failed'},503)}
}
try{const list=async(sql)=>(await env.DB.prepare(sql).all()).results||[];
const [runs,assets,wallet,predictions,routes,pinned,greenEvents,archive,archiveCounts]=await Promise.all([
list('SELECT * FROM runs ORDER BY id DESC LIMIT 12'),
// Aggregate the latest token socials once rather than rescanning the entire
// research_events history for every asset in the active dashboard.
list("SELECT a.*,e.note AS socials_json FROM assets a "+
 "LEFT JOIN (SELECT asset_key,MAX(id) AS last_id FROM research_events WHERE kind='TOKEN_SOCIALS' GROUP BY asset_key) soc ON soc.asset_key=a.asset_key "+
 "LEFT JOIN research_events e ON e.id=soc.last_id "+
 "WHERE a.status IN ('ALIVE','STATIC') OR (a.pinned=1 AND a.status='DEAD') OR EXISTS (SELECT 1 FROM paper_positions p WHERE p.asset_key=a.asset_key AND p.status='OPEN') "+
 "ORDER BY a.pinned DESC,a.score DESC LIMIT 500"),
list("SELECT * FROM paper_account WHERE account='buyguy-v3'"),
list("SELECT * FROM predictions ORDER BY id DESC LIMIT 30"),
list("SELECT at,asset_key,note FROM research_events WHERE kind='ROUNDTRIP_QUOTE' ORDER BY id DESC LIMIT 15"),
list("SELECT asset_key,chain,address,symbol,status,risk_status,pinned,last_seen FROM assets WHERE pinned=1 ORDER BY first_seen DESC LIMIT 100"),
list("SELECT at,asset_key,kind,note FROM research_events WHERE kind IN ('MINT_AUTHORITY_REVIEW','ROUNDTRIP_QUOTE','BENEFICIAL_OWNER_AUDIT','POOL_CUSTODY_AUDIT','OWNER_CLUSTER_PROBE','POOL_IDENTITY_PROBE','PROGRAM_UPGRADE_PROBE','PUMP_MIGRATION_PROBE','PUMP_MIGRATION_TX_PROBE') ORDER BY id DESC LIMIT 2000"),
// One grouped pass per history table, not one table scan per archived asset.
list("SELECT a.asset_key,a.chain,a.address,a.symbol,a.last_seen,a.last_action,a.score,a.observations,"+
 "o.peak_score,COALESCE(p.prediction_count,0) AS prediction_count,COALESCE(t.paper_count,0) AS paper_count,COALESCE(e.research_count,0) AS research_count "+
 "FROM assets a "+
 "LEFT JOIN (SELECT asset_key,MAX(score) AS peak_score FROM observations GROUP BY asset_key) o ON o.asset_key=a.asset_key "+
 "LEFT JOIN (SELECT asset_key,COUNT(*) AS prediction_count FROM predictions GROUP BY asset_key) p ON p.asset_key=a.asset_key "+
 "LEFT JOIN (SELECT asset_key,COUNT(*) AS paper_count FROM paper_positions GROUP BY asset_key) t ON t.asset_key=a.asset_key "+
 "LEFT JOIN (SELECT asset_key,COUNT(*) AS research_count FROM research_events WHERE kind!='TOKEN_SOCIALS' GROUP BY asset_key) e ON e.asset_key=a.asset_key "+
 "WHERE a.status='DEAD' AND a.pinned=0 AND NOT EXISTS (SELECT 1 FROM paper_positions p2 WHERE p2.asset_key=a.asset_key AND p2.status='OPEN') "+
 "ORDER BY COALESCE(o.peak_score,0) DESC,a.observations DESC LIMIT 500"),
list("SELECT SUM(CASE WHEN status='DEAD' THEN 1 ELSE 0 END) AS dead, SUM(CASE WHEN status='TRASH' THEN 1 ELSE 0 END) AS trash FROM assets")]);
const recent=new Map();
for(const event of greenEvents){
 const key=event.asset_key+'|'+event.kind;
 if(!recent.has(key))recent.set(key,event);
}
const now=Date.now();
const evaluated=assets.map(asset=>({...asset,...(()=>{const item=tokenTier(asset,now);return {tier:item.tier,tier_reason:item.reason,quote_age:item.ageMinutes};})(),green:assessGreenLight(asset,{
 mintEvent:recent.get(asset.asset_key+'|MINT_AUTHORITY_REVIEW'),
 routeEvent:recent.get(asset.asset_key+'|ROUNDTRIP_QUOTE'),
 ownerEvent:recent.get(asset.asset_key+'|BENEFICIAL_OWNER_AUDIT'),
 poolEvent:recent.get(asset.asset_key+'|POOL_CUSTODY_AUDIT'),
 ownerProbeEvent:recent.get(asset.asset_key+'|OWNER_CLUSTER_PROBE'),
 poolProbeEvent:recent.get(asset.asset_key+'|POOL_IDENTITY_PROBE'),
 programUpgradeEvent:recent.get(asset.asset_key+'|PROGRAM_UPGRADE_PROBE'),
 migrationEvent:recent.get(asset.asset_key+'|PUMP_MIGRATION_PROBE'),
 migrationTxEvent:recent.get(asset.asset_key+'|PUMP_MIGRATION_TX_PROBE'),now
})}));
const paper=await getPaperSnapshot(env);
let scoreJournal=[],scoreJournalStatus='READY';
try{
 scoreJournal=(await env.DB.prepare(`SELECT s.id,s.asset_key,s.symbol,s.cohort,s.captured_at,s.our_score,
   h.horizon_min,h.status,h.return_pct
   FROM score_snapshots s JOIN score_outcomes h ON h.snapshot_id=s.id
   WHERE s.id IN (SELECT id FROM score_snapshots ORDER BY captured_at DESC LIMIT 20)
   ORDER BY s.captured_at DESC,s.id DESC,h.horizon_min`).all()).results||[];
}catch(e){scoreJournalStatus=/no such table/i.test(String(e))?'SCHEMA_PENDING':'UNAVAILABLE';}
return json({runs,assets:evaluated,archive,archiveStats:archiveCounts[0]||{dead:0,trash:0},coverage:countCoverage(assets,now),wallet:wallet[0]||null,predictions,paper,routes,pinned,scoreJournal,scoreJournalStatus});
}catch(e){
 const msg=String(e?.message||e);
 if(/daily row read limit|exceeded D1.*row read/i.test(msg))
   return json({error:'D1_READ_QUOTA',message:'Cloudflare D1 daily read allowance exhausted; live rankings will resume when it resets.'},503);
 return json({error:'D1_QUERY_FAILED',message:'Research database temporarily unavailable.'},503);
}
},async scheduled(controller,env,ctx){
  await scheduledResearch(env);
}
};
