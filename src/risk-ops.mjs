// Bounded read-only Helius audit. NEVER certifies a token as safe or paper eligible.
// Token-account distribution is a proxy, not unique holders; cannot prove sellability.
import {checkSolanaMint} from './token-risk.mjs';
import {fetchLargestAccounts,assessLargestAccounts} from './holder-risk.mjs';

export function combineRisk(mint,holders){
  if(mint.riskStatus!=='MINT_CONTROLS_REVOKED')return mint.riskStatus;
  if(holders.status==='CONCENTRATION_WARNING')return 'HOLDER_CONCENTRATION_RISK';
  if(holders.status==='TOKEN_ACCOUNT_BALANCES_SCREENED')return 'PARTIAL_ONCHAIN_REVIEW';
  return 'HOLDER_DATA_UNAVAILABLE';
}

export async function verifyPendingMints(env,{limit=3,now=new Date().toISOString(),fetcher=fetch}={}){
  if(!env?.DB)throw Error('D1 not configured');
  if(!env.HELIUS_RPC_URL)return {enabled:false,checked:0,reason:'HELIUS_RPC_URL_NOT_CONFIGURED'};
  const checkDate=new Date(now).getTime();
  const cutoff=new Date(checkDate-60*60000).toISOString();
  const rows=(await env.DB.prepare(`SELECT a.asset_key,a.address,a.chain,a.score
    FROM assets a WHERE a.chain='solana' AND a.risk_status='UNVERIFIED'
      AND a.status IN ('ALIVE','STATIC')
      AND NOT EXISTS (SELECT 1 FROM research_events e WHERE e.asset_key=a.asset_key
       AND e.kind='MINT_AUTHORITY_REVIEW' AND e.at>?)
    ORDER BY a.score DESC LIMIT ?`).bind(cutoff,Math.max(1,Math.min(4,limit))).all()).results||[];
  let checked=0,failed=0,concentration=0;
  for(const a of rows){
    try{
      const mint=await checkSolanaMint({mint:a.address,rpcEndpoint:env.HELIUS_RPC_URL,fetcher});
      let holders={status:'NOT_CHECKED',flags:[],top1Bps:null,top5Bps:null,top20Bps:null};
      if(mint.supplyRaw && (mint.riskStatus==='MINT_CONTROLS_REVOKED'||mint.riskStatus==='TOKEN_2022_REVIEW_REQUIRED')){
        try{
          const payload=await fetchLargestAccounts({mint:a.address,rpcEndpoint:env.HELIUS_RPC_URL,fetcher});
          holders=assessLargestAccounts(a.address,mint.supplyRaw,payload);
        }catch(error){
          holders={status:'UNVERIFIED',flags:['HOLDER_RPC_UNAVAILABLE'],top1Bps:null,top5Bps:null,top20Bps:null};
        }
      }
      const riskStatus=combineRisk(mint,holders);
      const note=JSON.stringify({checkedAt:mint.checkedAt,program:mint.tokenProgram||null,decimals:mint.decimals??null,
        source:'Helius read-only Solana RPC',mintFlags:mint.flags,holderFlags:holders.flags,
        holderStatus:holders.status,top1Bps:holders.top1Bps,top5Bps:holders.top5Bps,
        top20Bps:holders.top20Bps,
        limits:'Top TOKEN ACCOUNTS may include AMM vaults; liquidity locks and sells NOT independently tested.',
        paperEligible:false});
      const safeNote=note.slice(0,1300);
      const statements=[
        env.DB.prepare(`UPDATE assets SET risk_status=?,risk_note=?
           WHERE asset_key=? AND risk_status='UNVERIFIED'`).bind(riskStatus,safeNote,a.asset_key),
        env.DB.prepare(`INSERT INTO research_events(at,asset_key,kind,note)
           VALUES(?,?,'MINT_AUTHORITY_REVIEW',?)`).bind(now,a.asset_key,safeNote)
      ];
      await env.DB.batch(statements);
      checked++;
      if(holders.status==='CONCENTRATION_WARNING')concentration++;
    }catch(error){
      failed++;
      // Never include URL, API credentials or raw RPC response in logs.
      console.warn('Solana mint review failed:',a.asset_key,
        'category:',error?.name||'UnknownError');
    }
  }
  return {enabled:true,checked,failed,concentration,
    caveat:'Read-only mint and top-token-account screening only. No holder-identity, LP-lock, or executable sell certification.'};
}
