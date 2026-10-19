// Bounded read-only Jupiter $40 round-trip quote evidence for Solana leads.
// No swaps, signing, transaction building, transfer or real wallet interaction.
import {getRoundTripQuotes} from './quote-route.mjs';

export async function screenTradeRoutes(env,{now=new Date().toISOString(),limit=1,fetcher=fetch}={}){
  if(!env?.DB)throw Error('D1 unavailable');
  // Check route only when mint + account concentration screen previously passed.
  // A router returning a quote does NOT establish liquidity lock or executable sale.
  const since=new Date(Date.parse(now)-60*60000).toISOString();
  const rows=(await env.DB.prepare(`SELECT a.asset_key,a.address,a.score,a.market_cap,
    a.liquidity,a.observations,a.last_seen,a.pool_created FROM assets a
    WHERE a.chain='solana' AND a.status='ALIVE'
    AND a.risk_status='PARTIAL_ONCHAIN_REVIEW'
    AND a.liquidity>=50000 AND a.market_cap BETWEEN 50000 AND 250000
    AND a.observations>=3 AND a.score>=72 AND a.last_seen>=?
    AND NOT EXISTS (SELECT 1 FROM research_events e
      WHERE e.asset_key=a.asset_key AND e.kind='ROUNDTRIP_QUOTE' AND e.at>?)
    ORDER BY a.score DESC LIMIT ?`)
    .bind(new Date(Date.parse(now)-20*60000).toISOString(),since,Math.max(1,Math.min(2,limit))).all()).results||[];
  let checked=0,success=0,unavailable=0;
  for(const asset of rows){
    let result;
    try{
      result=await getRoundTripQuotes(asset.address,{fetcher,key:env.JUPITER_API_KEY||null});
    }catch(err){
      result={label:'QUOTE_PROVIDER_UNAVAILABLE',source:'Jupiter read-only quotes',
        flags:['QUOTE_SERVICE_UNAVAILABLE'],errorClass:String(err?.message||'').match(/HTTP\s+\d+/)?.[0]||'NO_ROUTE_DATA',
        note:'No order submitted. Provider error does not establish token safety or a sellability verdict.'};
      unavailable++;
    }
    const details=JSON.stringify({...result,checkedAt:now,paperEligible:false}).slice(0,1300);
    await env.DB.prepare(`INSERT INTO research_events(at,asset_key,kind,note)
      VALUES(?,?,'ROUNDTRIP_QUOTE',?)`).bind(now,asset.asset_key,details).run();
    checked++;if(result.label==='BOTH_DIRECTIONS_QUOTED')success++;
  }
  return {checked,success,unavailable,provenSafe:0,paperTrades:0};
}
