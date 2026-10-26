// Purpose-limited, stateless, expiring Pocket Radar credentials.
// Only /api/pocket-radar/feed accepts this token. It is NEVER an ADMIN_TOKEN.
export const POCKET_TOKEN_SECONDS=7*24*60*60;
const utf8=new TextEncoder();
const hex=b=>Array.from(b,x=>x.toString(16).padStart(2,'0')).join('');
const bytes=h=>new Uint8Array(h.match(/../g).map(x=>parseInt(x,16)));
async function keyFor(secret){
 if(typeof secret!=='string'||!secret)throw Error('Pocket Radar signing key unavailable');
 return crypto.subtle.importKey('raw',utf8.encode('pocket-radar-read-only-v1\0'+secret),
   {name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
}
export async function issuePocketToken(secret,{now=Date.now()}={}){
 const expiry=Math.floor(now/1000)+POCKET_TOKEN_SECONDS;
 const nonce=hex(crypto.getRandomValues(new Uint8Array(16)));
 const payload='pr1.'+expiry+'.'+nonce;
 const mac=new Uint8Array(await crypto.subtle.sign('HMAC',await keyFor(secret),utf8.encode(payload)));
 return {token:payload+'.'+hex(mac),expiresAt:new Date(expiry*1000).toISOString()};
}
export async function validPocketToken(secret,token,{now=Date.now()}={}){
 if(typeof token!=='string'||token.length>180||!secret)return false;
 const m=/^pr1\.(\d{10})\.([0-9a-f]{32})\.([0-9a-f]{64})$/.exec(token);
 if(!m)return false;
 const seconds=Math.floor(now/1000),expiry=Number(m[1]);
 if(expiry<=seconds||expiry>seconds+POCKET_TOKEN_SECONDS+60)return false;
 try{
   const payload='pr1.'+m[1]+'.'+m[2];
   return await crypto.subtle.verify('HMAC',await keyFor(secret),bytes(m[3]),utf8.encode(payload));
 }catch{return false}
}
