// Authenticated, user-initiated, read-only one-token audit, executed by Cloudflare.
// GitHub only deploys this code; no GitHub run on a user's AUDIT click.
// Each requested stage is one short invocation with its own D1 cooldown lease.
// Provider errors never make missing data look fresh or establish safe sells.
import {normalizedWatchAddress} from './watchlist.mjs';
import {parseQuoteRefresh} from './price-refresh.mjs';
import {checkSolanaMint} from './token-risk.mjs';
import {fetchLargestAccounts,assessLargestAccounts} from './holder-risk.mjs';
import {combineRisk} from './risk-ops.mjs';
import {getRoundTripQuotes} from './quote-route.mjs';
import {inspectPoolProtocol} from './pool-protocol.mjs';
import {inspectProgramUpgradeAuthority} from './program-authority.mjs';
import {PUMPSWAP} from './pumpswap.mjs';
import {RAYDIUM_CPMM} from './raydium-cpmm.mjs';

export const STAGES=['market','mint','pool','route'];
export const COOLDOWNS={market:90,mint:600,pool:900,route:240};
const recent=(date,now,minutes)=>{
 const ts=Date.parse(date||'');
 return Number.isFinite(ts)&&now-ts>=0&&now-ts<=minutes*60000;
};
async function record(db,now,key,kind,obj){
 await db.prepare('INSERT INTO research_events(at,asset_key,kind,note) VALUES(?,?,?,?)')
   .bind(now,key,kind,JSON.stringify(obj)).run();
}
async function assetOf(db,key){
 return db.prepare("SELECT a.*, EXISTS(SELECT 1 FROM paper_positions p WHERE p.asset_key=a.asset_key AND p.status='OPEN') AS has_position FROM assets a WHERE asset_key=? AND status!='TRASH'")
  .bind(key).first();
}
function publicStatus(label,stage,note,extras={}){
 return {stage,status:label,message:note,updated:label==='UPDATED',...extras};
}
async function stageMarket(db,asset,at,fetcher){
 const url='https://api.dexscreener.com/tokens/v1/'+asset.chain+'/'+asset.address;
 const response=await fetcher(url,{headers:{accept:'application/json'}});
 if(!response.ok)throw Error('PROVIDER_HTTP_'+response.status);
 const parsed=parseQuoteRefresh(await response.json(),[asset],Date.parse(at));
 const quote=parsed.find(q=>q.asset_key===asset.asset_key);
 if(!quote)return publicStatus('UNAVAILABLE','market','No verified fresh quote for this exact contract. Existing data was not replaced.');
 const updates=[
 db.prepare("UPDATE assets SET symbol=?,pool=?,provider='DEX Screener',updated_at=?,last_seen=?,pool_created=COALESCE(pool_created,?),price=?,liquidity=?,market_cap=?,buys_m5=?,sells_m5=?,tx_m5=?,change_h1=?,volume_h24=?,score=?,status=?,observations=observations+1,misses=0 WHERE asset_key=? AND status!='TRASH' AND (last_seen IS NULL OR last_seen<=?)")
   .bind(quote.symbol,quote.pool,at,at,quote.pool_created,quote.price,quote.liquidity,
    quote.market_cap,quote.buys_m5,quote.sells_m5,quote.tx_m5,quote.change_h1,quote.volume_h24,
    quote.score,quote.status,asset.asset_key,at),
 db.prepare("INSERT OR IGNORE INTO observations(asset_key,seen_at,pool,provider,price,liquidity,buys_m5,sells_m5,score) VALUES(?,?,?,'DEX Screener',?,?,?,?,?)")
   .bind(asset.asset_key,at,quote.pool,quote.price,quote.liquidity,quote.buys_m5,quote.sells_m5,quote.score)
 ];
 if(quote.socials.length){
  const note=JSON.stringify(quote.socials);
  updates.push(db.prepare("INSERT INTO research_events(at,asset_key,kind,note) SELECT ?,?,'TOKEN_SOCIALS',? WHERE COALESCE((SELECT note FROM research_events WHERE asset_key=? AND kind='TOKEN_SOCIALS' ORDER BY id DESC LIMIT 1),'')<>?")
   .bind(at,asset.asset_key,note,asset.asset_key,note));
 }
 // Explicit provider evidence only; no quote -> no fabricated timestamp.
 await db.batch(updates);
 return publicStatus('UPDATED','market','DEX Screener exact-contract quote refreshed.',{
  source:'DEX Screener',pool:quote.pool,liquidityUsd:quote.liquidity,
  priceUsd:quote.price,score:quote.score});
}
async function stageMint(db,asset,at,rpc,fetcher){
 if(asset.chain!=='solana')return publicStatus('UNSUPPORTED','mint','Robinhood on-chain checks are not wired to this Worker. No security approval issued.');
 if(!rpc)return publicStatus('UNAVAILABLE','mint','Private Helius RPC is not configured.');
 const mint=await checkSolanaMint({mint:asset.address,rpcEndpoint:rpc,fetcher});
 let holders={status:'NOT_CHECKED',flags:[],top1Bps:null,top5Bps:null,top20Bps:null};
 if(mint.supplyRaw&&['MINT_CONTROLS_REVOKED','TOKEN_2022_METADATA_ONLY'].includes(mint.riskStatus)){
  try{
   const raw=await fetchLargestAccounts({mint:asset.address,rpcEndpoint:rpc,fetcher});
   holders=assessLargestAccounts(asset.address,mint.supplyRaw,raw);
  }catch{holders={status:'UNAVAILABLE',flags:['HOLDER_PROVIDER_UNAVAILABLE'],
   top1Bps:null,top5Bps:null,top20Bps:null}}
 }
 const riskStatus=combineRisk(mint,holders);
 const note={
  checkedAt:at,program:mint.tokenProgram||null,decimals:mint.decimals??null,
  extensionTypes:mint.extensionTypes||[],source:'Helius read-only Solana RPC',
  mintFlags:mint.flags||[],holderFlags:holders.flags||[],
  holderStatus:holders.status,top1Bps:holders.top1Bps,top5Bps:holders.top5Bps,
  top20Bps:holders.top20Bps,paperEligible:false,
  caveat:'Token account balances include potential AMM vaults; not beneficial-owner verification.'
 };
 // Never downgrade a known concern because a new data source is unavailable.
 const keepRisk=['MINT_CONTROL_RISK','HOLDER_CONCENTRATION_RISK'].includes(asset.risk_status) &&
  !['MINT_CONTROL_RISK','HOLDER_CONCENTRATION_RISK'].includes(riskStatus);
 await db.batch([
  db.prepare("INSERT INTO research_events(at,asset_key,kind,note) VALUES(?,?,'MINT_AUTHORITY_REVIEW',?)")
    .bind(at,asset.asset_key,JSON.stringify(note)),
  db.prepare("UPDATE assets SET risk_status=?,risk_note=? WHERE asset_key=? AND status!='TRASH'")
    .bind(keepRisk?asset.risk_status:riskStatus,JSON.stringify(note),asset.asset_key)
 ]);
 return publicStatus('UPDATED','mint','Solana mint and top token-account review recorded; not a full security certification.',{
  source:'Helius',riskStatus:keepRisk?asset.risk_status:riskStatus,holders:holders.status});
}
async function stagePool(db,asset,at,rpc,fetcher){
 if(asset.chain!=='solana')return publicStatus('UNSUPPORTED','pool','No Robinhood protocol-specific on-demand pool verifier is connected.');
 if(!rpc)return publicStatus('UNAVAILABLE','pool','Private Helius RPC is not configured.');
 if(!asset.pool||!recent(asset.last_seen,Date.parse(at),30))
   return publicStatus('SKIPPED','pool','Need a recent, exactly matched Solana liquidity pool before auditing.');
 const pool=await inspectPoolProtocol(asset.pool,asset.address,rpc,fetcher);
 // Only protocol-specific, verified vault identities qualify for partial evidence.
 const report={
  assetKey:asset.asset_key,chain:'solana',checkedAt:at,verifier:'buyguy-pool-program-v2',
  status:pool.status,protocol:pool.protocol||null,program:pool.program||null,
  pool:asset.pool,token0Mint:pool.token0Mint||null,token1Mint:pool.token1Mint||null,
  verifiedVaults:pool.vaultsVerified===true?pool.verifiedVaults:[],
  vaultsVerified:pool.vaultsVerified===true,lpLockVerified:false,
  lpSupplyRaw:pool.lpSupplyRaw||null,lpSupplyGapBps:pool.lpSupplyGapBps??null,
  flags:pool.flags||[],caveat:'Pool identity and vaults do NOT prove LP custody, a lock, or sellability.'
 };
 await record(db,at,asset.asset_key,'POOL_IDENTITY_PROBE',report);
 if(pool.vaultsVerified&&['PUMPSWAP','RAYDIUM_CPMM'].includes(pool.protocol)){
  try{
   const p=pool.protocol==='PUMPSWAP'?PUMPSWAP:RAYDIUM_CPMM;
   const gov=await inspectProgramUpgradeAuthority(p,rpc,fetcher);
   await record(db,at,asset.asset_key,'PROGRAM_UPGRADE_PROBE',{
    assetKey:asset.asset_key,checkedAt:at,verifier:'buyguy-program-authority-v1',
    program:p,status:gov.status,immutable:gov.immutable===true,
    upgradeAuthorityPresent:gov.upgradeAuthorityPresent??null
   });
  }catch{
   // Publish vault evidence, but leave program governance unknown.
  }
 }
 return publicStatus('UPDATED','pool','Exact pool-program evidence stored; no liquidity-lock certification.',{
  source:'Helius',protocol:pool.protocol||null,poolStatus:pool.status,
  vaultsVerified:pool.vaultsVerified===true,lpLockVerified:false});
}
async function stageRoute(db,asset,at,fetcher,jupiterKey){
 if(asset.chain!=='solana')return publicStatus('UNSUPPORTED','route','Robinhood sell-route verifier is not available in this Worker.');
 if(!recent(asset.last_seen,Date.parse(at),20)||!(Number(asset.price)>0))
  return publicStatus('SKIPPED','route','A fresh market price is needed before the buy/sell route check.');
 if(!['MINT_CONTROLS_REVOKED','PARTIAL_ONCHAIN_REVIEW','TOKEN_2022_METADATA_ONLY'].includes(asset.risk_status))
  return publicStatus('SKIPPED','route','Mint review not cleared; do not infer that a quote proves a safe exit.');
 let decimals;try{decimals=JSON.parse(asset.risk_note||'{}').decimals}catch{}
 let result;
 try{result=await getRoundTripQuotes(asset.address,{
    fetcher,key:jupiterKey||null,marketPriceUsd:Number(asset.price),decimals});
 }catch{
  result={source:'Jupiter read-only quotes',label:'QUOTE_PROVIDER_UNAVAILABLE',
    flags:['QUOTE_SERVICE_UNAVAILABLE'],note:'No transaction constructed or sent.'};
 }
 await record(db,at,asset.asset_key,'ROUNDTRIP_QUOTE',{...result,checkedAt:at,paperEligible:false});
 return publicStatus(result.label==='BOTH_DIRECTIONS_QUOTED'?'UPDATED':'UNAVAILABLE','route',
   'Read-only Jupiter buy/sell route evidence saved. Quotes are not executed sales.',{
   source:'Jupiter',verdict:result.label||'NO_QUOTE',
   estimatedLossPct:result.estimatedRoundTripLossPct??null});
}
export async function runTokenAuditStage(env,{assetKey,stage,now=new Date().toISOString(),
 fetcher=fetch}={}){
 if(!env?.DB)return {httpStatus:503,...publicStatus('UNAVAILABLE',stage,'D1 database is unavailable.')};
 if(!STAGES.includes(stage))return {httpStatus:422,...publicStatus('INVALID',stage,'Unknown audit stage.')};
 if(typeof assetKey!=='string'||assetKey.length>120)
  return {httpStatus:422,...publicStatus('INVALID',stage,'An exact contract address is required.')};
 const colon=assetKey.indexOf(':');
 const check=normalizedWatchAddress(assetKey.slice(0,colon),assetKey.slice(colon+1));
 if(!check.ok||check.asset_key!==assetKey)
  return {httpStatus:422,...publicStatus('INVALID',stage,'Use an exact tracked chain-specific contract address.')};
 const asset=await assetOf(env.DB,assetKey);
 if(!asset)return {httpStatus:404,...publicStatus('NOT_FOUND',stage,'Token is not in BuyGuy tracking.')};
 if(asset.status==='TRASH')
  return {httpStatus:409,...publicStatus('ARCHIVED',stage,'Token is archived as invalid; cannot audit.')};
 const current=Date.parse(now);
 if(!Number.isFinite(current))return {httpStatus:422,...publicStatus('INVALID',stage,'Invalid audit time.')};
 // SQLite/D1 atomic per-token+stage gate. Shared by all browser tabs/users; no fee abuse.
 const lease='audit:'+stage+':'+assetKey;
 const expires=current+COOLDOWNS[stage]*1000;
 const ticket=crypto.randomUUID();
 const claimed=await env.DB.prepare("INSERT INTO leases(name,expires_at,token) VALUES(?,?,?) ON CONFLICT(name) DO UPDATE SET expires_at=excluded.expires_at,token=excluded.token WHERE leases.expires_at<=?")
   .bind(lease,expires,ticket,current).run();
 if(Number(claimed?.meta?.changes)!==1){
  const stored=await env.DB.prepare('SELECT expires_at FROM leases WHERE name=?').bind(lease).first();
  return {httpStatus:429,...publicStatus('COOLDOWN',stage,'Recent audit request; wait before retrying.',{
   retryAfterSeconds:Math.max(1,Math.ceil((Number(stored?.expires_at||expires)-current)/1000))})};
 }
 let result;
 try{
  if(stage==='market')result=await stageMarket(env.DB,asset,now,fetcher);
  if(stage==='mint')result=await stageMint(env.DB,asset,now,env.HELIUS_RPC_URL,fetcher);
  if(stage==='pool')result=await stagePool(env.DB,asset,now,env.HELIUS_RPC_URL,fetcher);
  if(stage==='route')result=await stageRoute(env.DB,asset,now,fetcher,env.JUPITER_API_KEY);
 }catch(error){
  const code=String(error?.message||'');
  const kind=/PROVIDER_HTTP_429/.test(code)?'RATE_LIMITED':'PROVIDER_UNAVAILABLE';
  result=publicStatus(kind,stage,kind==='RATE_LIMITED'?'Provider rate limited: no fresh evidence was invented.':'Provider check failed; prior evidence stays unchanged.');
 }
 const safe={assetKey:assetKey,stage,at:now,status:result.status,message:result.message,
  source:result.source||null,verdict:result.verdict||null,
  noTrading:true};
 try{await record(env.DB,now,assetKey,'ON_DEMAND_AUDIT',safe)}catch{}
 return {httpStatus:200,assetKey,...result,noTrading:true};
}
