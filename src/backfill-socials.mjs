// Public project-link enrichment for existing exact-address tokens. No trading.
import {collectSocialLinks} from './social-links.mjs';
const account=process.env.CF_ACCOUNT_ID,db=process.env.CF_DATABASE_ID,key=process.env.CF_D1_API_TOKEN;
if(!account||!db||!key)throw Error('Cloudflare D1 secrets unavailable');
const endpoint='https://api.cloudflare.com/client/v4/accounts/'+account+'/d1/database/'+db+'/query';
async function sql(statement,params=[]){
 const r=await fetch(endpoint,{method:'POST',
    headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},
    body:JSON.stringify({sql:statement,params})});
 if(!r.ok)throw Error('D1 HTTP '+r.status);
 const data=await r.json();
 if(!data.success||!data.result?.[0]?.success)throw Error('D1 SQL request failed');
 return data.result[0].results||[];
}
const identities=await sql("SELECT asset_key,chain,address FROM assets WHERE chain IN ('solana','robinhood') AND status IN ('ALIVE','STATIC','DEAD') ORDER BY score DESC LIMIT 140");
const tracked=new Map(identities.map(a=>[a.asset_key,a]));
const found=new Map();
function id(chain,mint){return chain+':'+(chain==='robinhood'?mint.toLowerCase():mint)}
function add(chain,mint,info){
 const k=id(chain,mint);
 if(!tracked.has(k))return;
 const links=collectSocialLinks(info);
 if(links.length){
   const prior=found.get(k)||[],seen=new Set(prior.map(x=>x.url));
   for(const s of links)if(!seen.has(s.url)){seen.add(s.url);prior.push(s)}
   found.set(k,prior.slice(0,24));
 }
}
let fetched=0,warnings=0;
const root='https://api.dexscreener.com';
async function dex(path){
 const resp=await fetch(root+path,{headers:{Accept:'application/json'}});
 if(!resp.ok)throw Error('DEX Screener HTTP '+resp.status);
 return resp.json();
}
try{
 const profiles=await dex('/token-profiles/latest/v1');
 if(Array.isArray(profiles))for(const profile of profiles){
   if(['solana','robinhood'].includes(profile?.chainId)&&profile.tokenAddress)
     add(profile.chainId,profile.tokenAddress,profile);
 }
 fetched++;
}catch(e){console.warn('Profiles unavailable:',e?.name||'Error');warnings++;}
for(const chain of ['solana','robinhood']){
 const group=identities.filter(x=>x.chain===chain);
 for(let i=0;i<group.length;i+=25){
   const batch=group.slice(i,i+25);
   try{
     const pairs=await dex('/tokens/v1/'+chain+'/'+batch.map(x=>encodeURIComponent(x.address)).join(','));
     if(Array.isArray(pairs))for(const p of pairs)
       if(p?.chainId===chain&&p?.baseToken?.address)add(chain,p.baseToken.address,p.info);
     fetched++;
   }catch(e){console.warn('Batch unavailable',chain,i,e?.name||'Error');warnings++;}
 }
}
let saved=0;
for(const [assetKey,links] of found){
 const payload=JSON.stringify(links);
 const statement="INSERT INTO research_events(at,asset_key,kind,note) SELECT ?,?,'TOKEN_SOCIALS',? "+
   "WHERE COALESCE((SELECT note FROM research_events WHERE asset_key=? AND kind='TOKEN_SOCIALS' "+
   "ORDER BY id DESC LIMIT 1),'') <> ?";
 await sql(statement,[new Date().toISOString(),assetKey,payload,assetKey,payload]);
 saved++;
}
console.log(JSON.stringify({assets_queried:identities.length,batches_completed:fetched,
  assets_with_public_links:found.size,events_checked_or_updated:saved,provider_warnings:warnings,
  caveat:'Unverified project accounts, no same-ticker inference'}));
