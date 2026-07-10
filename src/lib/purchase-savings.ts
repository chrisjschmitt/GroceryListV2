import { PurchaseLogEntry, PriceSnapshotEntry } from "./types";

export interface TimeframeSavingsReport {
  totalSpent: number;
  
  vsRegularSavings: number;
  vsAlternateSavings: number;
  vsAverageSavings: number;
  vsHighestSavings: number;
  missedSavings: number;
  
  // Coverage counters
  totalCount: number;
  vsRegularCount: number;
  vsAlternateCount: number;
  vsAverageCount: number;
  vsHighestCount: number;
  missedCount: number;
  
  // Details
  unpricedLogs: PurchaseLogEntry[];
}

export function computeTimeframeSavings(
  logs: PurchaseLogEntry[],
  forcedAlternateStoreId?: string
): TimeframeSavingsReport {
  let totalSpent = 0;
  
  let vsRegularSavings = 0;
  let vsAlternateSavings = 0;
  let vsAverageSavings = 0;
  let vsHighestSavings = 0;
  let missedSavings = 0;
  
  let totalCount = logs.length;
  let vsRegularCount = 0;
  let vsAlternateCount = 0;
  let vsAverageCount = 0;
  let vsHighestCount = 0;
  let missedCount = 0;
  
  const unpricedLogs: PurchaseLogEntry[] = [];
  
  for (const log of logs) {
    const qty = log.quantity || 1;
    const paidPrice = log.paidPrice !== undefined ? log.paidPrice : (log.price !== undefined ? log.price : null);
    
    if (paidPrice === null || paidPrice <= 0) {
      unpricedLogs.push(log);
      continue;
    }
    
    totalSpent += paidPrice * qty;
    
    // 1. Metric 1: vs Same-store regular
    const regPrice = log.regularPrice !== undefined ? log.regularPrice : null;
    if (regPrice !== null && regPrice > 0) {
      vsRegularCount++;
      if (regPrice > paidPrice) {
        vsRegularSavings += (regPrice - paidPrice) * qty;
      }
    }
    
    // Get other store prices from snapshot
    const otherStorePrices = (log.priceSnapshot || [])
      .filter((s) => s.storeId.toLowerCase() !== log.storeId?.toLowerCase() && s.activePrice !== null && s.activePrice > 0)
      .map((s) => s.activePrice as number);
      
    // 2. Metric 2: vs Alternate Store
    let altPrice: number | null = null;
    if (forcedAlternateStoreId) {
      const match = (log.priceSnapshot || []).find(
        (s) => s.storeId.toLowerCase() === forcedAlternateStoreId.toLowerCase()
      );
      if (match && match.activePrice !== null && match.activePrice > 0) {
        altPrice = match.activePrice;
      }
    }
    
    if (altPrice === null && otherStorePrices.length > 0) {
      altPrice = Math.min(...otherStorePrices);
    }
    
    if (altPrice !== null) {
      vsAlternateCount++;
      vsAlternateSavings += (altPrice - paidPrice) * qty;
    }
    
    // Build price set for Avg / Max comparisons (include paidPrice if present)
    const allPrices = [...otherStorePrices];
    if (paidPrice !== null) {
      allPrices.push(paidPrice);
    }
    
    // 3. Metric 3: vs Average
    if (allPrices.length > 0) {
      const avg = allPrices.reduce((sum, p) => sum + p, 0) / allPrices.length;
      vsAverageCount++;
      vsAverageSavings += (avg - paidPrice) * qty;
    }
    
    // 4. Metric 4: vs Highest
    if (allPrices.length > 0) {
      const max = Math.max(...allPrices);
      vsHighestCount++;
      vsHighestSavings += (max - paidPrice) * qty;
    }
    
    // 5. Metric 5: Missed Savings (compared to cheapest other store)
    if (otherStorePrices.length > 0) {
      const minOther = Math.min(...otherStorePrices);
      missedCount++;
      if (minOther < paidPrice) {
        missedSavings += (paidPrice - minOther) * qty;
      }
    }
  }
  
  return {
    totalSpent,
    vsRegularSavings,
    vsAlternateSavings,
    vsAverageSavings,
    vsHighestSavings,
    missedSavings,
    totalCount,
    vsRegularCount,
    vsAlternateCount,
    vsAverageCount,
    vsHighestCount,
    missedCount,
    unpricedLogs,
  };
}
