// Read-only GOGET pool-identity feasibility using an independent public Solana RPC.
// One batched request, no Helius credits, no D1 writes, no trades, no Dex cooldown changes.
import {PUMPSWAP,decodePumpSwapPool} from '../src/pumpswap.mjs';
import {RAYDIUM_CPMM,decodeRaydiumCpmmPool} from '../src/raydium-cpmm.mjs';
const cf=process.env.CF_ACCOUNT_ID,db=process.env.CF_DATABASE_ID,key=process.env.CF_D1_API_TOKEN;
if(!cf||!db||!key)throw Error('PROBE_READ_ONLY_D1_UNAVAILABLE');
const now=Date.now();
const request=await fetch('https://api.cloudflare.com/client/v4/accounts/'+cf+'/d1/database/'+db+'/query',{
 method:'POST',headers:{authorization:'Bearer '+key,'content-type':'application/json'},
 body:JSON.stringify({sql:`SELECT a.pool,a.address AS mint,a.asset_key,MAX(o.seen_at) AS quote_at
 FROM assets a JOIN observations o ON o.asset_key=a.asset_key AND o.pool=a.pool
 WHERE a.chain='solana' AND o.price>0 AND o.seen_at>=? AND o.seen_at<=?
 GROUP BY a.pool,a.address,a.asset_key ORDER BY quote_at DESC LIMIT 30`,
 params:[new Date(now-120*60000).toISOString(),new Date(now).toISOString()]}),
 signal:AbortSignal.timeout(20000)});
const doc=await request.json();
if(!request.ok||doc.success!==true||doc.result?.[0]?.success!==true)throw Error('PROBE_D1_QUERY_UNVERIFIED');
const candidates=doc.result[0].results||[];
const addrs=candidates.map(x=>x.pool);
if(addrs.length<10){console.log('PILOT_ONCHAIN_PROBE',JSON.stringify({status:'FEWER_THAN_TEN_RECENT_D1_CANDIDATES',count:addrs.length}));process.exit(0)}
let response,raw,body;
try{
 response=await fetch('https://api.mainnet-beta.solana.com',{
  method:'POST',headers:{'content-type':'application/json','User-Agent':'GOGET-Pool-Research/1.0'},
  body:JSON.stringify({jsonrpc:'2.0',id:1,method:'getMultipleAccounts',
   params:[addrs,{encoding:'base64',commitment:'confirmed'}]}),
  signal:AbortSignal.timeout(16000)});
 raw=await response.text();
 if(raw.length>500000)throw Error('RPC_BODY_LIMIT');
 body=JSON.parse(raw);
 if(!response.ok||body?.error||!Number.isSafeInteger(body?.result?.context?.slot)||
  !Array.isArray(body?.result?.value)||body.result.value.length!==addrs.length)
  throw Error('RPC_PROVIDER_UNVERIFIED');
}catch(e){console.log('PILOT_ONCHAIN_PROBE',JSON.stringify({status:'PUBLIC_RPC_UNVERIFIED',http:response?.status??null,type:e.message.slice(0,65),candidates:addrs.length}));process.exit(0)}
const out=[],counts={PUMPSWAP:0,RAYDIUM_CPMM:0,NO_ACCOUNT:0,OTHER_PROGRAM:0,LAYOUT_MISMATCH:0,MINT_MISMATCH:0};
for(let i=0;i<addrs.length;i++){
 const c=candidates[i],account=body.result.value[i];
 if(!account){counts.NO_ACCOUNT++;continue}
 const protocol=account.owner===PUMPSWAP?'PUMPSWAP':account.owner===RAYDIUM_CPMM?'RAYDIUM_CPMM':null;
 if(!protocol){counts.OTHER_PROGRAM++;continue}
 const d=protocol==='PUMPSWAP'?decodePumpSwapPool(c.pool,account):decodeRaydiumCpmmPool(c.pool,account);
 if(!['PUMPSWAP_LAYOUT_VERIFIED','CPMM_LAYOUT_VERIFIED'].includes(d.status)){
  counts.LAYOUT_MISMATCH++;continue;
 }
 if(!(protocol==='PUMPSWAP'?[d.baseMint,d.quoteMint].includes(c.mint):
   [d.token0Mint,d.token1Mint].includes(c.mint)&&d.swapsEnabled===true)){
  counts.MINT_MISMATCH++;continue;
 }
 counts[protocol]++;
 out.push({pool:c.pool,mint:c.mint,protocol,owner:account.owner,
   previousQuoteAt:c.quote_at,observedSlot:body.result.context.slot});
}
console.log('PILOT_ONCHAIN_PROBE',JSON.stringify({status:out.length>=10?'TEN_ONCHAIN_POOL_IDENTITIES_VERIFIED':'INSUFFICIENT_EXACT_ONCHAIN_POOL_IDENTITIES',
 queried:addrs.length,verified:out.length,counts,verifiedPoolProofs:out.slice(0,10),
 chainSlot:body.result.context.slot,
 caveat:'Account owner, binary layout and exact mint are verified; reserves, USD price, swap execution and investor safety are NOT certified'}));
