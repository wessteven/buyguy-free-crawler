// Manual-only known-signature historical replay. Never logs credentials or raw RPC.
import {replayKnownPoolTransactions} from '../src/helius-historical-pool-replay.mjs';
const key=process.env.HELIUS_API_KEY;
const protocol=process.env.PROTOCOL;
const signature=process.env.TX_SIGNATURE;
const expectedPool=process.env.EXPECTED_POOL;
if(!key||!signature||!expectedPool||!['PUMPSWAP','RAYDIUM_CPMM'].includes(protocol)){
 console.error('MISSING_OR_INVALID_REPLAY_INPUT');process.exitCode=1;
}else{
 const endpoint='https://mainnet.helius-rpc.com/?api-key='+encodeURIComponent(key);
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),45000);
 try{
  const report=await replayKnownPoolTransactions({HELIUS_RPC_URL:endpoint},{
   cases:[{protocol,signature,expectedPool}],
   fetcher:(url,options)=>fetch(url,{...options,signal:controller.signal})
  });
  const item=report.results[0];
  console.log('HISTORICAL_REPLAY',JSON.stringify({
   protocol,transactionStatus:item.transactionStatus,rpcErrorReason:item.rpcErrorReason,
   leadDetected:item.leadDetected,otherLeads:item.otherLeads,outcome:item.outcome,
   poolAccountStatus:item.poolVerification?.status||'NOT_CHECKED',
   poolAccountVerified:item.poolVerification?.poolAccountVerified===true
  }));
  if(item.outcome==='INCONCLUSIVE_RPC')process.exitCode=2;
 }catch(error){
  console.error('HISTORICAL_REPLAY_FAILED',error?.name||'Error');process.exitCode=1;
 }finally{clearTimeout(timer);}
}
