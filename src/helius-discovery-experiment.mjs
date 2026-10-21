// Opt-in, bounded end-to-end Helius research. Never invoked by production cron.
// No D1 access, no simulated/real trading, no token ranking changes.
import {heliusDiscoveryProbe,classifyHeliusSignatures} from './helius-discovery-probe.mjs';
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
 // Only exact parsed protocol initialization or known binary IDL discriminators
 // count as pool leads. Unclassified instructions are not launch evidence.
 const leads=(classified.results||[]).flatMap(row=>
  row.poolEvidence?.status==='POOL_CREATION_LEADS'
   ?row.poolEvidence.leads.filter(lead=>lead.protocol===protocol):[]);
 const evidenceCounts={parsed:0,binary:0};
 for(const lead of leads){
  if(lead.evidence==='PARSED_INITIALIZATION_INSTRUCTION')evidenceCounts.parsed++;
  if(lead.evidence==='BINARY_IDL_DISCRIMINATOR')evidenceCounts.binary++;
 }
 const transactionStatuses={};
 const rpcErrorReasons={};
 for(const row of classified.results||[]){
  transactionStatuses[row.status]=(transactionStatuses[row.status]||0)+1;
  if(row.rpcErrorReason)rpcErrorReasons[row.rpcErrorReason]=(rpcErrorReasons[row.rpcErrorReason]||0)+1;
 }
 const verified=await verifyHeliusPoolLeads(env,{leads,targetMint,fetcher});
 return {enabled:true,mode:'READ_ONLY_RESEARCH',protocol,program,
  signaturesScanned:discovered.scanned,transactionsChecked:classified.checked,
  poolLeads:leads.length,evidenceCounts,transactionStatuses,rpcErrorReasons,
  poolsChecked:verified.checked,results:verified.results,
  status:'RESEARCH_PIPELINE_COMPLETE',
  caveat:'Exact parsed or IDL-discriminator-matched binary initialization leads are considered; account checks do not prove pool creation timing or safety.'};
}
