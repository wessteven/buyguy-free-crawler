import test from 'node:test';
import assert from 'node:assert/strict';
import {safeSocialUrl,collectSocialLinks,socialsJson} from '../src/social-links.mjs';
test('Project-profile links include HTTPS website, X, Telegram and other networks',()=>{
 const links=collectSocialLinks({websites:[{label:'Website',url:'https://hello.example/'},
    {label:'Docs',url:'https://docs.hello.example'}],
    socials:[{type:'twitter',url:'https://x.com/actualproject'},
      {type:'telegram',url:'https://t.me/actualproject'},
      {type:'discord',url:'https://discord.gg/code'}]});
 assert.deepEqual(links.map(x=>x.label),['X','TG','Web','Discord','Docs']);
 assert.equal(links.length,5);
});
test('DEX profiles and pool info combine without duplicate links',()=>{
 const s=collectSocialLinks({links:[{type:'twitter',url:'https://x.com/actualproject'}]},
    {socials:[{type:'twitter',url:'https://x.com/actualproject/'}]});
 assert.equal(s.length,1);
 assert.ok(socialsJson({websites:[{url:'https://token.example'}]}).includes('token.example'));
});
test('Gecko twitter and Telegram handles accepted only with strict identities',()=>{
 const links=collectSocialLinks({twitter_handle:'@token123',telegram_handle:'token_group'});
 assert.equal(links.length,2);
 assert.ok(links.some(x=>x.url==='https://x.com/token123'));
 assert.ok(links.some(x=>x.url==='https://t.me/token_group'));
});
test('Unsafe URLs, embedded credentials, scripts, controls and missing HTTPS are rejected',()=>{
 for(const url of ['javascript:alert(1)','data:text/html,<img>','http://unsafe.example',
  'https://user:pass@x.com/fake','https://localhost/x','https://a.local/path',
  'https://x.com/fake\n<script>','https://','//t.me/fake'])
  assert.equal(safeSocialUrl(url),null,url);
 const links=collectSocialLinks({websites:[{url:'javascript:alert(1)'},
   {url:'https://real.example',label:'Site'}],socials:[{type:'x',url:'http://x.com/nonssl'}]});
 assert.deepEqual(links,[{label:'Web',url:'https://real.example/'}]);
});
test('Metadata is optional; never fabricate a social account for an unknown token',()=>{
 assert.deepEqual(collectSocialLinks({websites:[],socials:[]}),[]);
 assert.deepEqual(collectSocialLinks(),[]);
});
