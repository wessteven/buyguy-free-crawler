// Research-only external evidence probe: no D1, wallet, scheduling or trades.
// Runs solely when manually invoked. Provider results are not safety certification.
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const SOL=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const EVM=/^0x[0-9a-fA-F]{40}$/;
const RISK_KEYS=['is_honeypot','cannot_sell_all','is_mintable','mint_authority',
 'freeze_authority','is_open_source','is_proxy','hidden_owner',
 'owner_change_balance','is_blacklisted','transfer_pausable',
 'is_locked','buy_tax','sell_tax','holder_count','closable',
 'metadata_mutable','balance_mutable','transfer_fee','transfer_hook'];

export function validateAsset(input){
 const chain=String(input?.chain||'').toLowerCase();
 if(!['solana','robinhood'].includes(chain))throw Error('UNSUPPORTED_CHAIN');
 const pattern=chain==='solana'?SOL:EVM;
 const raw=String(input?.address||'');
 if(!pattern.test(raw))throw Error('INVALID_TOKEN_ADDRESS');
 const address=chain==='robinhood'?raw.toLowerCase():raw;
 const candidate=input?.pool===undefined||input?.pool===null?'':String(input.pool);
 if(candidate&&!pattern.test(candidate))throw Error('INVALID_POOL_ADDRESS');
 return {chain,address,pool:chain==='robinhood'?candidate.toLowerCase():candidate};
}
const norm=(v,chain)=>chain==='robinhood'?String(v||'').toLowerCase():String(v||'');
const numeric=v=>v===undefined||v===null||v===''||!Number.isFinite(Number(v))?null:Number(v);

export function dexEvidence(payload,asset){
 if(!Array.isArray(payload))return {status:'INVALID_RESPONSE',pairs:[]};
 const pairs=payload.filter(p=>p&&p.chainId===asset.chain&&
  (norm(p.baseToken?.address,asset.chain)===asset.address||
   norm(p.quoteToken?.address,asset.chain)===asset.address)&&
  (!asset.pool||norm(p.pairAddress,asset.chain)===asset.pool));
 if(!pairs.length)return {status:asset.pool?'NO_EXACT_POOL':'NO_EXACT_TOKEN',pairs:[]};
 return {status:'MATCHED',exactPool:!!asset.pool,unverifiedPoolChoice:!asset.pool,
  pairs:pairs.slice(0,5).map(p=>{
   const base=norm(p.baseToken?.address,asset.chain)===asset.address;
   return {pool:String(p.pairAddress||''),tokenSide:base?'base':'quote',
    priceUsd:base&&numeric(p.priceUsd)>0?numeric(p.priceUsd):null,
    liquidityUsd:numeric(p.liquidity?.usd),
    buys5m:numeric(p.txns?.m5?.buys),sells5m:numeric(p.txns?.m5?.sells),
    providerQuoteTimestamp:null,uniqueBuyersVerified:false};
  }),truncated:pairs.length>5};
}

export function goPlusEvidence(payload,asset){
 if(!payload||payload.code!==1||!payload.result||
  typeof payload.result!=='object'||Array.isArray(payload.result))
  return {status:'INCOMPLETE_OR_INVALID_RESPONSE',fields:{}};
 const matches=Object.entries(payload.result).filter(([key])=>norm(key,asset.chain)===asset.address);
 if(matches.length!==1||!matches[0][1]||typeof matches[0][1]!=='object'||
  Array.isArray(matches[0][1]))return {status:'NO_EXACT_TOKEN',fields:{}};
 const record=matches[0][1],fields={};
 for(const key of RISK_KEYS){
  const value=record[key];
  if(value!==undefined&&value!==null&&['string','number','boolean'].includes(typeof value))
   fields[key]=String(value).slice(0,100);
 }
 return {status:Object.keys(fields).length?'MATCHED':'MATCHED_NO_RECOGNIZED_FIELDS',
  fields,independentContractVerification:false,safetyCertified:false};
}

export async function probeFreeSources(input,fetcher=fetch){
 const asset=validateAsset(input),observedAt=new Date().toISOString();
 const urlDex='https://api.dexscreener.com/tokens/v1/'+asset.chain+'/'+asset.address;
 const urlRisk=asset.chain==='solana'?
  'https://api.gopluslabs.io/api/v1/solana/token_security?contract_addresses='+asset.address:
  'https://api.gopluslabs.io/api/v1/token_security/4663?contract_addresses='+asset.address;
 async function read(url,normalizer){
  try{
   const response=await fetcher(url,{method:'GET',headers:{accept:'application/json'},
    signal:AbortSignal.timeout(8000)});
   if(!response||!response.ok)return {status:'HTTP_'+(response?.status||'UNKNOWN')};
   let payload;
   try{payload=await response.json();}catch{return {status:'INVALID_JSON'};}
   return normalizer(payload,asset);
  }catch{return {status:'FETCH_FAILED_OR_TIMEOUT'};}
 }
 const market=await read(urlDex,dexEvidence);
 const risk=await read(urlRisk,goPlusEvidence);
 return {researchOnly:true,asset,observedAt,marketSource:'DEX Screener',
  riskSource:'GoPlus Security',requestsAttempted:2,market,risk,
  limits:['Provider response time is not a certified quote timestamp.',
   '5m buy/sell counts do not identify unique buyers.',
   'Reported pool liquidity does not prove executable sell depth.',
   'GoPlus fields are third-party, partial risk evidence—not a safety verdict.',
   'Without a supplied pool, no canonical pool is inferred.']};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [chain,address,pool,...extra]=process.argv.slice(2);
 if(extra.length||!chain||!address){
  console.error('Usage: node research/free-source-probe.mjs solana|robinhood TOKEN_ADDRESS [POOL_ADDRESS]');
  process.exitCode=2;
 }else{
  try{console.log(JSON.stringify(await probeFreeSources({chain,address,pool}),null,2));}
  catch(error){console.error(String(error?.message||'INVALID_INPUT'));process.exitCode=2;}
 }
}
