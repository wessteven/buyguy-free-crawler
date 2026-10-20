// Version 1: exact weighted OUR SCORE algorithm shared conceptually with
// the dashboard. Tests enforce numeric parity with its embedded copy.
// Score normalization cannot be rewritten retroactively in the journal.
export const ourScoreWeights=[['Liquidity / Cap',20],['Pool liquidity',15],
 ['Market cap',10],['Buy/sell balance',15],['5m activity',10],
 ['1h trend',10],['Quote freshness',5],['Market Score',5],['Safety Evidence',10]];
export const ourNum=v=>v===null||v===undefined||v===''?null:(Number.isFinite(Number(v))?Number(v):null);
export const ourClamp=n=>Math.max(0,Math.min(100,n));
export function ourScoreAssessment(row){
 const missing={score:null,base:null,factors:[],caveats:['Missing core market evidence.']};
 if(!row||['DEAD','TRASH'].includes(row.status))return missing;
 const liq=ourNum(row.liquidity),cap=ourNum(row.market_cap),
  price=ourNum(row.price),ratio=ourNum(row.liq_cap_pct);
 if(!(liq>0&&cap>0&&price>0&&ratio!==null))return missing;
 const buys=ourNum(row.buys_m5),sells=ourNum(row.sells_m5);
 const volume=buys===null||sells===null?null:buys+sells;
 const trend=ourNum(row.change_h1),age=ourNum(row.quote_age);
 const market=ourNum(row.score),safety=ourNum(row.safety);
 const factors=[];
 function add(name,weight,quality,reason){
  const rating=quality===null?0:Math.round(ourClamp(quality)*10)/10;
  factors.push({name,weight,rating,points:weight*rating/100,
   reason:(quality===null?'Missing data (0 credit). ':'')+reason});
 }
 const ratioRating=ratio<=10?ratio*3.5:ratio<=25?35+(ratio-10)*1.7:
  ratio<=50?60.5+(ratio-25)*1.58:ratio<=100?100:ratio<=200?95:75;
 add('Liquidity / Cap',20,ratioRating,'Quoted USD liquidity relative to market cap; not lock verification.');
 add('Pool liquidity',15,liq>=100000?100:liq>=50000?90:liq>=25000?75:
  liq>=15000?55:liq>=5000?30:5,'Depth of reported USD pool liquidity.');
 add('Market cap',10,cap>=50000&&cap<=250000?100:cap>250000&&cap<=1000000?80:
  cap>1000000&&cap<=10000000?60:cap>10000000?35:cap>=20000?70:30,
  'Early-discovery target; market cap is not intrinsic value.');
 add('Buy/sell balance',15,volume===null||volume<=0?null:
  volume<5?Math.max(0,(buys/volume-.3)*100):ourClamp((buys/volume-.3)*200),
  '5m buy share; trades may be bots or wash activity.');
 add('5m activity',10,volume===null?null:volume>=100?100:volume>=50?85:
  volume>=20?70:volume>=12?55:volume>=5?25:5,'5m transactions, not unique buyers.');
 add('1h trend',10,trend===null?null:trend>150?5:trend>80?35:
  trend>35?75:trend>=0?85+Math.min(trend,12)*1.25:
  trend>=-10?60:trend>=-25?30:5,'Big parabolic spikes and sharp drops score poorly.');
 add('Quote freshness',5,age===null||age<0?null:age<=15?100:
  age<=30?80:age<=60?50:age<=120?20:0,'Minutes since last matched market quote.');
 add('Market Score',5,market,'Existing market model with low weight to avoid double counting.');
 add('Safety Evidence',10,safety,'Independent partial evidence; unknown is not safe.');
 const base=factors.reduce((acc,f)=>acc+f.points,0);let total=base;
 const caveats=[];
 function limit(max,explanation){if(total>max)total=max;caveats.push(explanation);}
 if(safety===null)limit(75,'No completed safety evidence: maximum 75.');
 if(liq<15000)limit(40,'Thin pool (<$15k): maximum 40.');
 if(ratio>200)limit(70,'Ratio >200% requires cap verification: maximum 70.');
 if(trend!==null&&trend>150)limit(60,'1h spike over 150%: maximum 60.');
 if(age===null||age<0||age>120)limit(35,'Stale or missing quote: maximum 35.');
 else if(age>30)limit(65,'Quote older than 30 minutes: maximum 65.');
 if(row.green?.status==='RISK'||['MINT_CONTROL_RISK','HOLDER_CONCENTRATION_RISK'].includes(row.risk_status))
  limit(15,'On-chain safety risk flagged: maximum 15.');
 if(row.topBps!==null&&row.topBps!==undefined&&Number(row.topBps)>4000)
  limit(35,'Largest token account >40% of supply: maximum 35.');
 return {score:Math.round(total*10)/10,base:Math.round(base*10)/10,factors,caveats};
}


// Mirror the dashboard's existing Safety Evidence arithmetic. Confidence comes
// from independent evidence only: unavailable review yields null, never 100.
export function journalSafetyScore(row,route=null,now=Date.now()){
 const risk=row.risk_status||'UNVERIFIED';
 if(risk==='UNVERIFIED')return null;
 let audit={};
 try{audit=JSON.parse(row.risk_note||'{}')}catch{}
 const mint=['MINT_CONTROLS_REVOKED','PARTIAL_ONCHAIN_REVIEW','HOLDER_DATA_UNAVAILABLE',
  'TOKEN_2022_METADATA_ONLY','HOLDER_CONCENTRATION_RISK','FULL_REVIEW_PASSED'].includes(risk)?35:0;
 const holders=audit.holderStatus==='TOKEN_ACCOUNT_BALANCES_SCREENED'?20:0;
 const liquidity=Number(row.liquidity)>=50000?15:Number(row.liquidity)>=25000?8:0;
 let routeCredit=0;
 if(route&&route.asset_key===row.asset_key&&Date.parse(route.at)>=now-3600000){
  let report={};try{report=JSON.parse(route.note||'{}')}catch{}
  if(report.label==='BOTH_DIRECTIONS_QUOTED')routeCredit=15;
 }
 const last=Date.parse(row.last_seen||''),age=now-last;
 const fresh=Number.isFinite(last)&&age>=0&&age<=1200000?15:
   Number.isFinite(last)&&age>=0&&age<=7200000?7:0;
 let score=mint+holders+liquidity+routeCredit+fresh;
 const flags=Array.isArray(audit.mintFlags)?audit.mintFlags:[];
 if(['MINT_CONTROL_RISK','HOLDER_CONCENTRATION_RISK'].includes(risk)||
    flags.includes('MINT_AUTHORITY_ACTIVE')||flags.includes('FREEZE_AUTHORITY_ACTIVE'))
  score=Math.min(score,25);
 return score;
}
export function scoreForJournal(row,route,now=Date.now()){
 const last=Date.parse(row?.last_seen||'');
 const age=Number.isFinite(last)?Math.max(0,Math.floor((now-last)/60000)):null;
 let audit={};try{audit=JSON.parse(row?.risk_note||'{}')}catch{}
 const topBps=typeof audit.top1Bps==='number'&&Number.isFinite(audit.top1Bps)?audit.top1Bps:null;
 const safety=journalSafetyScore(row,route,now);
 const enriched={...row,safety,topBps,quote_age:age,liq_cap_pct:
  row.market_cap>0&&row.liquidity>=0?row.liquidity/row.market_cap*100:null};
 return {...ourScoreAssessment(enriched),safety};
}
