// Exact-address user watchlist insertion for BuyGuy D1.
// No automatic buys, no contract-safety approvals, no fake quotes.
const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const evm=/^0x[0-9a-fA-F]{40}$/;
function decodePubkey(value){
 if(typeof value!=='string'||value.length<32||value.length>44)return false;
 let n=0n;
 for(const c of value){
  const digit=alphabet.indexOf(c);
  if(digit<0)return false;
  n=n*58n+BigInt(digit);
 }
 let bytes=n===0n?0:Math.ceil(n.toString(16).length/2);
 for(const ch of value){if(ch!=='1')break;bytes++;}
 return bytes===32;
}
export function normalizedWatchAddress(chain,address){
 if(chain!=='robinhood'&&chain!=='solana')return {ok:false,reason:'Choose Robinhood or Solana'};
 if(typeof address!=='string'||address.length>100||address!==address.trim())return {ok:false,reason:'Invalid address format'};
 if(chain==='robinhood'){
   if(!evm.test(address))return {ok:false,reason:'Robinhood requires a 0x-prefixed 40-hex-character contract address'};
   return {ok:true,chain,address:address.toLowerCase(),asset_key:'robinhood:'+address.toLowerCase()};
 }
 if(!decodePubkey(address))return {ok:false,reason:'Solana address must decode to a 32-byte public key'};
 return {ok:true,chain,address,asset_key:'solana:'+address};
}
export async function addWatchedAddress(db,chain,address,{now=new Date().toISOString(),maxPinned=100}={}){
 const check=normalizedWatchAddress(chain,address);
 if(!check.ok)return {ok:false,status:422,error:check.reason};
 const count=await db.prepare('SELECT COUNT(*) AS n FROM assets WHERE pinned=1').first();
 const already=await db.prepare('SELECT asset_key,pinned FROM assets WHERE asset_key=?').bind(check.asset_key).first();
 if(!already?.pinned && Number(count?.n||0)>=maxPinned)
   return {ok:false,status:409,error:'Watchlist limit reached (100 addresses)'};
 const statement="INSERT INTO assets "+
 "(asset_key,chain,address,symbol,status,risk_status,first_seen,updated_at,pinned,last_action) "+
 "VALUES(?,?,?,'PENDING','STATIC','UNVERIFIED',?,?,1,'User watchlist: pending verified market quote') "+
 "ON CONFLICT(asset_key) DO UPDATE SET "+
 "pinned=1, "+
 "status=CASE WHEN assets.status IN ('TRASH','DEAD') THEN 'STATIC' ELSE assets.status END, "+
 "last_action='Pinned by user for ongoing monitoring'";
 await db.prepare(statement).bind(check.asset_key,check.chain,check.address,now,now).run();
 return {ok:true,status:already?200:201,asset_key:check.asset_key,chain:check.chain,
   address:check.address,existed:Boolean(already),note:'Queued for monitoring. Identity/address format only; contract, pool and sellability unverified.'};
}
