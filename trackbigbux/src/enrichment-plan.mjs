// Pure, independently testable wallet attribution for enriched Solana transactions.
// A single signature can belong to more than one frozen wallet.
export function groupPendingBySignature(rows) {
  const grouped = new Map();
  for (const row of rows) {
    if (!row?.tx_id || !row?.wallet_id) continue;
    if (!grouped.has(row.tx_id)) grouped.set(row.tx_id, new Set());
    grouped.get(row.tx_id).add(row.wallet_id);
  }
  return grouped;
}
export function planEnrichment(rows, parsedTransactions, wallets, classify) {
  const grouped = groupPendingBySignature(rows);
  const identities = new Map(wallets.map(wallet => [wallet.id, wallet]));
  const updates = [];
  for (const tx of parsedTransactions) {
    for (const walletId of grouped.get(tx?.signature) || []) {
      const wallet = identities.get(walletId);
      if (!wallet) continue;
      const result = classify(wallet, tx);
      if (result) updates.push({walletId, signature:tx.signature, ...result});
    }
  }
  return updates;
}
