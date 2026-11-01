// GOGET forward-only early-activity study. This is an anomaly journal, NOT trade certification.
// No network calls, no wallets, no future data, no model calls.
const ADDR=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const MIN=60000;
export const SIGNAL_LIMITS=Object.freeze({
  lookbackMinutes:90,recentMinutes:15,sourceLimit:1200,
  maxSnapshots:40,topCount:20,controlCount:20,
  minRecentSignatures:3,minIndependentWallets:2,minAcceleration:3,
  excludedMints:[
    'So11111111111111111111111111111111111111112', // WSOL
    'EPjFWdd5AufqSSqeM2qQowt4rMSRaFCfPvU1rNKz' // USDC
  ]
});
const isTime=s=>typeof s==='string'&&Number.isFinite(Date.parse(s));
export function stableMintHash(mint){
  let h=2166136261;
  for(const c of mint){h=Math.imul(h^c.charCodeAt(0),16777619)>>>0;}
  return h;
}
export function detectSignalWindows(rows,{now=Date.now()}={}){
  if(!Array.isArray(rows)||rows.length>SIGNAL_LIMITS.sourceLimit)throw Error('SOURCE_ROWS_EXCEEDED');
  if(!Number.isSafeInteger(now)||now<0)throw Error('INVALID_ASOF_TIME');
  const recentStart=now-SIGNAL_LIMITS.recentMinutes*MIN;
  const horizonStart=now-SIGNAL_LIMITS.lookbackMinutes*MIN;
  const excluded=new Set(SIGNAL_LIMITS.excludedMints);
  const state=new Map();let eligibleSourceRows=0,invalidSourceRows=0;
  const get=mint=>{
    if(!state.has(mint))state.set(mint,{
      mint,recent:new Set(),prior:new Set(),recentWallets:new Set(),
      feePayers:new Set(),first:Infinity,last:-Infinity,observations:0
    });
    return state.get(mint);
  };
  for(const row of rows){
    const when=Date.parse(row?.observed_at||'');
    if(!Number.isFinite(when)||when<horizonStart||when>now||
      !ADDR.test(row?.wallet||'')||typeof row?.signature!=='string'){
      invalidSourceRows++;continue;
    }
    let d;
    try{
      if(typeof row.evidence_json!=='string'||row.evidence_json.length>18000)throw Error('bad');
      d=JSON.parse(row.evidence_json);
      if(!d||typeof d!=='object'||d.schemaVersion!==2)throw Error('old');
    }catch {invalidSourceRows++;continue;}
    // Evidence only of token outputs/inbound hints, never verified beneficial buys.
    const mints=new Set();
    for(const t of Array.isArray(d.tokenTransfers)?d.tokenTransfers.slice(0,24):[]){
      if(t?.to===row.wallet&&ADDR.test(t?.mint||''))mints.add(t.mint);
    }
    if(row.fee_payer_observed===1||row.fee_payer_observed===true){
      for(const t of Array.isArray(d.swapHints?.tokenOutputs)?d.swapHints.tokenOutputs.slice(0,8):[]){
        if(ADDR.test(t?.mint||''))mints.add(t.mint);
      }
    }
    for(const mint of mints){
      if(excluded.has(mint))continue;
      eligibleSourceRows++;
      const a=get(mint);a.observations++;
      if(when>=recentStart){
        a.recent.add(row.signature);
        a.recentWallets.add(row.wallet);
        if(row.fee_payer_observed===1||row.fee_payer_observed===true)a.feePayers.add(row.wallet);
        a.first=Math.min(a.first,when);a.last=Math.max(a.last,when);
      }else a.prior.add(row.signature);
    }
  }
  const all=[];
  for(const a of state.values()){
    if(!a.recent.size)continue;
    const recentSignatures=a.recent.size,priorSignatures=a.prior.size;
    // Rate comparison: 15-minute recent rate versus preceding 75-minute rate.
    const baselineRate=priorSignatures/(SIGNAL_LIMITS.lookbackMinutes-SIGNAL_LIMITS.recentMinutes);
    const recentRate=recentSignatures/SIGNAL_LIMITS.recentMinutes;
    const intensity=baselineRate>0?Math.round(recentRate/baselineRate*100)/100:null;
    const crossWallet=a.recentWallets.size>=SIGNAL_LIMITS.minIndependentWallets;
    const enough=recentSignatures>=SIGNAL_LIMITS.minRecentSignatures;
    const fast=priorSignatures===0||intensity>=SIGNAL_LIMITS.minAcceleration;
    const category=crossWallet&&enough&&fast?'MULTIWALLET_ACTIVITY_ACCELERATION':
      enough&&fast?'SINGLE_WALLET_ACTIVITY_ACCELERATION':'LOW_EVIDENCE_ACTIVITY';
    all.push({mint:a.mint,recentSignatures,priorSignatures,
      distinctWallets:a.recentWallets.size,feePayerWallets:a.feePayers.size,
      intensity,category,
      firstRecentAt:new Date(a.first).toISOString(),
      lastRecentAt:new Date(a.last).toISOString(),
      evidenceKind:'HELIUS_UNVERIFIED_RECEIVE_OR_SWAP_OUTPUT_HINT',
      independentlyVerifiedBuy:false,sourceObservations:a.observations});
  }
  const candidates=all.filter(x=>x.category!=='LOW_EVIDENCE_ACTIVITY')
    .sort((a,b)=>b.distinctWallets-a.distinctWallets||
      b.recentSignatures-a.recentSignatures||a.mint.localeCompare(b.mint))
    .slice(0,SIGNAL_LIMITS.topCount);
  const selected=new Set(candidates.map(x=>x.mint));
  // Keep a deterministic subset of weak/negative cases; not only apparent winners.
  const controls=all.filter(x=>!selected.has(x.mint)).sort((a,b)=>
    stableMintHash(a.mint)-stableMintHash(b.mint)||a.mint.localeCompare(b.mint))
    .slice(0,SIGNAL_LIMITS.controlCount);
  const snapshots=[...candidates.map(x=>({...x,sampleKind:'POTENTIAL_SIGNAL'})),
    ...controls.map(x=>({...x,sampleKind:'CONTROL'}))];
  return {
    asOf:new Date(now).toISOString(),bucket:new Date(Math.floor(now/(5*MIN))*(5*MIN)).toISOString(),
    observedTokenMints:all.length,eligibleSourceRows,invalidSourceRows,
    sourceCoverage:'BOUNDED_FULL_90M_WINDOW_IF_FEWER_THAN_1200_ROWS',
    unrecordedMintCount:all.length-snapshots.length,
    snapshots,modelCalls:0,heliusCalls:0,tradeOrders:0,
    caution:'NO_INDEPENDENT_OWNER_VERIFICATION;NO_PROFIT_FORECAST;MINTS_ARE_TRANSFER_HINTS'
  };
}
export function attachAsOfQuotes(snapshots,rows,{now=Date.now()}={}){
  const out=new Map();
  const byMint=new Map(snapshots.map(x=>[x.mint,x]));
  for(const q of rows||[]){
    const minute=Date.parse(q?.minute||'');
    if(!byMint.has(q?.mint)||!ADDR.test(q?.pool||'')||
      !Number.isFinite(minute)||minute>now||now-minute>3*MIN||
      !Number.isFinite(Number(q?.price_sol))||Number(q.price_sol)<=0)continue;
    const old=out.get(q.mint);
    if(!old||Date.parse(old.minute)<minute)out.set(q.mint,{
      pool:q.pool,minute:q.minute,priceSol:Number(q.price_sol)});
  }
  return snapshots.map(x=>({...x,quote:out.get(x.mint)||null,
    quoteStatus:out.has(x.mint)?'MATCHED_ASOF_POOL_NATIVE_QUOTE':'NO_FRESH_MATCHED_POOL_QUOTE'}));
}
