// Strict Helius Parsed Events v1 -> minimal historical transfer-flow adapter.
// Observations are retrospective, indicative NATIVE (SOL/token) flow only.
// No USD estimates, no trading, no inference from vague swap descriptions.
const BASE58=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const SIGNATURE=/^[1-9A-HJ-NP-Za-km-z]{64,88}$/;
const WSOL='So11111111111111111111111111111111111111112';
function rawInteger(v){
 if(typeof v==='number')return Number.isSafeInteger(v)&&v>0?v:null;
 if(typeof v==='string'&&/^[1-9][0-9]{0,15}$/.test(v)){
  const n=Number(v);return Number.isSafeInteger(n)?n:null;
 }
 return null;
}
function amount(raw,decimals){
 if(!Number.isInteger(decimals)||decimals<0||decimals>18)return null;
 const n=rawInteger(raw);
 if(n===null)return null;
 const x=n/10**decimals;
 return Number.isFinite(x)&&x>0?x:null;
}
const failed=code=>({ok:false,reason:code,normalized:null});
export function normalizeParsedEventForNativeRatio(event,{pool,mint,expectedSignature}={}){
 if(!BASE58.test(pool||'')||!BASE58.test(mint||'')||
   !SIGNATURE.test(expectedSignature||'')||mint===WSOL)
   throw Error('EXPECTED_IDENTITY_INVALID');
 if(event?.signature!==expectedSignature||event?.parserStatus!=='OK')
   return failed('SOURCE_SIGNATURE_OR_PARSE_UNVERIFIED');
 const parsed=event.parsed;
 if(!parsed||parsed.transactionStatus!=='OK'||parsed.error!=null||
    String(parsed.summary?.type||'').toLowerCase()!=='swap')
   return failed('NOT_VERIFIED_PARSED_SWAP');
 if(!Number.isSafeInteger(parsed.slot)||parsed.slot<=0||
    !Number.isSafeInteger(parsed.blockTime)||parsed.blockTime<1500000000)
   return failed('SOURCE_BLOCK_TIME_UNVERIFIED');
 if(!Array.isArray(parsed.instructions)||parsed.instructions.length>150||
    !parsed.instructions.some(i=>Array.isArray(i.rawAccounts)&&i.rawAccounts.includes(pool)))
   return failed('EXACT_POOL_INSTRUCTION_UNVERIFIED');
 if(!Array.isArray(parsed.tokenTransfers)||parsed.tokenTransfers.length>50)
   return failed('TOKEN_TRANSFERS_INVALID');
 const normalized=[];
 for(const x of parsed.tokenTransfers){
  const touchesPool=x?.fromUserAccount===pool||x?.toUserAccount===pool;
  if(!touchesPool)continue;
  if(!BASE58.test(x?.mint||'')||!BASE58.test(x?.fromUserAccount||'')||
     !BASE58.test(x?.toUserAccount||''))
   return failed('POOL_TOKEN_TRANSFER_IDENTITY_INVALID');
  const qty=amount(x.rawTokenAmount,x.decimals);
  if(qty===null)return failed('POOL_TOKEN_TRANSFER_AMOUNT_UNVERIFIED');
  normalized.push({mint:x.mint,tokenAmount:qty,
    fromUserAccount:x.fromUserAccount,toUserAccount:x.toUserAccount});
 }
 if(!normalized.some(x=>x.mint===mint))
   return failed('TARGET_MINT_POOL_TRANSFER_MISSING');
 const wsolPoolLegs=normalized.filter(x=>x.mint===WSOL);
 if(!wsolPoolLegs.length){
  if(!Array.isArray(parsed.nativeTransfers)||parsed.nativeTransfers.length>80)
   return failed('NATIVE_TRANSFER_SHAPE_UNVERIFIED');
  for(const x of parsed.nativeTransfers){
   const touchesPool=x?.fromUserAccount===pool||x?.toUserAccount===pool;
   if(!touchesPool)continue;
   if(!BASE58.test(x?.fromUserAccount||'')||!BASE58.test(x?.toUserAccount||''))
    return failed('POOL_NATIVE_TRANSFER_IDENTITY_INVALID');
   const qty=amount(x.amount,9);
   if(qty===null)return failed('POOL_NATIVE_TRANSFER_AMOUNT_UNVERIFIED');
   normalized.push({mint:WSOL,tokenAmount:qty,
     fromUserAccount:x.fromUserAccount,toUserAccount:x.toUserAccount});
  }
 }
 return {ok:true,reason:null,normalized:{
   signature:event.signature,timestamp:parsed.blockTime,slot:parsed.slot,
   type:'SWAP',transactionError:null,
   accountData:[{account:pool}],tokenTransfers:normalized
 },source:'HELIUS_PARSED_EVENTS_V1_EXACT_INSTRUCTION_AND_TRANSFER_EVIDENCE',
 unitCaveat:'Raw token units converted using explicit token decimals; native lamports converted by 1e9.'};
}
