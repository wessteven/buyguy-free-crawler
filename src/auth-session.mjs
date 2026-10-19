// BuyGuy dashboard signed cookies. No passwords or session tokens in localStorage.
// Signing key is derived from the private Cloudflare ADMIN_TOKEN Worker secret.
// Clearing the browser cookie signs out that device; rotating ADMIN_TOKEN revokes all sessions.
export const COOKIE_NAME='__Host-buyguy_session';
export const REMEMBER_SECONDS=30*24*60*60;
export const SESSION_SECONDS=12*60*60;
const enc=new TextEncoder();
const hex=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
const fromHex=str=>{
  if(!/^[0-9a-f]{64}$/.test(str||''))return null;
  return new Uint8Array(str.match(/.{2}/g).map(x=>parseInt(x,16)));
};
async function hmacKey(secret){
  if(typeof secret!=='string'||!secret)return null;
  return crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
}
export async function issueSession(secret,{remember=false,now=Date.now()}={}){
  const key=await hmacKey(secret);
  if(!key)throw Error('Session signing secret unavailable');
  const ttl=remember?REMEMBER_SECONDS:SESSION_SECONDS;
  const expires=Math.floor(now/1000)+ttl;
  const random=hex(crypto.getRandomValues(new Uint8Array(16)));
  const payload='v1.'+expires+'.'+random;
  const signature=hex(new Uint8Array(await crypto.subtle.sign('HMAC',key,enc.encode(payload))));
  return payload+'.'+signature;
}
export async function validSession(secret,value,{now=Date.now()}={}){
  if(typeof value!=='string'||value.length>240)return false;
  const match=/^(v1)\.(\d{10})\.([0-9a-f]{32})\.([0-9a-f]{64})$/.exec(value);
  if(!match)return false;
  const expiry=Number(match[2]),sec=Math.floor(now/1000);
  if(expiry<=sec||expiry>sec+REMEMBER_SECONDS+60)return false;
  const key=await hmacKey(secret);
  if(!key)return false;
  try{
    const payload=match[1]+'.'+match[2]+'.'+match[3];
    return await crypto.subtle.verify('HMAC',key,fromHex(match[4]),enc.encode(payload));
  }catch{return false}
}
export function readSessionCookie(header){
  if(typeof header!=='string')return null;
  for(const component of header.split(';')){
    const pair=component.trim();
    if(pair.startsWith(COOKIE_NAME+'='))return pair.slice(COOKIE_NAME.length+1);
  }
  return null;
}
export function sessionCookie(value,{remember=false}={}){
  return COOKIE_NAME+'='+value+'; Path=/; HttpOnly; Secure; SameSite=Strict'+
    (remember?'; Max-Age='+REMEMBER_SECONDS:'');
}
export function clearSessionCookie(){
  return COOKIE_NAME+'=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0';
}
