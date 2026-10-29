// WHAT'S GOOD / GOGET: historical, static continuation-study metrics.
// Research-only and deliberately disconnected from production scanners,
// OUR SCORE, early-launch promotion, D1, Android, wallets and trade execution.
// A single technical snapshot cannot demonstrate sustained acceleration.
const RE=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const numeric=['priceUsd','ema15m9','ema15m21','ema1h9','atr15m',
 'swingLow','swingHigh','fibSupport'];
const finitePositive=n=>typeof n==='number'&&Number.isFinite(n)&&n>0;
const percent=(a,b)=>Math.round(((a/b)-1)*100000)/1000;
const rounded=n=>Math.round(n*100000)/100000;
export function auditContinuationSnapshot(s){
 if(!s||typeof s!=='object'||!s.identity||
    !RE.test(s.identity.mint||'')||!RE.test(s.identity.pool||'')||
    !Number.isFinite(Date.parse(s.asOf||''))||!s.asOf.endsWith('Z')||
    numeric.some(k=>!finitePositive(s[k]))||
    !(s.swingHigh>s.swingLow)||
    !Array.isArray(s.bullishConfirmationZone)||
    s.bullishConfirmationZone.length!==2||
    s.bullishConfirmationZone.some(x=>!finitePositive(x))||
    !(s.bullishConfirmationZone[0]<s.bullishConfirmationZone[1])||
    !Array.isArray(s.upsideLevels)||!Array.isArray(s.downsideLevels)||
    [...s.upsideLevels,...s.downsideLevels].some(x=>!finitePositive(x))||
    !Number.isInteger(s.reconstructedTrades)||s.reconstructedTrades<0||
    !finitePositive(s.reconstructionHoursApprox))
   throw Error('INVALID_HISTORICAL_SNAPSHOT');
 const price=s.priceUsd,[confirmLow,confirmHigh]=s.bullishConfirmationZone;
 const fib382=s.swingLow+0.382*(s.swingHigh-s.swingLow);
 const fibValid=Math.abs(fib382-s.fibSupport)<=0.00001*(s.swingHigh-s.swingLow);
 // Price crossing a historical level is not proof of a closed candle, volume
 // confirmation, independent buyers or an executable trade.
 const reclaimPosition=price<confirmLow?'BELOW_RECLAIM_ZONE':
  price<=confirmHigh?'INSIDE_RECLAIM_ZONE_NOT_CONFIRMED':
   'ABOVE_RECLAIM_ZONE_NOT_CONFIRMED';
 const regime=price>s.ema15m21&&price>s.ema1h9&&price<s.ema15m9?
  'ABOVE_SLOW_EMAS_BELOW_FAST_EMA':
  price>=s.ema15m9&&s.ema15m9>=s.ema15m21?'ABOVE_15M_EMAS':
  'OTHER_OR_MIXED';
 return {
  caseId:s.caseId||null,asOf:s.asOf,
  exactIdentity:{mint:s.identity.mint,pool:s.identity.pool,chain:s.identity.chain},
  sourceType:'USER_SUPPLIED_HISTORICAL_SNAPSHOT',
  priceUsd:price,emaRegime:regime,reclaimPosition,
  indicators:{
   priceVs15mEma9Pct:percent(price,s.ema15m9),
   priceVs15mEma21Pct:percent(price,s.ema15m21),
   priceVs1hEma9Pct:percent(price,s.ema1h9),
   atrToPricePct:percent(s.atr15m+price,price),
   fastEmaVsSlow15mPct:percent(s.ema15m9,s.ema15m21),
   gapToConfirmLowPct:percent(confirmLow,price),
   gapToConfirmHighPct:percent(confirmHigh,price),
   fib382SupportComputed:fib382,
   fib382MatchesProvided:fibValid,
   priceVsFibSupportPct:percent(price,s.fibSupport)
  },
  referenceLevels:{
   bearishInvalidation:s.downsideLevels.slice(),
   bullishConfirmation:s.bullishConfirmationZone.slice(),
   upside:s.upsideLevels.slice()
  },
  reportedReconstruction:{
   identifiableTrades:s.reconstructedTrades,
   approximateHours:s.reconstructionHoursApprox,
   meanTradesPerHour:rounded(s.reconstructedTrades/s.reconstructionHoursApprox),
   evidence:s.reconstructionEvidence||'NOT_AVAILABLE',
   verifiedUniqueBuyers:null,
   // A multi-hour average is NOT 30s-5m acceleration evidence.
   independentlyVerifiedAcceleration:false
  },
  // To claim ACCELERATING we still need timestamped, non-overlapping windows,
  // actual on-chain swap directions, unique-wallet analysis and quote freshness.
  earlyLaunchBirthDetected:false,
  accelerationValidated:false,
  independentBuyerEvidence:null,
  executableExitVerified:false,
  buyQualified:false,
  classification:'HISTORICAL_CONTINUATION_WATCH_ONLY',
  unknowns:['EXACT_DECISION_TIME_LIQUIDITY','VERIFIED_BUYER_IDENTITIES',
   'CONTEMPORANEOUS_ROLLING_TRADE_WINDOWS','INDEPENDENT_SWAP_REPLAY',
   'EXECUTABLE_ENTRY_EXIT','COMPLETE_SAFETY_AUDIT'],
  caveat:'A single historical technical snapshot cannot be promoted to EARLY / ACCELERATING. Reconstructed counts are not unique buyers; later outcomes are never decision-time features.'
 };
}
