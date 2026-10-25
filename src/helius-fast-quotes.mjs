// Direct confirmed-state indicative prices. PumpSwap + wrapped SOL only.
// No trade execution, last-trade claim, unique-buyer claim or arbitrary AMM math.
import {decodePumpSwapPool} from './pumpswap.mjs';
import {SPL_TOKEN,TOKEN_2022} from './token-risk.mjs';
export const WSOL='So11111111111111111111111111111111111111112';
const programs=[SPL_TOKEN,TOKEN_2022];
const integer=v=>typeof v==='string'&&/^\d+$/.test(v);
function fail(code){throw Error(code)}
export async function readAccounts(env,keys,{fetcher=fetch,minSlot=0,encoding='jsonParsed',metrics={}}={}){
 if(!keys.length||keys.length>100)fail('ACCOUNT_BATCH_BUDGET');
 const url=env.HELIUS_RPC_URL;
 if(typeof url!=='string'||!url.startsWith('https://mainnet.helius-rpc.com/'))fail('HELIUS_NOT_CONFIGURED');
 metrics.rpc_calls=(metrics.rpc_calls||0)+1;
 const config={encoding,commitment:'confirmed'};
 if(minSlot)config.minContextSlot=minSlot;
 let response;
 try{response=await fetcher(url,{method:'POST',headers:{'content-type':'application/json'},
  body:JSON.stringify({jsonrpc:'2.0',id:1,method:'getMultipleAccounts',params:[keys,config]}),signal:AbortSignal.timeout(8000)})}catch{fail('RPC_NETWORK_ERROR')}
 if(!response.ok)fail('RPC_HTTP_'+response.status);
 const text=await response.text();metrics.response_bytes=(metrics.response_bytes||0)+new TextEncoder().encode(text).length;
 let body;try{body=JSON.parse(text)}catch{fail('RPC_MALFORMED_JSON')}
 if(body.error)fail('RPC_ERROR_'+String(body.error.code));
 const result=body.result;
 if(!Number.isSafeInteger(result?.context?.slot)||result.context.slot<minSlot||!Array.isArray(result.value)||result.value.length!==keys.length)fail('RPC_SLOT_OR_BATCH_INVALID');
 return {slot:result.context.slot,accounts:new Map(keys.map((key,i)=>[key,result.value[i]])),received_at:new Date().toISOString()};
}
export function makeRegistry(target,account){
 const p=decodePumpSwapPool(target.pool,account);
 if(p.status!=='PUMPSWAP_LAYOUT_VERIFIED')return {supported:false,...target,reason:p.status,program:account?.owner||null};
 if(![p.baseMint,p.quoteMint].includes(target.address))return {supported:false,...target,reason:'TARGET_MINT_MISMATCH'};
 if(target.address===WSOL||![p.baseMint,p.quoteMint].includes(WSOL))return {supported:false,...target,reason:'WSOL_PAIR_REQUIRED'};
 return {...target,supported:true,decoder:'PUMPSWAP_RESERVE_RATIO_V1',baseMint:p.baseMint,quoteMint:p.quoteMint,baseVault:p.baseVault,quoteVault:p.quoteVault};
}
export async function discoverRegistry(env,targets,{fetcher=fetch,metrics={}}={}){
 const unique=[...new Map(targets.filter(t=>t.chain==='solana').map(t=>[t.pool,t])).values()].slice(0,40);
 if(!unique.length)return {registry:[],rejected:[],slot:null};
 const state=await readAccounts(env,unique.map(t=>t.pool),{fetcher,encoding:'base64',metrics});
 const classified=unique.map(t=>makeRegistry(t,state.accounts.get(t.pool)));
 const candidates=classified.filter(t=>t.supported).slice(0,20),rejected=classified.filter(t=>!t.supported);
 if(!candidates.length)return {registry:[],rejected,slot:state.slot};
 const keys=[...new Set(candidates.flatMap(p=>[p.pool,p.baseMint,p.quoteMint,p.baseVault,p.quoteVault]))];
 const checked=await readAccounts(env,keys,{fetcher,minSlot:state.slot,metrics});
 const registry=[];
 for(const p of candidates){try{calculateSnapshot(p,checked);if(registry.length<5)registry.push(p)}catch(e){rejected.push({...p,supported:false,reason:e.message})}}
 return {registry,rejected,slot:checked.slot};
}
function mintDecimals(account){
 const parsed=account?.data?.parsed;
 if(!programs.includes(account?.owner)||parsed?.type!=='mint'||parsed.info?.isInitialized!==true||!Number.isInteger(parsed.info.decimals)||parsed.info.decimals<0||parsed.info.decimals>18)fail('MINT_DECIMALS_UNVERIFIED');
 return parsed.info.decimals;
}
function vaultAmount(account,mint,authority,decimals,mintProgram){
 const parsed=account?.data?.parsed,info=parsed?.info;
 if(account?.owner!==mintProgram||!programs.includes(account?.owner)||parsed?.type!=='account'||info?.mint!==mint||info.owner!==authority||info.state!=='initialized'||info.tokenAmount?.decimals!==decimals||!integer(info.tokenAmount?.amount))fail('VAULT_IDENTITY_OR_STATE_INVALID');
 const raw=BigInt(info.tokenAmount.amount);if(raw<=0n)fail('EMPTY_RESERVE');return raw;
}
export function calculateSnapshot(target,state){
 const p=makeRegistry(target,state.accounts.get(target.pool));
 if(!p.supported||['baseMint','quoteMint','baseVault','quoteVault'].some(k=>p[k]!==target[k]))fail('POOL_REGISTRY_CHANGED');
 const bm=state.accounts.get(p.baseMint),qm=state.accounts.get(p.quoteMint);
 const bd=mintDecimals(bm),qd=mintDecimals(qm);
 const b=vaultAmount(state.accounts.get(p.baseVault),p.baseMint,p.pool,bd,bm.owner);
 const q=vaultAmount(state.accounts.get(p.quoteVault),p.quoteMint,p.pool,qd,qm.owner);
 const solRaw=p.baseMint===WSOL?b:q;
 if(solRaw<1000000000n)fail('INSUFFICIENT_SOL_RESERVE');
 const targetIsBase=target.address===p.baseMint;
 const numerator=targetIsBase?q*10n**BigInt(bd):b*10n**BigInt(qd);
 const denominator=targetIsBase?b*10n**BigInt(qd):q*10n**BigInt(bd);
 const price_sol=Number(numerator*10n**18n/denominator)/1e18;
 if(!Number.isFinite(price_sol)||price_sol<=0)fail('PRICE_NOT_REPRESENTABLE');
 return {asset_key:target.asset_key,chain:'solana',address:target.address,symbol:target.symbol,pool:target.pool,
  slot:state.slot,commitment:'confirmed',received_at:state.received_at,decoder:target.decoder,
  base_mint:p.baseMint,quote_mint:p.quoteMint,price_sol,price_usd:null,base_reserve_raw:b.toString(),quote_reserve_raw:q.toString(),base_decimals:bd,quote_decimals:qd,
  price_method:'INDICATIVE_RESERVE_RATIO',source:'Helius confirmed account state',unique_buyers:null,trade_volume:null,
  caveat:'Pre-fee marginal reserve ratio, not an executable quote or last trade; transfer fees/extensions may affect execution.'};
}
export async function readPumpSnapshots(env,registry,{fetcher=fetch,minSlot=0,metrics={}}={}){
 if(registry.length>5)fail('POOL_BUDGET');
 const keys=[...new Set(registry.flatMap(p=>[p.pool,p.baseMint,p.quoteMint,p.baseVault,p.quoteVault]))];
 const state=await readAccounts(env,keys,{fetcher,minSlot,metrics});
 const quotes=[],rejected=[];
 for(const target of registry){try{quotes.push(calculateSnapshot(target,state))}catch(e){rejected.push({pool:target.pool,reason:e.message})}}
 return {slot:state.slot,received_at:state.received_at,quotes,rejected};
}
export function parseSolUsdTrades(trades,now=Date.now()){
 if(!Array.isArray(trades))return null;
 const t=trades[0],at=Number(t?.timestampms||Number(t?.timestamp)*1000),price=Number(t?.price);
 if(!Number.isFinite(at)||now-at<0||now-at>60000||!Number.isFinite(price)||price<=0)return null;
 return {price,source:'Gemini SOLUSD last trade',source_at:new Date(at).toISOString(),received_at:new Date(now).toISOString()};
}
export async function solUsdReference(fetcher=fetch){
 try{const r=await fetcher('https://api.gemini.com/v1/trades/solusd?limit_trades=1',{signal:AbortSignal.timeout(5000)});if(!r.ok)return null;return parseSolUsdTrades(await r.json())}catch{return null}
}
