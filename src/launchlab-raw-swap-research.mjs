// GOGET / WHAT'S GOOD: raw Raydium LaunchLab swap-instruction research decoder.
// Research-only, no network, no D1, no trade, no alert. Account positions and
// discriminators pinned to raydium-io/raydium-idl v0.2.0:
// https://github.com/raydium-io/raydium-idl/blob/master/raydium_launchpad/raydium_launchpad.json
// A successful instruction is NOT independent-beneficial-buyer proof, executed
// quote volume, curve reserve proof, liquidity or an executable exit.
import {decodeBase58Instruction} from './helius-binary-pool.mjs';
import {LAUNCHLAB_PROGRAM} from './launchlab-birth-research.mjs';

const addr=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const sig=/^[1-9A-HJ-NP-Za-km-z]{80,90}$/;
const utc=x=>typeof x==='string'&&
 /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(x)&&
 Number.isFinite(Date.parse(x));
const TOKEN='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const TOKEN_2022='TokenzQdBNbLqP5VEhdkAS6EPF4rEM3LhLQzwkpA3sA';
const variants=[
 ['BUY_EXACT_IN','buy',[250,234,13,123,213,156,19,236]],
 ['BUY_EXACT_OUT','buy',[24,211,116,40,105,3,153,56]],
 ['SELL_EXACT_IN','sell',[149,39,222,155,211,124,152,26]],
 ['SELL_EXACT_OUT','sell',[95,200,71,34,8,9,11,166]]
];
const validSlot=x=>Number.isSafeInteger(x)&&x>0;
const u64=(bytes,offset)=>{
 let n=0n;
 for(let i=7;i>=0;i--)n=(n<<8n)|BigInt(bytes[offset+i]);
 return n.toString();
};
const rejected=(status,detail=null)=>({
 status,detail,swaps:[],count:0,sourceIdentityIndependentlyVerified:false,
 independentBuyersVerified:null,executedQuoteSol:null,actualLiveAlertLatencyMs:null,
 buyQualified:false
});

/**
 * Input is the *raw* jsonParsed getTransaction result plus actual provider
 * receipt timestamp. No caller-supplied "decoded swap" or fee payer is trusted.
 * A transaction can contain multiple instructions, including CPI inner swaps.
 */
export function decodeLaunchlabSwapTransaction({
 transaction,signature,receivedAt
}={}){
 if(!sig.test(signature||'')||!utc(receivedAt))
  return rejected('INVALID_SIGNATURE_OR_RECEIPT');
 if(!transaction||!validSlot(transaction.slot)||
    !validSlot(transaction.blockTime)||
    Date.parse(receivedAt)<transaction.blockTime*1000)
  return rejected('INVALID_TRANSACTION_TIME_OR_SLOT');
 if(!transaction.meta||!Object.hasOwn(transaction.meta,'err'))
  return rejected('TRANSACTION_RESULT_UNKNOWN');
 if(transaction.meta.err!==null)return rejected('FAILED_TRANSACTION');
 const message=transaction.transaction?.message;
 if(!Array.isArray(transaction.transaction?.signatures)||
    transaction.transaction.signatures[0]!==signature)
  return rejected('TRANSACTION_SIGNATURE_MISMATCH');
 const keys=message?.accountKeys;
 if(!Array.isArray(keys)||!keys.length||
    !addr.test(keys[0]?.pubkey||'')||keys[0].signer!==true)
  return rejected('FEE_PAYER_SIGNER_UNVERIFIED');
 const feePayer=keys[0].pubkey;
 const signerKeys=new Set(keys.filter(x=>x?.signer===true&&addr.test(x?.pubkey||''))
  .map(x=>x.pubkey));
 const instructions=[
  ...(message.instructions||[]),
  ...(transaction.meta.innerInstructions||[]).flatMap(x=>x.instructions||[])
 ];
 const swaps=[];let malformed=0,matching=0;
 for(const ix of instructions){
  if(ix?.programId!==LAUNCHLAB_PROGRAM)continue;
  const bytes=decodeBase58Instruction(ix.data);
  if(!bytes||bytes.length<8)continue;
  const variant=variants.find(x=>x[2].every((v,i)=>bytes[i]===v));
  if(!variant)continue;
  matching++;
  const accounts=ix.accounts;
  if(bytes.length!==32||!Array.isArray(accounts)||accounts.length<15||
      !accounts.slice(0,15).every(x=>typeof x==='string'&&addr.test(x))||
      accounts[14]!==LAUNCHLAB_PROGRAM||
      !signerKeys.has(accounts[0])||
      ![TOKEN,TOKEN_2022].includes(accounts[11])||
      ![TOKEN,TOKEN_2022].includes(accounts[12])||
      new Set([accounts[4],accounts[9],accounts[10]]).size!==3){
   malformed++;continue;
  }
  const [kind,side]=variant;
  const args=[u64(bytes,8),u64(bytes,16),u64(bytes,24)];
  swaps.push({
   kind,side,signature,slot:transaction.slot,blockTime:transaction.blockTime,
   chainTime:new Date(transaction.blockTime*1000).toISOString(),
   receivedAt,programId:LAUNCHLAB_PROGRAM,
   curve:accounts[4],mint:accounts[9],quoteMint:accounts[10],
   traderSigner:accounts[0],feePayer,
   userBaseTokenAccount:accounts[5],userQuoteTokenAccount:accounts[6],
   baseVault:accounts[7],quoteVault:accounts[8],
   token2022:accounts[11]===TOKEN_2022||accounts[12]===TOKEN_2022,
   instructionArgumentsU64:{first:args[0],second:args[1],shareFeeRate:args[2]},
   requestedQuoteUnits:kind==='BUY_EXACT_IN'||kind==='SELL_EXACT_OUT'?args[0]:null,
   requestedQuoteUnitsCaveat:'Instruction arguments are requests, not observed executed transfer amounts.',
   executedQuoteSol:null,independentBuyersVerified:null,
   sourceProof:'SUCCESSFUL_SIGNED_LAUNCHLAB_SWAP_INSTRUCTION',
   sourceIdentityIndependentlyVerified:false,
   instructionIdentityDecodedFromRaw:true,
   liquidityUsd:null,marketCapUsd:null,executableExitVerified:false,
   buyQualified:false
  });
 }
 if(malformed)return rejected('MALFORMED_SWAP_INSTRUCTION',{matching,malformed});
 if(!swaps.length)return rejected('NO_SUPPORTED_SWAP_INSTRUCTION');
 return {
  status:'DECODED_SUCCESSFUL_SWAP_INSTRUCTION',
  signature,slot:transaction.slot,receivedAt,feePayer,
  count:swaps.length,swaps,
  sourceIdentityIndependentlyVerified:false,
  instructionIdentityDecodedFromRaw:true,independentBuyersVerified:null,executedQuoteSol:null,
  actualLiveAlertLatencyMs:null,buyQualified:false,
  caveat:'Validated successful LaunchLab instruction/accounts and signer from raw RPC shape; no proof of transfer amount, beneficial buyer, token safety, reserves, valuation or sellability.'
 };
}
