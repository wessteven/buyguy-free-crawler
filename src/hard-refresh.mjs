// User-initiated, authenticated and quota-bounded deep shortlist refresh.
// Each short HTTP invocation runs only one stage, so Cloudflare Free does not
// keep a single long-running multi-provider job open. No trading, no schema edits.
import {cronScan} from './light-scan.mjs';
import {refreshKnownQuotes} from './price-refresh.mjs';

export const HARD_REFRESH_STAGES=['discovery','quotes'];
const cooldown={discovery:180,quotes:120};
export function d1ReadQuota(error){
 return /(?:daily row.?read limit|exceeded.{0,25}(?:rows.?read|row.?read)|D1_READ_QUOTA)/i.test(String(error?.message||error||''));
}
export async function runHardRefreshStage(env,{stage,now=new Date().toISOString(),
  discover=cronScan,refreshQuotes=refreshKnownQuotes,fetcher=fetch}={}){
 if(!HARD_REFRESH_STAGES.includes(stage))
  return {httpStatus:422,error:'INVALID_STAGE',message:'Unsupported refresh stage.'};
 if(!env?.DB)return {httpStatus:503,error:'DB_UNAVAILABLE',message:'Research database not configured.'};
 const time=Date.parse(now);
 if(!Number.isFinite(time))return {httpStatus:422,error:'INVALID_TIME'};
 // Shared D1 lease across all browser tabs. Cooldowns throttle expensive
 // manual scans, but they never change existing scheduler or paper settings.
 const name='top5-hard-refresh:'+stage,expires=time+cooldown[stage]*1000;
 try{
  const claim=await env.DB.prepare("INSERT INTO leases(name,expires_at,token) VALUES(?,?,?) ON CONFLICT(name) DO UPDATE SET expires_at=excluded.expires_at,token=excluded.token WHERE leases.expires_at<=?")
   .bind(name,expires,crypto.randomUUID(),time).run();
  if(Number(claim?.meta?.changes)!==1){
   const row=await env.DB.prepare('SELECT expires_at FROM leases WHERE name=?').bind(name).first();
   return {httpStatus:429,error:'COOLDOWN',stage,retryAfterSeconds:
     Math.max(1,Math.ceil((Number(row?.expires_at||expires)-time)/1000)),
     message:'Recent deep refresh already used this stage. Wait for cooldown.'};
  }
 }catch(e){
  return {httpStatus:503,error:d1ReadQuota(e)?'D1_READ_QUOTA':'DB_UNAVAILABLE',
   message:d1ReadQuota(e)?'Cloudflare D1 daily read quota exhausted.':'Unable to reserve refresh stage.'};
 }
 try{
  if(stage==='discovery'){
   const discovered=await discover(env,fetcher);
   return {httpStatus:200,stage,status:'UPDATED',discovered,
    message:'Fresh GeckoTerminal/Dex discovery pass completed; '+discovered+' candidate observations processed.',
    noTrading:true};
  }
  const result=await refreshQuotes(env,{fetcher,now,limit:25});
  return {httpStatus:200,stage,status:result.failedProviders?.length?'PARTIAL':'UPDATED',
   scanned:result.tracked,refreshed:result.refreshed,
   providerWarnings:result.failedProviders||[],
   message:result.refreshed+' of '+result.tracked+
     ' selected tracked contracts received exact-mint price, cap and liquidity quotes'+
     (result.failedProviders?.length?' (provider limits/errors reported).':'.'),
   noTrading:true};
 }catch(e){
  const message=String(e?.message||e);
  return {httpStatus:d1ReadQuota(e)?503:/\b429\b|rate.limit/i.test(message)?429:503,
   error:d1ReadQuota(e)?'D1_READ_QUOTA':/\b429\b|rate.limit/i.test(message)?'PROVIDER_RATE_LIMIT':'STAGE_UNAVAILABLE',
   stage,message:d1ReadQuota(e)?'Cloudflare D1 daily read quota exhausted; stop and retry after reset.':
    /\b429\b|rate.limit/i.test(message)?'Upstream market provider rate limited the scan.':
    'Provider or database stage unavailable. No fresh values assumed.',
   noTrading:true};
 }
}
