// GOGET Trader Radar: bounded historical wallet evidence, manual research only.
// No production imports, mutations, trading, PnL claims, or external price APIs.
import {isSolanaAddress} from './trader-radar.mjs';
const USDC='EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const USDT='Es9vMFrzaCERmJfrF4H2FYD4KCoNkM1SNEtP9qjn4Ms';
const STABLE=new Set([USDC,USDT]);
const VALID_SIG=/^[1-9A-HJ-NP-Za-km-z]{80,90}$/;
const bounded=(v,defaultValue,max)=>Number.isFinite(Number(v))?Math.max(1,Math.min(max,Math.floor(Number(v)))):defaultValue;
function amount(row){
 const s=row?.uiTokenAmount?.amount,d=row?.uiTokenAmount?.decimals;
 if(typeof s!=='string'||!/^\d+$/.test(s)||!Number.isInteger(d)||d<0||d>18)return null;
 // Refuse values whose integer representation cannot be trusted by JS Number.
 const big=BigInt(s);if(big>BigInt(Number.MAX_SAFE_INTEGER))return null;
 const n=Number(big)/10**d;return Number.isFinite(n)?n:null;
}
export function reconstructHistoricalWalletTx(wallet,tx){
 const none=(status,extra={})=>({status,wallet,tradeCandidate:null,...extra});
 if(!isSolanaAddress(wallet))return none('INVALID_WALLET');
 if(!tx||tx.meta?.err)return none('FAILED_OR_MISSING_TRANSACTION');
 const pre=tx.meta?.preTokenBalances,post=tx.meta?.postTokenBalances;
 if(!Array.isArray(pre)||!Array.isArray(post))return none('TOKEN_BALANCE_EVIDENCE_MISSING');
 const signature=tx.transaction?.signatures?.[0];
 const blockTime=tx.blockTime;
 if(!VALID_SIG.test(signature||'')||!Number.isInteger(blockTime)||blockTime<1500000000)
  return none('SIGNATURE_OR_TIME_MISSING');
 const accounts=new Map();let malformed=false,ownershipConflict=false;
 for(const [side,rows] of [['pre',pre],['post',post]]){
  for(const row of rows){
   if(!Number.isInteger(row?.accountIndex)||!isSolanaAddress(row?.mint)){malformed=true;continue;}
   const value=amount(row);if(value===null){malformed=true;continue;}
   const existing=accounts.get(row.accountIndex)||{pre:null,post:null};
   if(existing[side]!==null){malformed=true;continue;}
   existing[side]={owner:row.owner,mint:row.mint,amount:value};
   accounts.set(row.accountIndex,existing);
  }
 }
 if(malformed)return none('MALFORMED_TOKEN_BALANCE');
 const deltaByMint=new Map();
 for(const {pre:before,post:after} of accounts.values()){
  if(before&&after&&(before.mint!==after.mint||before.owner!==after.owner)){ownershipConflict=true;break;}
  const owner=(before||after).owner,mint=(before||after).mint;
  if(!isSolanaAddress(owner)||!isSolanaAddress(mint)){ownershipConflict=true;break;}
  if(owner!==wallet)continue;
  deltaByMint.set(mint,(deltaByMint.get(mint)||0)+(after?.amount||0)-(before?.amount||0));
 }
 if(ownershipConflict)return none('TOKEN_ACCOUNT_OWNER_CHANGED');
 const deltas=[...deltaByMint].filter(([,d])=>Math.abs(d)>1e-9).map(([mint,delta])=>({mint,delta}));
 if(deltas.length!==2)return none('NOT_SIMPLE_TWO_SIDED_SWAP',{tokenDeltas:deltas});
 const stable=deltas.filter(x=>STABLE.has(x.mint));
 if(stable.length!==1)return none('NO_UNIQUE_STABLE_QUOTE',{tokenDeltas:deltas});
 const quote=stable[0],base=deltas.find(x=>x!==quote);
 if(!(quote.delta*base.delta<0))return none('NON_OPPOSING_DELTAS',{tokenDeltas:deltas});
 const rawKeys=tx.transaction?.message?.accountKeys||[];
 const signerWallet=rawKeys.some(x=>(typeof x==='string'?x:x?.pubkey)===wallet&&x?.signer===true);
 const event={wallet,mint:base.mint,signature,at:new Date(blockTime*1000).toISOString(),
  side:base.delta>0?'BUY':'SELL',quantity:Math.abs(base.delta),
  quoteMint:quote.mint,quoteUnits:Math.abs(quote.delta),
  quoteApproxUsd:Math.abs(quote.delta),quotePegAssumed:true,
  feeLamports:Number.isSafeInteger(tx.meta.fee)?tx.meta.fee:null,
  walletSignerObserved:signerWallet,
  evidence:'SIMPLE_OPPOSING_WALLET_TOKEN_DELTAS',
  confirmed:false,basisKnown:false,feesUsd:null,independenceVerified:false};
 return {status:'RESEARCH_TRADE_CANDIDATE',wallet,tradeCandidate:event,
  caveat:'A balance-derived candidate is not a venue-certified fill, fiat conversion, all-history cost basis, signer attribution, or independently verified profitable trade.'};
}
async function rpc(url,method,params,fetcher){
 const response=await fetcher(url,{method:'POST',headers:{'content-type':'application/json'},
  body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});
 if(!response?.ok)throw Error('RPC_HTTP');
 const data=await response.json();
 if(data?.error||!Object.hasOwn(data,'result'))throw Error('RPC_PAYLOAD');
 return data.result;
}
export async function replayHistoricalWallet(env,{wallet,fetcher=fetch,
 pages=2,perPage=5,maxTransactions=10}={}){
 if(!isSolanaAddress(wallet))return {enabled:false,reason:'INVALID_WALLET'};
 if(!env?.HELIUS_RPC_URL)return {enabled:false,reason:'RPC_NOT_CONFIGURED'};
 const count=bounded(perPage,5,10),pageCap=bounded(pages,2,3);
 const transactionCap=bounded(maxTransactions,10,20);
 const signatures=[],seen=new Set();let before,exhausted=false,listingError=false;
 for(let page=0;page<pageCap&&signatures.length<transactionCap;page++){
  let found;
  try{found=await rpc(env.HELIUS_RPC_URL,'getSignaturesForAddress',
   [wallet,{limit:count,commitment:'confirmed',...(before?{before}:{})}],fetcher);}
  catch{listingError=true;break;}
  if(!Array.isArray(found)){listingError=true;break;}
  for(const row of found){
   if(!VALID_SIG.test(row?.signature||'')||seen.has(row.signature))continue;
   seen.add(row.signature);
   if(signatures.length<transactionCap)signatures.push(row);
  }
  if(found.length<count){exhausted=true;break;}
  const last=found.at(-1)?.signature;
  if(!VALID_SIG.test(last||'')||last===before){listingError=true;break;}
  before=last;
 }
 const observations=[];let fetchFailures=0;
 for(const row of signatures){
  if(row.err){observations.push({signature:row.signature,status:'FAILED_CHAIN_TRANSACTION'});continue;}
  try{
   const tx=await rpc(env.HELIUS_RPC_URL,'getTransaction',
    [row.signature,{encoding:'jsonParsed',commitment:'confirmed',maxSupportedTransactionVersion:0}],fetcher);
   const rebuilt=reconstructHistoricalWalletTx(wallet,tx);
   observations.push({signature:row.signature,status:rebuilt.status,
    candidate:rebuilt.tradeCandidate});
   if(!tx||tx.transaction?.signatures?.[0]!==row.signature){fetchFailures++;observations.at(-1).status='SIGNATURE_MISMATCH_OR_MISSING';observations.at(-1).candidate=null;}
  }catch{fetchFailures++;observations.push({signature:row.signature,status:'TX_FETCH_FAILED'});}
 }
 return {enabled:true,mode:'READ_ONLY_BOUNDED_HISTORICAL_REPLAY',wallet,
  signaturesObserved:signatures.length,transactionsInspected:observations.length,
  candidateTrades:observations.filter(x=>x.candidate).length,
  observations,sourceExhausted:exhausted,listingError,fetchFailures,
  coverageComplete:false,realizedPnlUsd:null,realizedScore:null,
  caveat:'Bounded RPC retrieval is NOT a complete cost basis or historical performance audit; no candidate is eligible as a verified trade or buy signal.'};
}
