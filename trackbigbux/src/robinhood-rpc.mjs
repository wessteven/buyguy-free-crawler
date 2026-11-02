// Public Robinhood Chain RPC fallback: ERC20 Transfer logs only, NEVER inferred swaps.
// Robinhood documents the keyless public RPC as rate limited and not production-grade.
export const ROBINHOOD_RPC='https://rpc.mainnet.chain.robinhood.com';
export const CHAIN_ID=4663;
export const ERC20_TRANSFER_TOPIC='0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
export const MAX_BLOCK_WINDOW=6000;
export const MAX_LOGS_PER_WALLET=3500;
const addressRe=/^0x[0-9a-f]{40}$/i;
const hashRe=/^0x[0-9a-f]{64}$/i;
export const topicAddress=address=>{
 if(!addressRe.test(address))throw Error('RPC_INVALID_ADDRESS');
 return '0x'+address.slice(2).toLowerCase().padStart(64,'0');
};
export const parseHexInt=val=>{
 if(typeof val!=='string'||!/^0x[0-9a-f]+$/i.test(val))throw Error('RPC_INVALID_HEX');
 const n=Number(BigInt(val));
 if(!Number.isSafeInteger(n))throw Error('RPC_INTEGER_OVERFLOW');
 return n;
};
export async function rpcCall(method,params,fetcher=fetch){
 const ctrl=new AbortController();
 const timeout=setTimeout(()=>ctrl.abort(),12000);
 try{
   const res=await fetcher(ROBINHOOD_RPC,{method:'POST',signal:ctrl.signal,
     headers:{accept:'application/json','content-type':'application/json'},
     body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});
   if(!res.ok)throw Error('ROBINHOOD_RPC_HTTP_'+res.status);
   const doc=await res.json();
   if(doc?.error)throw Error('ROBINHOOD_RPC_CODE_'+String(doc.error.code||'unknown'));
   if(!Object.hasOwn(doc||{},'result'))throw Error('ROBINHOOD_RPC_MISSING_RESULT');
   return doc.result;
 }finally{clearTimeout(timeout);}
}
export async function readHead(fetcher=fetch){
 const chain=await rpcCall('eth_chainId',[],fetcher);
 if(parseHexInt(chain)!==CHAIN_ID)throw Error('ROBINHOOD_RPC_WRONG_CHAIN');
 const number=await rpcCall('eth_blockNumber',[],fetcher);
 return parseHexInt(number);
}
export function flowWindow(checkpoint,head){
 if(!Number.isSafeInteger(head)||head<0)throw Error('RPC_INVALID_HEAD');
 const prev=/^rpc:(\d+)$/.exec(String(checkpoint||''))?.[1];
 const baseline=prev===undefined;
 let from=baseline?Math.max(0,head-3000):Number(prev)+1;
 if(!Number.isSafeInteger(from)||from<0)throw Error('RPC_INVALID_CHECKPOINT');
 const to=Math.min(head,from+MAX_BLOCK_WINDOW-1);
 return {from,to,baseline,backlog:to<head,empty:from>head};
}
export function normalizeFlow(wallet,log,observedAt){
 if(!log||!addressRe.test(log.address||'')||!hashRe.test(log.transactionHash||'')||
    !/^0x[0-9a-f]+$/i.test(log.logIndex||'')||
    !/^0x[0-9a-f]+$/i.test(log.blockNumber||'')||
    log.removed===true || !Array.isArray(log.topics)||
    log.topics.length!==3||
    log.topics[0]?.toLowerCase()!==ERC20_TRANSFER_TOPIC||
    !log.topics.slice(1).every(x=>hashRe.test(x))||
    !/^0x[0-9a-f]{64}$/i.test(log.data||'')) return null;
 const from='0x'+log.topics[1].slice(-40).toLowerCase();
 const to='0x'+log.topics[2].slice(-40).toLowerCase();
 const own=wallet.address.toLowerCase();
 if(from!==own&&to!==own)return null;
 let block,idx;
 try{block=parseHexInt(log.blockNumber);idx=parseHexInt(log.logIndex);}catch(e){return null;}
 const direction=from===own&&to===own?'SELF':from===own?'OUT':'IN';
 const tx=log.transactionHash.toLowerCase();
 const value='0x'+log.data.slice(2).toLowerCase();
 return {
   wallet_id:wallet.id,chain:'robinhood',tx_id:tx+':'+String(idx),
   occurred_at:null,height:String(block),observed_at:observedAt,
   category:'ERC20_TRANSFER_NOT_SWAP',initiated:'UNVERIFIED',
   source:'robinhood_public_rpc',
   evidence_json:JSON.stringify({tx_hash:tx,log_index:idx,token_contract:log.address.toLowerCase(),
     from,to,direction,raw_value_hex:value,unit:'token_raw',provider:'Robinhood public RPC',
     classification:'TOKEN_TRANSFER_NOT_BUY_OR_SELL'})
 };
}
export async function collectRpcWallet(wallet,checkpoint,head,fetcher,record,observedAt){
 if(!addressRe.test(wallet.address)||wallet.chain!=='robinhood')throw Error('RPC_WALLET_MISMATCH');
 const win=flowWindow(checkpoint?.newest_tx_id,head),ownTopic=topicAddress(wallet.address);
 const receipts=[],logs=[];
 if(!win.empty){
   for(const [direction,topics] of [
     ['OUT',[ERC20_TRANSFER_TOPIC,ownTopic]],
     ['IN',[ERC20_TRANSFER_TOPIC,null,ownTopic]]
   ]){
     try{
       const result=await rpcCall('eth_getLogs',[{
         fromBlock:'0x'+win.from.toString(16),toBlock:'0x'+win.to.toString(16),topics
       }],fetcher);
       if(!Array.isArray(result))throw Error('ROBINHOOD_RPC_LOGS_SCHEMA');
       record('robinhood_public_rpc','eth_getLogs_'+direction,'OK',result.length,
         'range='+win.from+':'+win.to);
       receipts.push({direction,rows:result.length});
       logs.push(...result);
     }catch(e){
       record('robinhood_public_rpc','eth_getLogs_'+direction,'FAILED',0,String(e.message||e).slice(0,160));
       throw e;
     }
   }
 }
 if(logs.length>MAX_LOGS_PER_WALLET)throw Error('ROBINHOOD_RPC_LOG_CAP_EXCEEDED');
 const events=new Map(),observed=observedAt||new Date().toISOString();
 let invalid=0;
 for(const log of logs){
   const event=normalizeFlow(wallet,log,observed);
   if(!event)invalid++;
   else events.set(event.tx_id,event);
 }
 // Never advance the watermark when the source returned malformed logs; otherwise data could be lost.
 if(invalid)throw Error('ROBINHOOD_RPC_INVALID_LOGS_'+invalid);
 return {
   events:[...events.values()],
   status:win.baseline?'RPC_BASELINE_TRANSFER_ONLY':
     win.backlog?'RPC_BACKLOG_TRANSFER_ONLY':'RPC_TRANSFER_ONLY',
   checkpointMatched:!win.baseline,
   latest:'rpc:'+String(win.empty?head:win.to),
   latestAt:observed,
   fetched:logs.length,calls:receipts.length,
   provider:'robinhood_public_rpc',blockWindow:win
 };
}
