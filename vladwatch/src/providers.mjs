import {CHAINS, MAX_PAGES} from './config.mjs';
const TIMEOUT_MS = 6500;
function errString(e) { return (e instanceof Error ? e.message : String(e)).slice(0,220); }
async function fetchJson(url, opts = {}, fetcher = fetch) {
  const controller = new AbortController();
  const t = setTimeout(()=>controller.abort(), TIMEOUT_MS);
  try {
    const r = await fetcher(url,{...opts, signal: controller.signal});
    if (!r.ok) throw new Error(`HTTP_${r.status}`);
    const json = await r.json();
    if (!json || typeof json!=='object') throw new Error('INVALID_JSON_SHAPE');
    return json;
  } finally {clearTimeout(t);}
}
export async function rpcSnapshot(chainId,address,env={},fetcher=fetch) {
  const expected='0x'+chainId.toString(16);
  const c=CHAINS[chainId];
  const override=env[`VLAD_RPC_${chainId}`];
  const urls=[...(override?[override]:[]),...c.rpc].filter((v,i,a)=>v&&a.indexOf(v)===i);
  const attempts=[];
  for (const url of urls) {
    try {
      async function rpc(method,params=[]) {
        const j=await fetchJson(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})},fetcher);
        if(j.error || typeof j.result!=='string') throw new Error('RPC_'+JSON.stringify(j.error||'NO_RESULT').slice(0,100));
        return j.result;
      }
      const actual=await rpc('eth_chainId');
      if(BigInt(actual)!==BigInt(expected)) throw new Error(`CHAIN_MISMATCH_${actual}`);
      const [block,balance,nonce]=await Promise.all([rpc('eth_blockNumber'),rpc('eth_getBalance',[address,'latest']),rpc('eth_getTransactionCount',[address,'latest'])]);
      if (![block,balance,nonce].every(v=>/^0x[0-9a-f]+$/i.test(v))) throw new Error('RPC_INVALID_HEX');
      attempts.push({source:url,status:'checked'});
      return {status:'checked',source:url,attempts,block,wei:BigInt(balance).toString(),nonce:BigInt(nonce).toString(),snapshotOnly:true};
    } catch(e){attempts.push({source:url,status:'failed',error:errString(e)});}
  }
  return {status:'failed',source:null,attempts,snapshotOnly:true};
}
function normalizeHash(h) {return typeof h==='string'&&/^0x[0-9a-f]{64}$/i.test(h)?h.toLowerCase():null;}
function safeAddr(x){return typeof x==='string'?x.toLowerCase(): x?.hash?.toLowerCase?.()||null;}
function normalizeTx(item,kind,api,chainId,address){
  const hash=normalizeHash(item.hash||item.transaction_hash||item.tx_hash);
  if(!hash) throw new Error('TX_HASH_INVALID');
  const block=String(item.block_number??item.blockNumber??item.block??'');
  const timestamp=item.timestamp|| (item.timeStamp?new Date(Number(item.timeStamp)*1000).toISOString():null);
  if(!timestamp || Number.isNaN(Date.parse(timestamp))) throw new Error('TIMESTAMP_INVALID');
  const from=safeAddr(item.from),to=safeAddr(item.to);
  const asset=kind==='token' ? item.token?.address || item.contractAddress || null : null;
  const total= item.total || {};
  const raw= kind==='token' ? (total.value??item.value??'') : (item.value??'0');
  const decimals=kind==='token'?String(total.decimals??item.tokenDecimal??item.token?.decimals??''): '18';
  if(!/^\d+$/.test(String(raw)) || !/^\d+$/.test(decimals)) throw new Error('VALUE_INVALID');
  let id=hash;
  if(kind==='token') {
    const logindex=item.log_index??item.logIndex;
    if(logindex===undefined || logindex===null || !/^\d+$/.test(String(logindex))) throw new Error('TOKEN_LOG_INDEX_MISSING');
    if(typeof asset!=='string' || !/^0x[0-9a-f]{40}$/i.test(asset)) throw new Error('TOKEN_CONTRACT_INVALID');
    id=`${hash}:${String(logindex)}:${asset.toLowerCase()}`;
  }
  const dir=from===address.toLowerCase()?'out':to===address.toLowerCase()?'in':'other';
  const type=kind==='token'?'token_transfer':(raw!=='0'&&BigInt(raw)>0n?'native_value_movement':'contract_or_zero_value_tx');
  return {id,hash,chainId,address:address.toLowerCase(),kind:type,direction:dir,block,timestamp,from,to,asset:asset?.toLowerCase()||null,symbol:(kind==='token'?item.token?.symbol||item.tokenSymbol:null),raw:String(raw),decimals,source:api,classification:kind==='token'&&dir==='in'?'unsolicited_possible_not_confirmed':'unverified',tradeVerified:false,liquidityVerified:false};
}
export function normalizePage(json,provider,kind,chainId,address){
  let items,next=null;
  if(provider==='blockscout'){
    if(!Array.isArray(json.items)) throw new Error('BLOCKSCOUT_ITEMS_MISSING');
    items=json.items;
    next=json.next_page_params&&Object.keys(json.next_page_params).length?json.next_page_params:null;
  } else {
    if(json.status==='0' && /no transactions found/i.test(String(json.message||json.result))){items=[];}
    else if(json.status!=='1'||!Array.isArray(json.result)) throw new Error('ETHERSCAN_'+String(json.result||json.message).slice(0,120));
    else items=json.result;
    // Empty or short Etherscan page is end of this batch.
    next=items.length===100? 'NEXT_PAGE':null;
  }
  const events=items.map(item=>normalizeTx(item,kind,provider,chainId,address));
  return {events,next};
}
export async function fetchStream(pair,kind,checkpoint,env={},fetcher=fetch,hadBaseline=false){
  const {chainId,address}=pair;
  const c=CHAINS[chainId];
  const attempts=[];
  const base=`${c.explorer}/api/v2/addresses/${address}/${kind==='token'?'token-transfers':'transactions'}`;
  const candidates=[{name:'blockscout',url:base}];
  if(env.ETHERSCAN_API_KEY && c.etherscan){
    const u=new URL('https://api.etherscan.io/v2/api');
    for(const [k,v] of Object.entries({chainid:String(chainId),module:'account',action:kind==='token'?'tokentx':'txlist',address,startblock:'0',endblock:'999999999',sort:'desc',offset:'100',apikey:env.ETHERSCAN_API_KEY}))u.searchParams.set(k,v);
    candidates.push({name:'etherscan',url:u.toString()});
  }
  for (const candidate of candidates){
    const events=[];const seen=new Set(); let cursor=null,found=false,exhausted=false,page=0;
    try {
      while(page<MAX_PAGES){
        let url=candidate.url;
        if(candidate.name==='blockscout' && cursor){const u=new URL(url);for(const [k,v] of Object.entries(cursor))u.searchParams.set(k,String(v));url=u.toString();}
        if(candidate.name==='etherscan'){const u=new URL(url);u.searchParams.set('page',String(page+1));url=u.toString();}
        const headers = env.BLOCKSCOUT_PRO_API_KEY&&candidate.name==='blockscout'?{'X-API-KEY':env.BLOCKSCOUT_PRO_API_KEY}:{};
        const j=await fetchJson(url,{headers},fetcher);
        const res=normalizePage(j,candidate.name,kind,chainId,address);
        for(const event of res.events){
          if(event.id===checkpoint){found=true;break;}
          if(!seen.has(event.id)){events.push(event);seen.add(event.id);}
        }
        page++;
        if(found||!res.next){exhausted=!res.next;break;}
        cursor=res.next;
      }
      const complete=checkpoint ? found : exhausted;
      const status=complete?'checked':'partial';
      attempts.push({source:candidate.name,status,pages:page,rows:events.length,checkpointReached:found});
      return {status,source:candidate.name,attempts,events,checkpointReached:found,initialBaseline:!hadBaseline,historyExhausted:exhausted,pages:page};
    }catch(e){attempts.push({source:candidate.name,status:'failed',pages:page,error:errString(e)});}
  }
  return {status:'failed',source:null,attempts,events:[],checkpointReached:false,initialBaseline:!hadBaseline,historyExhausted:false,pages:0};
}