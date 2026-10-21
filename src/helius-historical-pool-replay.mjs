// Opt-in historical evidence replay. No cron, D1, or trading integrations.
// Caller must supply known historical signatures; never invent fixtures.
import {classifyHeliusSignatures} from './helius-discovery-probe.mjs';
import {verifyHeliusPoolLeads} from './helius-pool-verification.mjs';
import {PUMPSWAP} from './pumpswap.mjs';
import {RAYDIUM_CPMM} from './raydium-cpmm.mjs';
const protocols={PUMPSWAP,RAYDIUM_CPMM};
const address=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const signature=/^[1-9A-HJ-NP-Za-km-z]{80,90}$/;
export async function replayKnownPoolTransactions(env,{cases=[],fetcher=fetch}={}){
 if(!env?.HELIUS_RPC_URL)return {enabled:false,reason:'RPC_NOT_CONFIGURED',results:[]};
 if(!Array.isArray(cases)||cases.length<1||cases.length>3)throw Error('Supply 1-3 known transaction cases');
 const results=[];
 for(const item of cases){
  if(!Object.hasOwn(protocols,item?.protocol)||!signature.test(item?.signature||'')||
     !address.test(item?.expectedPool||''))throw Error('Exact protocol, signature and pool required');
  const classified=await classifyHeliusSignatures(env,{
   signatures:[item.signature],program:protocols[item.protocol],fetcher
  });
  const tx=classified.results?.[0];
  const leads=(tx?.poolEvidence?.leads||[]).filter(lead=>lead.protocol===item.protocol);
  const match=leads.find(lead=>lead.pool===item.expectedPool);
  const verification=match?await verifyHeliusPoolLeads(env,{
   leads:[match],targetMint:item.targetMint||null,fetcher
  }):null;
  results.push({protocol:item.protocol,signature:item.signature,
   expectedPool:item.expectedPool,transactionStatus:tx?.status||'NO_RESULT',
   rpcErrorReason:tx?.rpcErrorReason||null,
   leadDetected:!!match,otherLeads:leads.length-(match?1:0),
   poolVerification:verification?.results?.[0]||null,
   outcome:match?'EXPECTED_POOL_INSTRUCTION_FOUND':
    tx?.status==='RPC_ERROR'||tx?.status==='TRANSACTION_UNAVAILABLE'
      ?'INCONCLUSIVE_RPC':'EXPECTED_POOL_INSTRUCTION_NOT_FOUND'});
 }
 return {enabled:true,mode:'HISTORICAL_READ_ONLY',casesChecked:results.length,results,
  caveat:'Only independently sourced known pool creation signatures qualify as ground truth. A matched instruction does not prove safety.'};
}
