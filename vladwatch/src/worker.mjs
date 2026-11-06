import {PAIRS,WALLETS,CHAINS} from './config.mjs';
import {runCollector} from './collector.mjs';
function response(data,status=200){return new Response(JSON.stringify(data,null,2),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});}
const read=async(db,sql,params=[])=>await db.prepare(sql).bind(...params).all();
function authorised(req,env){
  if(!env.VLAD_VIEW_TOKEN)return true;
  const v=req.headers.get('authorization')||'';
  return v===`Bearer ${env.VLAD_VIEW_TOKEN}`;
}
export default {
  async fetch(request,env){
    const u=new URL(request.url);
    if(request.method!=='GET')return response({error:'READ_ONLY'},405);
    if(u.pathname==='/health')return response({service:'vlad-public-wallet-collector',alive:true,collectionVerified:false,note:'Liveness is not blockchain coverage'});
    if(!authorised(request,env))return response({error:'UNAUTHORIZED'},401);
    if(!env.DB)return response({error:'D1_BINDING_MISSING'},503);
    try{
      if(u.pathname==='/api/status'){
        const runs=await read(env.DB,'SELECT * FROM vladwatch_runs ORDER BY started_at DESC LIMIT 1');
        const run=runs.results?.[0]||null;
        const cov=run?await read(env.DB,'SELECT * FROM vladwatch_coverage WHERE run_id=? ORDER BY wallet_id,chain_id',[run.id]):{results:[]};
        const coverage=(cov.results||[]).map(x=>({...x,attempts:JSON.parse(x.attempts_json||'{}'),details:JSON.parse(x.details_json||'{}'),attempts_json:undefined,details_json:undefined}));
        const matched=run&&coverage.length===PAIRS.length;
        return response({project:'Vlad Public Wallet Watch',version:env.VLAD_WATCH_VERSION||'dev',mode:'READ_ONLY',run,requiredPairs:PAIRS.length,coverageComplete:!!matched&&run.state==='checked',coverageCount:coverage.length,coverage,watchlist:WALLETS.map(w=>({id:w.id,address:w.address,label:w.label,attribution:w.attribution,chains:w.chains})),caveats:['Ownership is unverified','Native RPC snapshots are NOT historical transaction scans','Inbound tokens may be spam','No token transfers are labelled swaps without trade-level proof']});
      }
      if(u.pathname==='/api/events'){
        const count=Math.max(1,Math.min(100,Number(u.searchParams.get('limit')||25)||25));
        const r=await read(env.DB,`SELECT * FROM vladwatch_events ORDER BY discovered_at DESC,occurred_at DESC LIMIT ?`,[count]);
        return response({project:'Vlad Public Wallet Watch',events:r.results||[],ownership:'UNVERIFIED',tradeProof:'NOT_PROVIDED'});
      }
      return response({error:'NOT_FOUND',endpoints:['/health','/api/status','/api/events']},404);
    }catch(e){return response({error:'DATABASE_READ_FAILURE',detail:String(e).slice(0,160)},503);}
  },
  async scheduled(_controller,env,ctx){
    ctx.waitUntil(runCollector(env,'cron').catch(e=>{console.error('VLADWATCH_COLLECTOR_FAILED',String(e));throw e;}));
  }
};