// Opt-in, bounded end-to-end Helius research. Never invoked by production cron.
// No D1 access, no simulated/real trading, no token ranking changes.
import {heliusDiscoveryProbe,classifyHeliusSignatures,classifyPoolCreationLead} from './helius-discovery-probe.mjs';
import {verifyHeliusPoolLeads} from './helius-pool-verification.mjs';
import {PUMPSWAP} from './pumpswap.mjs';
import {RAYDIUM_CPMM} from './raydium-cpmm.mjs';
const programs={PUMPSWAP,RAYDIUM_CPMM};
export async function runHeliusDiscoveryExperiment(env,{
 protocol='PUMPSWAP',signatureLimit=5,targetMint=null,fetcher=fetch
}={}){
 if(!env?.HELIUS_RPC_URL)return {enabled:false,reason:'RPC_NOT_CONFIGURED'};
 if(!Object.hasOwn(programs,protocol))return {enabled:false,reason:'UNSUPPORTED_PROTOCOL'};
 const program=programs[protocol];
 const discovered=await heliusDiscoveryProbe(env,{program,limit:Math.min(5,signatureLimit),fetcher});
 if(!discovered.enabled)return discovered;
 const classified=await classifyHeliusSignatures(env,{
  program,signatures:discovered.candidates.filter(x=>x.status==='UNCLASSIFIED').map(x=>x.signature),
  fetcher
 });
 // Second-stage classifier must never claim that an arbitrary transaction
 // creates a pool. Only parsed protocol initialization instructions count.
 const leads=[];
 for(const row of classified.results||[]){
  if(row.status!=='UNCLASSIFIED')continue;
  // The lightweight signature classifier does not retain raw transactions.
  // Therefore this stage cannot safely infer a pool; leave leads empty until
  // a transaction-evidence-preserving classifier is available.
 }
 const verified=await verifyHeliusPoolLeads(env,{leads,targetMint,fetcher});
 return {enabled:true,mode:'READ_ONLY_RESEARCH',protocol,program,
  signaturesScanned:discovered.scanned,transactionsChecked:classified.checked,
  poolLeads:leads.length,poolsChecked:verified.checked,results:verified.results,
  status:'SIGNATURES_CLASSIFIED_POOL_EVIDENCE_NOT_YET_CONNECTED',
  caveat:'No pool inference from signatures. Parsed transaction evidence must be retained before pool verification.'};
}
