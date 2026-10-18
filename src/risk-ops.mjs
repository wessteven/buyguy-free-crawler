// Optional, bounded Solana mint-authority research pass.
// A ChatGPT Helius plugin does NOT grant this Worker its credentials.
// Set HELIUS_RPC_URL as a Cloudflare Worker secret to enable; absent = no calls.
import {checkSolanaMint} from './token-risk.mjs';

export async function verifyPendingMints(env,{limit=3,now=new Date().toISOString(),fetcher=fetch}={}){
  if(!env.DB)throw Error('D1 not configured');
  if(!env.HELIUS_RPC_URL)return {enabled:false,checked:0,reason:'HELlUS_RPC_URL_NOT_CONFIGURED'};
  const rows=(await env.DB.prepare(`SELECT asset_key,address,chain,score
    FROM assets WHERE chain='solana' AND risk_status='UNVERIFIED' AND status IN ('ALIVE','STATIC')
    ORDER BY score DESC LIMIT ?`).bind(Math.max(1,Math.min(4,limit))).all()).results||[];
  let checked=0,failed=0;
  for(const a of rows){
    try{
      const result=await checkSolanaMint({mint:a.address,rpcEndpoint:env.HELIUS_RPC_URL,fetcher});
      const note=JSON.stringify({checkedAt:result.checkedAt,source:result.source,flags:result.flags,
        notes:result.notes,paperEligible:false}).slice(0,700);
      const list=[
        env.DB.prepare(`UPDATE assets SET risk_status=?,risk_note=?
          WHERE asset_key=? AND risk_status='UNVERIFIED'`).bind(result.riskStatus,note,a.asset_key),
        env.DB.prepare(`INSERT INTO research_events(at,asset_key,kind,note)
          VALUES(?,?,'MINT_AUTHORITY_REVIEW',?)`).bind(now,a.asset_key,note)
      ];
      await env.DB.batch(list);checked++;
    }catch(e){
      failed++;
      console.warn('Solana mint check failed for',a.asset_key,'(secret withheld):',String(e).replace(/https:\/\/[^\s]+/g,'<redacted-url>').slice(0,130));
    }
  }
  return {enabled:true,checked,failed,
    caveat:'Mint/freeze authority only; never full contract certification'};
}
