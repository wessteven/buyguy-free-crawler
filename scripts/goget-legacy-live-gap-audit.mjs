#!/usr/bin/env node
// Independent source-identity audit of the isolated legacy replay. Four dataset match counts.
// Zero Helius calls; never updates original live cursors or historical evidence.
import {writeFile} from 'node:fs/promises';
import {GAP_WALLETS} from '../src/goget-wallet-gap-wave.mjs';
import {LEGACY_REPLAY_LIMITS as L,validSignature} from '../src/goget-legacy-live-gap-replay.mjs';
const need=k=>{if(!process.env[k])throw Error('MISSING_'+k);return process.env[k];};
const url='https://api.cloudflare.com/client/v4/accounts/'+encodeURIComponent(need('CF_ACCOUNT_ID'))+
 '/d1/database/'+encodeURIComponent(need('CF_DATABASE_ID'))+'/query';
const token=need('CF_D1_API_TOKEN');let d1Reads=0;
async function read(sql,params=[]){
 if(++d1Reads>5)throw Error('LEGACY_AUDIT_D1_CAP');
 const response=await fetch(url,{method:'POST',headers:{
   authorization:'Bearer '+token,'content-type':'application/json'},
   body:JSON.stringify({sql,params}),signal:AbortSignal.timeout(19000)});
 if(!response.ok)throw Error('LEGACY_AUDIT_D1_HTTP_'+response.status);
 const doc=await response.json(),item=doc?.result?.[0];
 if(doc?.success!==true||item?.success!==true||!Array.isArray(item.results)||
   item.results.length>10)throw Error('LEGACY_AUDIT_D1_UNVERIFIED');
 return item.results;
}
const sql=[
 'SELECT j.wallet,j.legacy_cursor,j.seed_head,j.before_signature,j.pages,j.examined,j.inserted,j.status,',
 ' l.last_signature AS original_cursor_now,',
 ' (SELECT COUNT(*) FROM goget_legacy_rpc_replay_signatures r WHERE r.wallet=j.wallet) AS recovered,',
 ' (SELECT COUNT(*) FROM goget_legacy_rpc_replay_signatures r',
 ' JOIN smart_wallet_live_events l2 ON l2.wallet=r.wallet AND l2.signature=r.signature',
 ' WHERE r.wallet=j.wallet) AS exact_live_overlap,',
 ' (SELECT COUNT(*) FROM goget_legacy_rpc_replay_signatures r',
 ' JOIN smart_wallet_helius_historical_replay h ON h.wallet=r.wallet AND h.signature=r.signature',
 ' WHERE r.wallet=j.wallet) AS exact_historical_overlap,',
 ' (SELECT COUNT(*) FROM goget_legacy_rpc_replay_signatures r',
 ' JOIN goget_rpc_source_signatures s ON s.wallet=r.wallet AND s.signature=r.signature',
 ' WHERE r.wallet=j.wallet) AS exact_cloudflare_overlap,',
 ' (SELECT COUNT(*) FROM goget_legacy_rpc_replay_signatures r',
 ' WHERE r.wallet=j.wallet AND r.signature=j.legacy_cursor) AS legacy_anchor_archived,',
 ' (SELECT COUNT(*) FROM goget_rpc_source_signatures s',
 ' WHERE s.wallet=j.wallet AND s.signature=j.seed_head) AS seed_anchor_archived',
 ' FROM goget_legacy_rpc_replay_journal j',
 ' JOIN smart_wallet_live_cursors l ON l.wallet=j.wallet',
 ' WHERE j.wallet IN (?,?,?) ORDER BY j.wallet'
].join(' ');
const [rows,global,history,webhook]=await Promise.all([
 read(sql,GAP_WALLETS),
 read('SELECT day,reserved_credits FROM goget_rpc_source_budget ORDER BY day DESC LIMIT 2'),
 read('SELECT day,reserved_credits FROM goget_legacy_rpc_replay_budget ORDER BY day DESC LIMIT 2'),
 read('SELECT day,observed_deliveries FROM smart_wallet_webhook_credit_estimates ORDER BY day DESC LIMIT 2')
]);
const complete=rows.filter(r=>r.status==='COMPLETE_HELIUS_SIGNATURE_BRIDGE'&&
 r.legacy_anchor_archived===1&&r.seed_anchor_archived===1&&
 r.original_cursor_now===r.legacy_cursor);
const integrity=rows.length===3&&new Set(rows.map(x=>x.wallet)).size===3&&
 rows.every(x=>GAP_WALLETS.includes(x.wallet)&&validSignature(x.seed_head)&&
 validSignature(x.legacy_cursor)&&x.original_cursor_now===x.legacy_cursor);
const now=new Date().toISOString(),day=now.slice(0,10),
 amount=(array,name)=>Number(array.find(x=>x.day===day)?.[name]??0);
const report={asOf:now,mode:'INDEPENDENT_EXACT_SIGNATURE_SOURCE_RECONCILIATION',
 originalWalletsExpected:3,originalWalletsFound:rows.length,
 originalCursorsUnchanged:integrity,sourceBridgeComplete:complete.length,
 status:!integrity?'UNVERIFIED_SOURCE_SCOPE_OR_ORIGINAL_CURSOR':
  complete.length===3?'THREE_SIGNATURE_BRIDGES_RECONCILED':
  'PARTIAL_SIGNATURE_BRIDGES_UNRESOLVED',
 wallets:rows.map(r=>({wallet:r.wallet,legacyCursor:r.legacy_cursor,
  preservedOriginalCursor:r.original_cursor_now===r.legacy_cursor,
  seedHead:r.seed_head,beforeSignature:r.before_signature,
  status:r.status,pagesRead:r.pages,signaturesExamined:r.examined,
  newlyInserted:r.inserted,archivedUnique:r.recovered,
  exactOverlaps:{originalLiveEvents:r.exact_live_overlap,
   historicalHeliusReplay:r.exact_historical_overlap,
   newCloudflareSource:r.exact_cloudflare_overlap},
  legacyAnchorArchived:r.legacy_anchor_archived===1,
  sourceSeedArchived:r.seed_anchor_archived===1,
  missingBetweenAnchorsKnown:r.status==='COMPLETE_HELIUS_SIGNATURE_BRIDGE'?0:null,
  stillUnresolved:r.status!=='COMPLETE_HELIUS_SIGNATURE_BRIDGE'})),
 creditEstimates:{utcDay:day,replayReserved:amount(history,'reserved_credits'),
  allRpcReserved:amount(global,'reserved_credits'),
  originalWebhookDeliveryEstimate:amount(webhook,'observed_deliveries'),
  rpcCap:L.sharedDailyRpcCredits,replayDayCap:L.dayHistoricalCredits,
  combinedLocalCap:L.combinedLocalCredits,
  accountWideActualCreditsUnknown:true},
 d1Reads,heliusCalls:0,d1Writes:0,trades:0,
 caveat:'A replay bridge is Helius signature-index completeness between exact anchor signatures, not proof of verified prices, wallet signing, trade PnL or complete raw-chain history.'};
await writeFile('goget-legacy-gap-identity-audit.json',JSON.stringify(report,null,2)+'\n');
console.log('GOGET_LEGACY_GAP_IDENTITY_AUDIT',JSON.stringify(report));
if(!integrity)process.exitCode=1;
