import { PurchaseLogEntry, PriceSnapshotEntry } from "./types";

export interface SavingsLineItem {
  logId: string;
  name: string;
  category: string;
  quantity: number;
  storeName?: string;
  paidPrice: number | null;
  baselinePrice: number | null;   // regular / alternate / avg / max / cheapest-other depending on metric
  baselineLabel: string;          // e.g. "Food Basics regular", "Metro active", "avg of 3 stores", "n/a"
  lineSpent: number;              // paid * qty (0 if unpriced)
  lineSavings: number;            // (baseline - paid) * qty for that metric’s formula
  included: boolean;              // false if excluded from metric coverage
  excludeReason?: string;         // e.g. "No same-store regular", "No competitor prices"
  timestamp: string;
}

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
  
  // Detailed Line Items
  spentLines: SavingsLineItem[];
  vsRegularLines: SavingsLineItem[];
  vsAlternateLines: SavingsLineItem[];
  vsAverageLines: SavingsLineItem[];
  vsHighestLines: SavingsLineItem[];
  missedLines: SavingsLineItem[];
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
  
  const spentLines: SavingsLineItem[] = [];
  const vsRegularLines: SavingsLineItem[] = [];
  const vsAlternateLines: SavingsLineItem[] = [];
  const vsAverageLines: SavingsLineItem[] = [];
  const vsHighestLines: SavingsLineItem[] = [];
  const missedLines: SavingsLineItem[] = [];
  
  for (const log of logs) {
    const qty = log.quantity || 1;
    const paidPrice = log.paidPrice !== undefined ? log.paidPrice : (log.price !== undefined ? log.price : null);
    const storeDisplayName = log.storeName || "Unknown Store";
    const timestampStr = log.timestamp;
    
    if (paidPrice === null || paidPrice <= 0) {
      unpricedLogs.push(log);
      continue;
    }
    
    const lineSpentVal = paidPrice * qty;
    totalSpent += lineSpentVal;
    
    // Spent lines item:
    spentLines.push({
      logId: log.id,
      name: log.name,
      category: log.category,
      quantity: qty,
      storeName: storeDisplayName,
      paidPrice,
      baselinePrice: null,
      baselineLabel: "n/a",
      lineSpent: lineSpentVal,
      lineSavings: 0,
      included: true,
      timestamp: timestampStr,
    });
    
    // 1. Metric 1: vs Same-store regular
    const regPrice = log.regularPrice !== undefined ? log.regularPrice : null;
    const hasRegPrice = regPrice !== null && regPrice > 0;
    const lineSavingsReg = hasRegPrice && regPrice > paidPrice ? (regPrice - paidPrice) * qty : 0;
    
    if (hasRegPrice) {
      vsRegularCount++;
      vsRegularSavings += lineSavingsReg;
    }
    
    vsRegularLines.push({
      logId: log.id,
      name: log.name,
      category: log.category,
      quantity: qty,
      storeName: storeDisplayName,
      paidPrice,
      baselinePrice: regPrice,
      baselineLabel: hasRegPrice ? `${storeDisplayName} regular` : "n/a",
      lineSpent: lineSpentVal,
      lineSavings: lineSavingsReg,
      included: hasRegPrice,
      excludeReason: hasRegPrice ? undefined : "No same-store regular price",
      timestamp: timestampStr,
    });
    
    // Get other store prices from snapshot
    const otherStorePricesInfo = (log.priceSnapshot || [])
      .filter((s) => s.storeId.toLowerCase() !== log.storeId?.toLowerCase() && s.activePrice !== null && s.activePrice > 0);
    const otherStorePrices = otherStorePricesInfo.map((s) => s.activePrice as number);
      
    // 2. Metric 2: vs Alternate Store
    let altPrice: number | null = null;
    let altLabel = "";
    if (forcedAlternateStoreId) {
      const match = (log.priceSnapshot || []).find(
        (s) => s.storeId.toLowerCase() === forcedAlternateStoreId.toLowerCase()
      );
      if (match && match.activePrice !== null && match.activePrice > 0) {
        altPrice = match.activePrice;
        altLabel = `${match.storeName} active`;
      }
    }
    
    if (altPrice === null && otherStorePricesInfo.length > 0) {
      // Find cheapest alternate
      const cheapest = otherStorePricesInfo.reduce((prev, curr) => 
        (prev.activePrice || Infinity) < (curr.activePrice || Infinity) ? prev : curr
      );
      altPrice = cheapest.activePrice;
      altLabel = `${cheapest.storeName} active`;
    }
    
    const hasAltPrice = altPrice !== null;
    const lineSavingsAlt = hasAltPrice ? (altPrice - paidPrice) * qty : 0;
    
    if (hasAltPrice) {
      vsAlternateCount++;
      vsAlternateSavings += lineSavingsAlt;
    }
    
    vsAlternateLines.push({
      logId: log.id,
      name: log.name,
      category: log.category,
      quantity: qty,
      storeName: storeDisplayName,
      paidPrice,
      baselinePrice: altPrice,
      baselineLabel: hasAltPrice ? altLabel : "n/a",
      lineSpent: lineSpentVal,
      lineSavings: lineSavingsAlt,
      included: hasAltPrice,
      excludeReason: hasAltPrice ? undefined : (forcedAlternateStoreId ? `No active price for forced alternate store` : "No competitor price snapshot"),
      timestamp: timestampStr,
    });
    
    // Build price set for Avg / Max comparisons (include paidPrice if present)
    const allPrices = [...otherStorePrices];
    if (paidPrice !== null) {
      allPrices.push(paidPrice);
    }
    
    // 3. Metric 3: vs Average
    const hasAvgPrice = allPrices.length > 0;
    let avg: number | null = null;
    let lineSavingsAvg = 0;
    if (hasAvgPrice) {
      avg = allPrices.reduce((sum, p) => sum + p, 0) / allPrices.length;
      lineSavingsAvg = (avg - paidPrice) * qty;
      vsAverageCount++;
      vsAverageSavings += lineSavingsAvg;
    }
    
    vsAverageLines.push({
      logId: log.id,
      name: log.name,
      category: log.category,
      quantity: qty,
      storeName: storeDisplayName,
      paidPrice,
      baselinePrice: avg,
      baselineLabel: hasAvgPrice ? `Avg of ${allPrices.length} store${allPrices.length > 1 ? "s" : ""}` : "n/a",
      lineSpent: lineSpentVal,
      lineSavings: lineSavingsAvg,
      included: hasAvgPrice,
      excludeReason: hasAvgPrice ? undefined : "No price data available",
      timestamp: timestampStr,
    });
    
    // 4. Metric 4: vs Highest
    const hasMaxPrice = allPrices.length > 0;
    let max: number | null = null;
    let lineSavingsMax = 0;
    if (hasMaxPrice) {
      max = Math.max(...allPrices);
      lineSavingsMax = (max - paidPrice) * qty;
      vsHighestCount++;
      vsHighestSavings += lineSavingsMax;
    }
    
    vsHighestLines.push({
      logId: log.id,
      name: log.name,
      category: log.category,
      quantity: qty,
      storeName: storeDisplayName,
      paidPrice,
      baselinePrice: max,
      baselineLabel: hasMaxPrice ? `Max of ${allPrices.length} store${allPrices.length > 1 ? "s" : ""}` : "n/a",
      lineSpent: lineSpentVal,
      lineSavings: lineSavingsMax,
      included: hasMaxPrice,
      excludeReason: hasMaxPrice ? undefined : "No price data available",
      timestamp: timestampStr,
    });
    
    // 5. Metric 5: Missed Savings (compared to cheapest other store)
    const hasMissedPrice = otherStorePricesInfo.length > 0;
    let minOther: number | null = null;
    let cheapestOtherStoreName = "";
    let lineSavingsMissed = 0;
    
    if (hasMissedPrice) {
      const cheapest = otherStorePricesInfo.reduce((prev, curr) => 
        (prev.activePrice || Infinity) < (curr.activePrice || Infinity) ? prev : curr
      );
      minOther = cheapest.activePrice;
      cheapestOtherStoreName = cheapest.storeName;
      
      if (minOther !== null && minOther < paidPrice) {
        lineSavingsMissed = (paidPrice - minOther) * qty;
      }
      
      missedCount++;
      missedSavings += lineSavingsMissed;
    }
    
    missedLines.push({
      logId: log.id,
      name: log.name,
      category: log.category,
      quantity: qty,
      storeName: storeDisplayName,
      paidPrice,
      baselinePrice: minOther,
      baselineLabel: hasMissedPrice ? `${cheapestOtherStoreName} active` : "n/a",
      lineSpent: lineSpentVal,
      lineSavings: lineSavingsMissed,
      included: hasMissedPrice,
      excludeReason: hasMissedPrice ? undefined : "No alternate store price snapshot",
      timestamp: timestampStr,
    });
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
    spentLines,
    vsRegularLines,
    vsAlternateLines,
    vsAverageLines,
    vsHighestLines,
    missedLines,
  };
}
