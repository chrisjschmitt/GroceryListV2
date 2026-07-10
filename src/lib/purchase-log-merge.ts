import type { PurchaseLogEntry } from "./types";

/** Higher score = more analytics-ready enrichment (backfill / clear-checked snapshots). */
export function purchaseLogEnrichmentScore(log: PurchaseLogEntry): number {
  let score = 0;
  if (log.paidPrice != null && log.paidPrice > 0) score += 2;
  if (log.regularPrice != null && log.regularPrice > 0) score += 2;
  if (log.priceSnapshot && log.priceSnapshot.length > 0) score += 3;
  if (log.wasOnSale != null) score += 1;
  if (log.storeId) score += 1;
  if (log.salePrice != null) score += 1;
  return score;
}

/**
 * Union by id. When both sides have the same id, keep the richer enrichment
 * so stale IndexedDB logs cannot wipe Mongo backfills / server snapshots.
 */
export function mergePurchaseLogs(
  localLogs: PurchaseLogEntry[],
  serverLogs: PurchaseLogEntry[]
): PurchaseLogEntry[] {
  const merged = new Map<string, PurchaseLogEntry>();

  for (const log of localLogs) {
    if (log?.id) merged.set(log.id, log);
  }

  for (const sLog of serverLogs) {
    if (!sLog?.id) continue;
    const existing = merged.get(sLog.id);
    if (!existing || purchaseLogEnrichmentScore(sLog) >= purchaseLogEnrichmentScore(existing)) {
      merged.set(sLog.id, sLog);
    }
  }

  return Array.from(merged.values()).sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
}
