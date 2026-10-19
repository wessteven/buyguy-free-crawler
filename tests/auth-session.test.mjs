import test from 'node:test';
import assert from 'node:assert/strict';
import {COOKIE_NAME,REMEMBER_SECONDS,SESSION_SECONDS,issueSession,validSession,
  sessionCookie,clearSessionCookie,readSessionCookie} from '../src/auth-session.mjs';
import worker from '../src/viewer.mjs';
const secret='example-very-long-secret-for-test-only-'+('A'.repeat(48));
const base='https://buyguy-free-radar.wessteven.workers.dev';
const now=Date.now();
test('Remembered session lasts 30 days and uses signed Secure HttpOnly Strict cookie',async()=>{
 const value=await issueSession(secret,{remember:true,now});
 assert.equal(await validSession(secret,value,{now:now+29*86400e3}),true);
 assert.equal(await validSession(secret,value,{now:now+31*86400e3}),false);
 const header=sessionCookie(value,{remember:true});
 assert.match(header,/HttpOnly/);assert.match(header,/Secure/);assert.match(header,/SameSite=Strict/);
 assert.match(header,/Path=\//);assert.match(header,new RegExp('Max-Age='+REMEMBER_SECONDS));
 assert.equal(readSessionCookie('a=1; '+header.split(';')[0]+'; b=2'),value);
});
test('Session-only sign-in has no persistent Max-Age, expires in 12 hours',async()=>{
 const value=await issueSession(secret,{remember:false,now});
 assert.match(sessionCookie(value),/HttpOnly/);
 assert.doesNotMatch(sessionCookie(value),/Max-Age=/);
 assert.equal(await validSession(secret,value,{now:now+SESSION_SECONDS*1000+1000}),false);
});
test('Tampering, wrong signing key, expired or future cookies fail closed',async()=>{
 const value=await issueSession(secret,{remember:true,now});
 assert.equal(await validSession(secret+'changed',value,{now}),false);
 assert.equal(await validSession(secret,value.slice(0,-1)+(value.endsWith('a')?'b':'a'),{now}),false);
 assert.equal(await validSession(secret,'v1.9999999999.'+'a'.repeat(32)+'.'+'b'.repeat(64),{now}),false);
 assert.equal(await validSession(secret,null,{now}),false);
 assert.match(clearSessionCookie(),/Max-Age=0/);
});
function request(path,{method='GET',data=null,headers={}}={}){
 const initial={method,headers};
 if(data!==null){initial.body=JSON.stringify(data);initial.headers={'content-type':'application/json',...headers};}
 return new Request(base+path,initial);
}
const env={ADMIN_TOKEN:secret,DB:{prepare(){
  return {all:async()=>({results:[]}),bind(){return {all:async()=>({results:[]})}}};
}}};
test('Dashboard login rejects bad password without issuing cookie',async()=>{
 const r=await worker.fetch(request('/api/login',{method:'POST',data:{password:'bad',remember:true}}),env);
 assert.equal(r.status,401);
 assert.equal(r.headers.get('set-cookie'),null);
});
test('Login issues persistent cookie only with explicit opt-in; API opens on return visit',async()=>{
 const login=await worker.fetch(request('/api/login',{method:'POST',
   data:{password:secret,remember:true}}),env);
 assert.equal(login.status,200);
 const cookie=login.headers.get('set-cookie');
 assert.match(cookie,/HttpOnly/);
 assert.match(cookie,/SameSite=Strict/);
 assert.match(cookie,/Max-Age=2592000/);
 const status=await worker.fetch(request('/api/status',{headers:{cookie:cookie.split(';')[0]}}),env);
 assert.equal(status.status,200);
 assert.equal((await status.json()).assets.length,0);
 const without=await worker.fetch(request('/api/status'),env);
 assert.equal(without.status,401);
});
test('No-remember login still works as a browser-session-only cookie',async()=>{
 const login=await worker.fetch(request('/api/login',{method:'POST',
   data:{password:secret,remember:false}}),env);
 assert.equal(login.status,200);
 assert.doesNotMatch(login.headers.get('set-cookie'),/Max-Age=/);
});
test('Origin checks and sign-out cookie work, no local storage password',async()=>{
 const bad=await worker.fetch(request('/api/login',{method:'POST',
   headers:{origin:'https://other.example'},data:{password:secret,remember:true}}),env);
 assert.equal(bad.status,403);
 const exit=await worker.fetch(request('/api/logout',{method:'POST'}),env);
 assert.equal(exit.status,200);
 assert.match(exit.headers.get('set-cookie'),/Max-Age=0/);
 const page=await worker.fetch(request('/dashboard'),env);
 const html=await page.text();
 assert.match(html,/Remember me on this device \(30 days\)/);
 assert.match(html,/id="logout"/);
 assert.doesNotMatch(html,/localStorage\.setItem\([^\n]*password/);
 assert.match(html,/fetch\('\/api\/login'/);
 assert.match(html,/credentials:'same-origin'/);
});
