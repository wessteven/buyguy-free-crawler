// trackBIGBUX v1: exact public addresses, research-only, frozen coverage denominator.
// Labels originate from publicly attributable research; ownership and profitability remain provisional.
export const ROSTER_VERSION = '2026-11-02-v1';
export const WALLETS = Object.freeze([
  {id:'sol-g4',chain:'solana',name:'G4',address:'4t5cayg6FDWkyQwyuYq9DqcRRCQ7e6JXyf9J7f2wfZQW',cohort:'momentum'},
  {id:'sol-polish-batman',chain:'solana',name:'Polish Batman',address:'7zs3Cda5C8XWadmFKKfuPyXpo78F5AFY6RXQ3Ec5p9k7',cohort:'momentum'},
  {id:'sol-decu',chain:'solana',name:'Decu',address:'4vw54BmAogeRV3vPKWyFet5yf8DTLcREzdSzx4rw9Ud9',cohort:'scalper'},
  {id:'sol-cented',chain:'solana',name:'Cented',address:'CyaE1VxvBrahnPWkqm5VsdCvyS2QmNht2UFrKJHga54o',cohort:'scalper'},
  {id:'sol-end837',chain:'solana',name:'end837',address:'5DBkonys2H4qHr5x9CCeXPLSWEFbnnLFP1RdfxjJgzvy',cohort:'whale'},
  {id:'rh-unipcs',chain:'robinhood',name:'Unipcs',address:'0x0a6ebed0155edb4b21d92ad02897a626cd90119e',cohort:'whale'},
  {id:'rh-theveeman',chain:'robinhood',name:'theveeman',address:'0xa0670863bd5cd0d60022bab2eed78e81e1a06bce',cohort:'whale'},
  {id:'rh-ogle',chain:'robinhood',name:'ogle',address:'0x1bcc5f67cd17e13770f199fa03bc043b0cde1143',cohort:'whale'},
  {id:'rh-avast',chain:'robinhood',name:'0xAvast',address:'0xcc0c581613dfd4ace7c8686668427236f8bd5cc5',cohort:'whale'},
  {id:'rh-avgjoescrypto',chain:'robinhood',name:'AvgJoesCrypto',address:'0x06de9c48b1e639ed5c13ec8fbd4080a38e39f2d1',cohort:'whale'},
  {id:'rh-solstice',chain:'robinhood',name:'The__Solstice',address:'0xd1c77a04b87393e98a1220532e72e8f7d0a31c5a',cohort:'whale'},
  {id:'rh-frank',chain:'robinhood',name:'Frank DeGods',address:'0x696d1265c8fc4f14797abebfae3c43ebfa9d8e28',cohort:'high-velocity'}
]);
export const EXPECTED_WALLET_COUNT = 12;
export function assertRoster(w = WALLETS) {
  if (w.length !== EXPECTED_WALLET_COUNT) throw Error('FROZEN_ROSTER_COUNT_MISMATCH');
  const ids = new Set(), addresses = new Set();
  for (const wallet of w) {
    if (ids.has(wallet.id)) throw Error('DUPLICATE_WALLET_ID');
    const key = wallet.chain + ':' + wallet.address.toLowerCase();
    if (addresses.has(key)) throw Error('DUPLICATE_WALLET_ADDRESS');
    if (wallet.chain === 'robinhood' && !/^0x[0-9a-fA-F]{40}$/.test(wallet.address)) throw Error('INVALID_EVM_ADDRESS');
    if (wallet.chain === 'solana' && !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(wallet.address)) throw Error('INVALID_SOLANA_ADDRESS');
    if (!['solana','robinhood'].includes(wallet.chain)) throw Error('INVALID_CHAIN');
    ids.add(wallet.id); addresses.add(key);
  }
  return true;
}
assertRoster();
