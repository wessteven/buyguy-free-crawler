// BuyGuy green-light evidence gate, V1.
// Strictly read-only. Never upgrades risk_status or enables paper / real trades.
// A high market score or partial mint review cannot override missing evidence.
import {SPL_TOKEN,TOKEN_2022} from './token-risk.mjs';
const HARD_RISKS=new Set(['MINT_CONTROL_RISK','HOLDER_CONCENTRATION_RISK','TOKEN_2022_REVIEW_REQUIRED']);
const MINT_RISKS=new Set(['MINT_AUTHORITY_ACTIVE','FREEZE_AUTHORITY_ACTIVE','TOKEN_2022_EXTENSIONS_UNREVIEWED']);
const ageOK=(t,now,maxMinutes)=>{
  const time=Date.parse(t||'');
  const diff=now-time;
  return Number.isFinite(time)&&diff>=0&&diff<=maxMinutes*60000;
};
function noteOf(event,assetKey,now,maxMinutes){
  if(!event||event.asset_key!==assetKey||!ageOK(event.at,now,maxMinutes))return null;
  try{const note=JSON.parse(event.note);return note&&typeof note==='object'&&!Array.isArray(note)?note:null}
  catch{return null}
}
const positive=(value)=>typeof value==='number'&&Number.isFinite(value)&&value>0;
const part=(name,passed,reason)=>({name,passed:Boolean(passed),reason});
export function assessGreenLight(asset,{
  mintEvent=null,routeEvent=null,ownerEvent=null,poolEvent=null,ownerProbeEvent=null,poolProbeEvent=null,now=Date.now()
}={}){
 const key=String(asset?.asset_key||''),chain=asset?.chain;
 const response={version:'GREEN_V1',asset_key:key,green:false,status:'UNASSESSED',
  checked_at:new Date(now).toISOString(),passed:0,total:7,checks:[],blocking:[],warning:
  'A completed screen cannot guarantee future transferability, liquidity or successful sells.'};
 if(!key||!['solana','robinhood'].includes(chain)||key!==chain+':'+
   (chain==='robinhood'?String(asset.address||'').toLowerCase():String(asset.address||''))){
   response.blocking=['EXACT_CHAIN_TOKEN_IDENTITY_REQUIRED'];return response;
 }
 const m=noteOf(mintEvent,key,now,24*60);
 const q=noteOf(routeEvent,key,now,20);
 const h=noteOf(ownerEvent,key,now,24*60);
 const p=noteOf(poolEvent,key,now,6*60);
 const ownerProbe=noteOf(ownerProbeEvent,key,now,6*60);
 const poolProbe=noteOf(poolProbeEvent,key,now,6*60);
 response.partial_probes={
   uniqueAuthorityCount:ownerProbe?.verifier==='buyguy-owner-sample-v1'?
     ownerProbe.uniqueAuthorityCount??null:null,
   largestAuthorityShareOfSampleBps:ownerProbe?.verifier==='buyguy-owner-sample-v1'?
     ownerProbe.largestAuthoritySampleBps??null:null,
   poolAccountProgram:poolProbe?.status==='POOL_ACCOUNT_OBSERVED'?
     poolProbe.program||null:null,
   caveat:'Owner sample may count pool vaults; pool program identity does not verify any LP lock.'
 };
 const risk=String(asset.risk_status||'UNVERIFIED');
 const flags=m?.mintFlags||[];
 const noControls=chain==='solana'&&
    [SPL_TOKEN,TOKEN_2022].includes(m?.program)&&
    Array.isArray(flags)&&!flags.some(f=>MINT_RISKS.has(f))&&
    typeof m?.decimals==='number'&&Number.isInteger(m.decimals)&&
    (risk==='PARTIAL_ONCHAIN_REVIEW'||risk==='MINT_CONTROLS_REVOKED'||risk==='TOKEN_2022_METADATA_ONLY');
 response.checks.push(part('Mint authority',
   noControls,'Recent Helius evidence: recognized mint program, revoked mint/freeze authority, valid decimals (24h)'));
 // Classic SPL tokens have no Token-2022 mint extensions, but transferability still depends on recipient accounts.
 const allowedExtensions=Array.isArray(m?.extensionTypes)&&
   m.extensionTypes.every(v=>['metadataPointer','tokenMetadata'].includes(v));
 const transfers=Boolean(noControls&&(m.program===SPL_TOKEN||m.program===TOKEN_2022&&allowedExtensions));
 response.checks.push(part('Token transfer controls',transfers,
   'Known mint-level restrictions screened. Token-2022 unreviewed extensions fail closed; wallet-specific freezes still possible'));
 const holders=Boolean(noControls&&m?.holderStatus==='TOKEN_ACCOUNT_BALANCES_SCREENED'&&
   Array.isArray(m?.holderFlags)&&m.holderFlags.length===0&&
   typeof m.top1Bps==='number'&&m.top1Bps<=2000&&
   typeof m.top5Bps==='number'&&m.top5Bps<=6500&&
   typeof m.top20Bps==='number'&&m.top20Bps<=9000);
 response.checks.push(part('Token-account concentration',holders,
   'On-chain top account screen: top1 <=20%, top5 <=65%, top20 <=90% of supply; AMM vaults are not owner wallets'));
 // No automated verifier currently writes either of the next two events.
 // Even a nominal risk_status=FULL_REVIEW_PASSED alone cannot bypass these gates.
 const owners=Boolean(h?.verifier==='buyguy-beneficial-owners-v1'&&h.assetKey===key&&
   h.verdict==='VERIFIED_DISTRIBUTION'&&h.vaultsExcluded===true&&
   h.pool===asset.pool&&h.onchainSource==='Helius');
 response.checks.push(part('Beneficial owners',owners,
   'Independent wallet-owner attribution excluding pool vaults and custodians required (24h)'));
 const liquid=positive(Number(asset.liquidity))&&Number(asset.liquidity)>=50000&&
   positive(Number(asset.price))&&ageOK(asset.last_seen,now,20)&&
   Boolean(asset.pool)&&asset.status==='ALIVE';
 response.checks.push(part('Current pool liquidity',liquid,
   'Fresh matching pool quote with >=US$50k reported liquidity (20m)'));
 const custody=Boolean(p?.verifier==='buyguy-pool-custody-v1'&&p.assetKey===key&&
   p.pool===asset.pool&&p.chain===chain&&p.verdict==='LOCK_VERIFIED'&&
   p.onchainSource==='VERIFIED_POOL_STATE'&&p.adminControlsReviewed===true&&
   Number.isFinite(p.unlockAfterMs)&&p.unlockAfterMs>now+7*86400000);
 response.checks.push(part('Pool custody / LP lock',custody,
   'Independent on-chain pool ownership, lock/unlock and upgrade/admin review required (6h); not provided by DEX quote'));
 const roundTrip=Boolean(q?.source==='Jupiter read-only buy/sell route quotes'&&
   q.label==='BOTH_DIRECTIONS_QUOTED'&&q.buyRoute===true&&q.sellRoute===true&&
   Array.isArray(q.flags)&&q.flags.length===0&&
   typeof q.maxImpactPct==='number'&&q.maxImpactPct<=5&&q.maxImpactPct>=0&&
   typeof q.estimatedRoundTripLossPct==='number'&&q.estimatedRoundTripLossPct<=12&&
   q.estimatedRoundTripLossPct>=-30&&typeof q.marketVsQuotePct==='number'&&
   Math.abs(q.marketVsQuotePct)<=25&&chain==='solana');
 response.checks.push(part('US$40 round-trip routes',roundTrip,
   'Recent matched USDC → exact mint → USDC quote, impact <=5%, loss <=12%, price variance <=25% (20m); still indicative'));
 response.passed=response.checks.filter(c=>c.passed).length;
 response.blocking=response.checks.filter(c=>!c.passed).map(c=>c.name);
 const hard=HARD_RISKS.has(risk)||(Array.isArray(flags)&&flags.some(x=>MINT_RISKS.has(x)));
 response.status=hard?'RISK':response.passed===0?'UNASSESSED':response.passed===response.total?'SCREEN_PASSED':'PARTIAL';
 response.green=!hard&&response.passed===response.total;
 if(hard)response.blocking.unshift('Critical on-chain risk flag');
 return response;
}
