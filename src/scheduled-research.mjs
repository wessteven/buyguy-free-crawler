// Independent scheduled stages: market-provider outages do not suppress
// on-chain authority reviews or no-data retirement.
// No secret values or RPC URLs in logs.
import {cronScan} from './light-scan.mjs';
import {verifyPendingMints} from './risk-ops.mjs';
import {retireDormantAssets} from './retirement.mjs';
import {runPaperGame} from './paper-ops.mjs';
import {screenTradeRoutes} from './route-ops.mjs';
export async function scheduledResearch(env,{
 market=cronScan,verify=verifyPendingMints,retire=retireDormantAssets,paper=runPaperGame,route=screenTradeRoutes
}={}){
  if(!env?.DB)throw Error('D1 binding missing');
  const report={market:'SKIPPED',risk:'SKIPPED',route:'SKIPPED',retirement:'SKIPPED',paper:'DISABLED'};
  try{
    report.market=await market(env);
  }catch(error){
    report.market='FAILED';
    console.warn('Market discovery interrupted:',error?.name||'UnknownError',
      '(no wallet changes)');
  }
  if(env.HELIUS_RPC_URL){
    try{
      const result=await verify(env);
      report.risk=result?.checked??0;
      if(result?.failed)console.warn('Partial mint audit failures:',result.failed);
    }catch(error){
      report.risk='FAILED';
      console.warn('Mint research interrupted:',error?.name||'UnknownError');
    }
  }
  if(env.HELIUS_RPC_URL){
    try{
      const result=await route(env);
      report.route=result?.checked??0;
    }catch(error){
      report.route='FAILED';
      console.warn('Read-only Jupiter route screening interrupted:',error?.name||'UnknownError');
    }
  }
  try{
    report.retirement=await retire(env.DB);
  }catch(error){
    report.retirement='FAILED';
    console.warn('Retirement update interrupted:',error?.name||'UnknownError');
  }
  // The switch defaults off and is NEVER set by deployment.
  if(env.PAPER_SIMULATION_ENABLED==='true'){
    try{
      report.paper=await paper(env);
    }catch(error){
      report.paper='FAILED';
      console.error('Paper-only accounting failed:',error?.name||'UnknownError');
    }
  }
  console.log('BuyGuy independent scheduled phases',JSON.stringify(report));
  return report;
}
