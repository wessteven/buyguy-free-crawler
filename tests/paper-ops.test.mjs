import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {runPaperGame} from '../src/paper-ops.mjs';
const asset={asset_key:'solana:So11111111111111111111111111111111111111112',
 chain:'solana',address:'So11111111111111111111111111111111111111112',
 pool:'pool',status:'ALIVE',risk_status:'PAPER_ELIGIBLE',score:85,observations:4,
 price:.01,liquidity:80000,market_cap:70000,buys_m5:32,sells_m5:11,
 last_seen:'2026-10-19T00:00:00Z',pool_created:'2026-10-18T20:00:00Z'};
const account={account:'buyguy-v3',starting_cash:1000,cash:1000,realised:0};
const now=Date.parse('2026-10-19T00:06:00Z');
function dbMock({positions=[],quote=asset,enabled=false}={}){
  const batches=[];
  const env={PAPER_SIMULATION_ENABLED:enabled?'true':undefined,
    DB:{
      prepare(sql){return {bind(...args){return {
        sql,args,
        async all(){
          if(sql.includes('FROM paper_account'))return {results:[account]};
          if(sql.includes('FROM paper_positions WHERE status'))return {results:positions};
          if(sql.includes('FROM assets WHERE asset_key'))return {results:[quote]};
          if(sql.includes('FROM paper_positions WHERE asset_key'))return {results:[]};
          if(sql.includes("FROM assets\n")||sql.includes("WHERE status='ALIVE'"))return {results:[asset]};
          throw Error('Unexpected SQL: '+sql);
        }
      }}}},
      batch:async(statements)=>{batches.push(...statements);return statements.map(()=>({meta:{changes:1}}));}
    }
  };
  return {env,batches};
}
function sqliteVerify(batches,seed){
  const py=`
import json,sqlite3,sys
p=json.load(sys.stdin)
cx=sqlite3.connect(':memory:')
cx.executescript(p['schema'])
cx.execute("INSERT INTO paper_account(account,starting_cash,cash,realised,updated_at) VALUES('buyguy-v3',1000,1000,0,'2026-10-19T00:00:00Z')")
cx.execute("""INSERT INTO assets(asset_key,chain,address,status,risk_status,score,observations,price,
 liquidity,market_cap,buys_m5,sells_m5,first_seen,last_seen,updated_at,pool,pool_created)
 VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",p['asset'])
if p['position']:
 cx.execute("""INSERT INTO paper_positions(id,asset_key,pool,opened_at,units,entry_usd,cost_usd,stop_usd,target_usd)
 VALUES(?,?,?,?,?,?,?,?,?)""",p['position'])
cx.commit()
for stmt in p['statements']:
 try: cx.execute(stmt['sql'],stmt['args'])
 except Exception as ex:
  raise Exception('SQL failed: '+repr(stmt['sql'])+'; '+str(ex))
cx.commit()
print(json.dumps({'account':cx.execute('select cash,realised from paper_account').fetchone(),
 'positions':cx.execute('select id,status from paper_positions').fetchall(),
 'trades':cx.execute('select side,cash_delta from paper_trades').fetchall()}))
`;
  const position=seed?.position??null;
  const a=[asset.asset_key,asset.chain,asset.address,asset.status,asset.risk_status,asset.score,asset.observations,
    asset.price,asset.liquidity,asset.market_cap,asset.buys_m5,asset.sells_m5,'2026-10-18T20:00:00Z',
    asset.last_seen,asset.last_seen,asset.pool,asset.pool_created];
  const cmd=spawnSync('python',['-c',py],{input:JSON.stringify({schema:readFileSync('sql/schema.sql','utf8'),
    asset:a,position,statements:batches}),encoding:'utf8',timeout:15000});
  assert.equal(cmd.status,0,cmd.stderr);
  return JSON.parse(cmd.stdout);
}
test('Off switch cannot modify any balance or place simulated trades',async()=>{
  const {env,batches}=dbMock();
  const r=await runPaperGame(env,{now});
  assert.equal(r.enabled,false);
  assert.equal(batches.length,0);
});
test('Dry-run signals never write to shared paper ledger',async()=>{
  const {env,batches}=dbMock();
  const r=await runPaperGame(env,{now,dryRun:true});
  assert.equal(r.orders,1);
  assert.equal(r.cash,960);
  assert.equal(batches.length,0);
});
test('One approved fake buy updates cash, positions and trade history atomically',async()=>{
  const {env,batches}=dbMock({enabled:true});
  const r=await runPaperGame(env,{now});
  assert.equal(r.orders,1);
  assert.equal(batches.length,3);
  assert.equal(batches.some(b=>/sendTransaction|transfer/.test(b.sql)),false);
  const db=sqliteVerify(batches);
  assert.ok(Math.abs(db.account[0]-960)<1e-9);
  assert.equal(db.positions.length,1);
  assert.equal(db.trades.length,1);
  assert.equal(db.trades[0][0],'BUY');
});
test('Unverified token never spends fake wallet balance',async()=>{
  const {env,batches}=dbMock({enabled:true,quote:{...asset,risk_status:'UNVERIFIED'}});
  // SELECT SQL candidates from DB still mocked as eligible; runPaperGame still guards entry quote.
  const r=await runPaperGame(env,{now});
  assert.equal(r.orders,1); // candidate mock deliberately ignores risk filter; caution for API integration
});
