// Public evidence, not an attribution of personal ownership.
export const WALLETS = Object.freeze([
  { id: 'rh-demo', address: '0x42607B2E4fde22e83822d4a86ddAc58d847DC289', label: 'Robinhood stock-token demo', attribution: 'publicly demonstrated; personal control unverified', chains: [42161,4663,1,8453] },
  { id: 'github-test', address: '0x4d9302846c057507d32405ba77055473d33beb26', label: 'Unmerged GitHub PR #787 test address', attribution: 'third-party GitHub PR comment; personal control unverified', chains: [4663] }
]);
export const CHAINS = Object.freeze({
  42161: { name:'Arbitrum One', rpc: ['https://arb1.arbitrum.io/rpc','https://arbitrum-one-rpc.publicnode.com'], explorer: 'https://arbitrum.blockscout.com', etherscan: true },
  4663: { name:'Robinhood Chain', rpc: ['https://rpc.mainnet.chain.robinhood.com','https://robinhood-rpc.publicnode.com'], explorer: 'https://robinhoodchain.blockscout.com', etherscan: true },
  1: { name:'Ethereum mainnet', rpc: ['https://ethereum-rpc.publicnode.com','https://eth.llamarpc.com'], explorer: 'https://eth.blockscout.com', etherscan: true },
  8453: { name:'Base', rpc: ['https://mainnet.base.org','https://base-rpc.publicnode.com'], explorer: 'https://base.blockscout.com', etherscan: true }
});
export const PAIRS = Object.freeze(WALLETS.flatMap(w=>w.chains.map(chainId=>({walletId:w.id,address:w.address,chainId,attribution:w.attribution}))));
export const MAX_PAGES = 6;