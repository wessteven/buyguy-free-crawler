// DEX Screener / GeckoTerminal project metadata, tied to exact chain + mint.
// These are unverified links advertised by project profiles, NOT audited official accounts.
// Treat all URLs as untrusted. Only explicit HTTPS links; no credentials or unsafe schemes.
const TYPE_LABELS={
  twitter:'X',x:'X',telegram:'TG',tg:'TG',website:'Web',web:'Web',
  discord:'Discord',github:'GitHub',youtube:'YouTube',
  instagram:'Instagram',tiktok:'TikTok',medium:'Medium',
  farcaster:'Farcaster',reddit:'Reddit',facebook:'Facebook',
  docs:'Docs',documentation:'Docs',whitepaper:'Paper',
  linktree:'Linktree',other:'Link'
};
export function safeSocialUrl(value){
  if(typeof value!=='string'||value.length>1200)return null;
  const text=value.trim();
  if(!/^https:\/\//i.test(text)||/[\u0000-\u001f\u007f]/.test(text))return null;
  try{
    const url=new URL(text);
    if(url.protocol!=='https:'||url.username||url.password||!url.hostname||
      url.hostname==='localhost'||url.hostname.endsWith('.local'))return null;
    // Preserve external URL exactly where possible, but strip fragments/trackers for duplicates.
    return url.href;
  }catch{return null}
}
function autoType(link){
 const input=String(link||'').toLowerCase();
 if(/^(?:x\.com|twitter\.com|www\.twitter\.com|www\.x\.com)$/.test(input))return 'twitter';
 if(/^(?:t\.me|telegram\.me|telegram\.org)$/.test(input))return 'telegram';
 if(/^(?:discord\.gg|discord\.com)$/.test(input))return 'discord';
 if(input==='github.com'||input==='www.github.com')return 'github';
 if(input==='youtube.com'||input==='www.youtube.com'||input==='youtu.be')return 'youtube';
 return 'website';
}
function labelOf(type,url,label){
 let normalized=String(type||label||'').toLowerCase().replace(/[^a-z0-9]/g,'');
 if(TYPE_LABELS[normalized])return TYPE_LABELS[normalized];
 const host=new URL(url).hostname.toLowerCase().replace(/^www\./,'');
 return TYPE_LABELS[autoType(host)]||'Web';
}
function asUrlFromHandle(value,network){
 if(typeof value!=='string')return null;
 let s=value.trim();
 if(s.startsWith('@'))s=s.slice(1);
 if(/^https:\/\//i.test(s))return s;
 // Only allow exact handle syntax for sources explicitly marked Twitter/Telegram.
 if(!/^[a-zA-Z0-9_]{3,32}$/.test(s))return null;
 return network==='twitter'?'https://x.com/'+s:
        network==='telegram'?'https://t.me/'+s:null;
}
export function collectSocialLinks(...sources){
 const found=[],seen=new Set();
 const add=(type,raw,label)=>{
   const url=safeSocialUrl(raw);
   if(!url)return;
   const name=labelOf(type,url,label);
   const dedup=url.replace(/\/$/,'').toLowerCase();
   if(seen.has(dedup))return;
   seen.add(dedup);
   found.push({label:name,url});
 };
 for(const source of sources){
   if(!source||typeof source!=='object')continue;
   const list=[...(Array.isArray(source.websites)?source.websites:[]),
      ...(Array.isArray(source.socials)?source.socials:[]),
      ...(Array.isArray(source.links)?source.links:[])];
   for(const item of list){
     if(typeof item==='string')add('website',item,null);
     else if(item&&typeof item==='object')add(item.type,item.url,item.label);
   }
   if(source.website_url)add('website',source.website_url);
   if(source.twitter_handle)add('twitter',asUrlFromHandle(source.twitter_handle,'twitter'));
   if(source.telegram_handle)add('telegram',asUrlFromHandle(source.telegram_handle,'telegram'));
   if(source.discord_url)add('discord',source.discord_url);
   if(source.twitter)add('twitter',asUrlFromHandle(source.twitter,'twitter'));
   if(source.telegram)add('telegram',asUrlFromHandle(source.telegram,'telegram'));
 }
 const order={X:0,TG:1,Web:2,Discord:3,GitHub:4,YouTube:5};
 return found.sort((a,b)=>(order[a.label]??20)-(order[b.label]??20))
   .slice(0,24);
}
export function socialsJson(...sources){
 return JSON.stringify(collectSocialLinks(...sources));
}
