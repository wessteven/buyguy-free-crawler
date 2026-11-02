// trackCA is address-first. Names with no verified contract remain in coverage; no symbol matching.
export const ASSETS = Object.freeze([
{id:'pons',name:'PONS',chain:'robinhood',address:'0x39dBED3a2bd333467115dE45665cC57F813C4571',priority:true,pool:'0x10CC6BD38112cAc182db90B6a71d8Bb5939526bA'},
{id:'ai',name:'Artificial Inu (AI)',chain:'robinhood',address:'0x2E8c31162b855A2ffa90F6F8634643Ad6F111e18',priority:true,pool:'0xc4a21f9d6485FC5893DD4A491B320a83daf4da1d'},
{id:'cashcat',name:'CASHCAT',chain:'robinhood',address:'0x020bfC650A365f8BB26819deAAbF3E21291018b4',priority:true,pool:'0xA70fc67C9F69da90B63a0e4C05D229954574E313'},
{id:'ameme',name:'A Meme Coin',chain:'robinhood',address:'0x385F4f8ae47651ce5F58F5265395a669f8281e18',identity_status:'PROVISIONAL_BLOCKSCOUT',priority:false,reason:'Blockscout verified-panel candidate 2026-11-02; confirm historical intended pool'},
{id:'zzz',name:'ZZZ',chain:'robinhood',address:'0x7dbf38976f6D3b9c529e7D9484A71898B409eE6a',identity_status:'PROVISIONAL_BLOCKSCOUT',priority:false,reason:'Blockscout verified-panel candidate 2026-11-02; confirm historical intended pool'},
{id:'boner',name:'BONER',chain:'robinhood',address:'0x98096d17e191B3dA1d5f99a6D7b3584351b11E18',identity_status:'PROVISIONAL_BLOCKSCOUT',priority:false,reason:'Blockscout verified-panel candidate 2026-11-02; confirm historical intended pool'},
{id:'index',name:'INDEX',chain:'robinhood',address:'0x56910D4409F3a0C78C64DD8D0545FF0705389870',priority:true,pool:'0x00dd2df2f17d431cf3a0938f06c9cf9abc5e9643b6cc466ca3f71f3af246edf3',pool_kind:'v4_pool_id'},
{id:'ubik',name:'UBIK',chain:'robinhood',address:'0x812486EAea648819853F8E372dc9f1516C7868Bd',identity_status:'PROVISIONAL_BLOCKSCOUT',priority:false,reason:'Blockscout verified-panel candidate 2026-11-02; confirm historical intended pool'},
{id:'bun',name:'BUN',chain:'robinhood',address:'0x07EBB29a38Fbcb41563817e5E19f2ceC619C90D2',priority:true,pool:'0x06e308b77bdafd691d179645296ce8c40e33c6af4a879a913efc7eedc402581c',pool_kind:'v4_pool_id'},
{id:'moo',name:'Memory Cow Moo (MOO)',chain:'robinhood',address:'0xD9dB30BB0D2b8d2eae3826A1372117E058791e18',identity_status:'PROVISIONAL_BLOCKSCOUT',priority:false,reason:'Blockscout verified-panel candidate 2026-11-02; confirm historical intended pool'},
{id:'delta',name:'DELTA',chain:'robinhood',address:'0xe8ffd7e24187F72afB08d75B1bb13088A989a791',priority:true,pool:'0xD64FbdA67E1015dF43Fa5e49F02cA844729E5F94'},
{id:'thinkingcat',name:'Thinking Cat',chain:'robinhood',address:'0x7FE995a80075dF3Dc8Ae11A9b82c7FE4202CD87f',priority:false},
{id:'prologue',name:'PROLOGUE',chain:'robinhood',address:'0xb9972CA7188e511174947E3936a5315ac7073277',priority:false},
{id:'hoodfun',name:'Hoodfun',chain:'robinhood',address:null,priority:false,reason:'Multiple HFUN mints'},
{id:'microduck',name:'microduck',chain:'robinhood',address:'0xD5f1afEA47b1A9eab414D2ee740cF1d6d039E725',priority:false},
{id:'pair',name:'PAIR',chain:'robinhood',address:'0x6b1d42927B1a84eC28Fa88d4fC6FA7AF404966be',identity_status:'PROVISIONAL_BLOCKSCOUT',priority:false,reason:'Blockscout verified-panel candidate 2026-11-02; confirm historical intended pool'},
{id:'arrow',name:'ARROW',chain:'robinhood',address:'0xf2915d1e3C1B0c769d0c756Ec43F1c1f6c99cD03',priority:true,pool:'0xE40d98D88038e0B844f844dce6Ae3c79ec01ec53'},
{id:'robincat',name:'ROBINCAT',chain:'robinhood',address:'0xded852De9fe9bA9b6f27f39e8e81CF851A5C79cc',identity_status:'PROVISIONAL_BLOCKSCOUT',priority:false,reason:'Blockscout verified-panel candidate 2026-11-02; confirm historical intended pool'},
{id:'spacehood',name:'SPACEHOOD',chain:'robinhood',address:'0xFe7E19CbCe2f896C6C528BC355bAF5a768291E18',identity_status:'PROVISIONAL_BLOCKSCOUT',priority:false,reason:'Blockscout verified-panel candidate 2026-11-02; confirm historical intended pool'},
{id:'goose',name:'Golden Goose',chain:'robinhood',address:'0xcaCB0e9caCcee63ec4d82952E561a291c68Bcb68',priority:false},
{id:'injoh',name:'SINJOH / INJOH',chain:'robinhood',address:'0x2cC0FAC44B8252f6B10208B091aFf2c94B4da77D',priority:true,pool:'0xB09fa4f04032b9d9e690ac4a1d29523b5f9A72DC',holding:true},
{id:'mihao',name:'MIHAO (ni hao cat)',chain:'solana',address:'4CxjZyMNoF1p6eXHXHv1TWpS2X47CuUmLwtGe18spump',priority:true,pool:null}
]);
export const ROBINHOOD=ASSETS.filter(a=>a.chain==='robinhood');
export const MIHAO=ASSETS.find(a=>a.id==='mihao');
export const PRIORITIES=ROBINHOOD.filter(a=>a.priority);
