// Manual-only workflow entrypoint. Read-only RPC; no secrets in output.
import {readFileSync} from 'node:fs';
import {importFomoCandidates} from '../src/trader-radar.mjs';
import {verifyFomoWalletActivity} from '../src/trader-radar-helius.mjs';
const key=process.env.HELIUS_API_KEY;
if(!key){console.error('TRADER_RADAR_HELIUS_SECRET_MISSING');process.exitCode=1;}
else{
 const input=JSON.parse(readFileSync(new URL('../data/trader-radar/fomo-candidates-2026-10-18.json',import.meta.url),'utf8'));
 const candidates=importFomoCandidates(input).candidates;
 const abort=new AbortController();const timeout=setTimeout(()=>abort.abort(),45000);
 try{
  const result=await verifyFomoWalletActivity({HELIUS_RPC_URL:'https://mainnet.helius-rpc.com/?api-key='+encodeURIComponent(key)},
    {candidates,maxWallets:5,signatureLimit:3,fetcher:(url,options)=>fetch(url,{...options,signal:abort.signal})});
  console.log('TRADER_RADAR_RESEARCH',JSON.stringify({mode:result.mode,snapshotDate:input.observedAt,
   source:'UNOFFICIAL_FOMO_PROFILE_SNAPSHOT',checked:result.checked,
   summary:result.wallets.map(w=>({wallet:w.wallet,status:w.status,signaturesSeen:w.signaturesSeen??0,
    activityType:w.sample?.status||'UNKNOWN',identityVerified:false,realizedPnlVerified:false})),
   productionAffected:false,paperTradingAffected:false,
   caveat:'Wallet activity does not prove social identity, realized return or independent trading control.'}));
 }catch(e){console.error('TRADER_RADAR_RESEARCH_FAILED',e?.name||'Error');process.exitCode=1;}
 finally{clearTimeout(timeout);}
}
