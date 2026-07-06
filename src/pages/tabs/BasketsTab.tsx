import { useState, useMemo } from "react";
import { useOfflineStore } from "@/lib/client/offline-store-context";
import { GroceryItem, PriceEntry } from "@/lib/types";
import { 
  ShieldCheck, 
  ShoppingBasket, 
  Info, 
  ExternalLink, 
  AlertTriangle, 
  Check, 
  ChevronDown, 
  ChevronUp, 
  Bolt, 
  Store,
  ChevronRight
} from "lucide-react";

interface BasketsTabProps {
  onNavigateToLists?: () => void;
}

function normalizeStoreKey(storeId: string): string {
  if (!storeId) return "foodbasics";
  const lower = String(storeId).toLowerCase().trim();
  if (lower.includes("metro")) return "metro";
  if (lower.includes("loblaws")) return "loblaws";
  if (lower.includes("nofrills")) return "nofrills";
  if (lower.includes("freshco") || lower.includes("freschco") || lower.includes("fresco") || lower.includes("fresh co")) return "freshco";
  if (lower.includes("yourindependentgrocer")) return "yourindependentgrocer";
  if (lower === "7923194" || lower.includes("foodbasics") || lower.includes("food basics")) return "foodbasics";
  if (lower.includes("walmart")) return "walmart";
  return lower;
}

function getStoreActivePrice(storeInfo: any): number | null {
  if (!storeInfo) return null;
  
  const isSaleExpired = (dateStr?: string): boolean => {
    if (!dateStr) return false;
    const expiryDate = new Date(dateStr);
    if (isNaN(expiryDate.getTime())) return false;
    const now = new Date();
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr.trim())) {
      const [y, m, d] = dateStr.trim().split("-").map(Number);
      const targetDate = new Date(y, m - 1, d, 23, 59, 59, 999);
      return now > targetDate;
    }
    return now > expiryDate;
  };

  const hasReg = storeInfo.regular_price !== null && storeInfo.regular_price !== undefined && storeInfo.regular_price > 0;
  const hasSale = storeInfo.is_on_sale && storeInfo.sale_price !== null && storeInfo.sale_price !== undefined && storeInfo.sale_price > 0;
  if (!hasReg && !hasSale) return null;
  
  const isExpired = hasSale && storeInfo.valid_until && isSaleExpired(storeInfo.valid_until);

  if (hasSale && !isExpired) {
    return typeof storeInfo.sale_price === "number" ? storeInfo.sale_price : parseFloat(storeInfo.sale_price) || null;
  }
  
  if (hasReg) {
    const regPrice = typeof storeInfo.regular_price === "number" ? storeInfo.regular_price : parseFloat(storeInfo.regular_price) || 0;
    const salePrice = typeof storeInfo.sale_price === "number" ? storeInfo.sale_price : parseFloat(storeInfo.sale_price) || 0;
    if (regPrice > 0 && regPrice !== salePrice) {
      return regPrice;
    }
  }
  return null;
}

export default function BasketsTab({ onNavigateToLists }: BasketsTabProps) {
  const store = useOfflineStore();
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [reportingIds, setReportingIds] = useState<Set<string>>(new Set());
  const [reportedIds, setReportedIds] = useState<Set<string>>(new Set());

  // Build name ➔ price lookup
  const priceLookup = useMemo(() => {
    const map = new Map<string, PriceEntry>();
    for (const entry of Object.values(store.prices)) {
      if (!entry) continue;

      const keysToRegister = [];
      if (entry.config_name) keysToRegister.push(entry.config_name.toLowerCase());
      if (entry.item_name) keysToRegister.push(entry.item_name.toLowerCase());

      for (const nameKey of keysToRegister) {
        const existing = map.get(nameKey);
        if (existing) {
          const mergedStores: Record<string, any> = {};

          const addOrMergeStore = (sId: string, sInfo: any) => {
            const normId = normalizeStoreKey(sId);
            const currentStorePrice = getStoreActivePrice(sInfo);
            if (currentStorePrice === null) return;
              
            const existingStorePriceInfo = mergedStores[normId];
            const existingStorePrice = existingStorePriceInfo
              ? (getStoreActivePrice(existingStorePriceInfo) ?? Infinity)
              : Infinity;

            if (!existingStorePriceInfo || currentStorePrice < existingStorePrice) {
              mergedStores[normId] = {
                ...sInfo,
                store_id: normId,
              };
            }
          };

          if (existing.stores && typeof existing.stores === "object") {
            for (const [sId, sInfo] of Object.entries(existing.stores)) {
              addOrMergeStore(sId, sInfo);
            }
          } else {
            const existingStoreId = existing.store_id || "foodbasics";
            addOrMergeStore(existingStoreId, {
              store_name: existing.store_name || "Food Basics",
              postal_code: existing.postal_code || "",
              store_id: existingStoreId,
              regular_price: existing.regular_price,
              sale_price: existing.sale_price,
              is_on_sale: existing.is_on_sale,
              lookup_url: existing.lookup_url,
              flipp_url: existing.flipp_url,
              valid_until: existing.valid_until,
            });
          }

          if (entry.stores && typeof entry.stores === "object") {
            for (const [sId, sInfo] of Object.entries(entry.stores)) {
              addOrMergeStore(sId, sInfo);
            }
          } else {
            const entryStoreId = entry.store_id || "foodbasics";
            addOrMergeStore(entryStoreId, {
              store_name: entry.store_name || "Food Basics",
              postal_code: entry.postal_code || "",
              store_id: entryStoreId,
              regular_price: entry.regular_price,
              sale_price: entry.sale_price,
              is_on_sale: entry.is_on_sale,
              lookup_url: entry.lookup_url,
              flipp_url: entry.flipp_url,
              valid_until: entry.valid_until,
            });
          }

          map.set(nameKey, {
            ...entry,
            stores: mergedStores,
          });
        } else {
          const initialStores: Record<string, any> = {};
          if (entry.stores && typeof entry.stores === "object") {
            for (const [sId, sInfo] of Object.entries(entry.stores)) {
              const normId = normalizeStoreKey(sId);
              initialStores[normId] = { ...sInfo, store_id: normId };
            }
          } else {
            const entryStoreId = entry.store_id || "foodbasics";
            initialStores[entryStoreId] = {
              store_name: entry.store_name || "Food Basics",
              postal_code: entry.postal_code || "",
              store_id: entryStoreId,
              regular_price: entry.regular_price,
              sale_price: entry.sale_price,
              is_on_sale: entry.is_on_sale,
              lookup_url: entry.lookup_url,
              flipp_url: entry.flipp_url,
              valid_until: entry.valid_until,
            };
          }

          map.set(nameKey, {
            ...entry,
            stores: initialStores,
          });
        }
      }
    }
    return map;
  }, [store.prices]);

  // Baskets optimization totals calculation
  const optimization = useMemo(() => {
    // 1. Define all stores metadata
    const STORE_METADATA: Record<string, { name: string; short: string; color: string; bgColor: string }> = {
      foodbasics: { name: "Food Basics", short: "FB", color: "#1B5E20", bgColor: "#FFD54F" },
      metro: { name: "Metro", short: "M", color: "#FFFFFF", bgColor: "#E53935" },
      freshco: { name: "FreshCo", short: "FC", color: "#FFFFFF", bgColor: "#4CAF50" },
      loblaws: { name: "Loblaws", short: "LB", color: "#FFFFFF", bgColor: "#FF6F00" },
      nofrills: { name: "No Frills", short: "NF", color: "#000000", bgColor: "#FFFF00" },
      yourindependentgrocer: { name: "Your Independent Grocer", short: "YIG", color: "#FFFFFF", bgColor: "#00acc1" },
      walmart: { name: "Walmart", short: "WM", color: "#FFFFFF", bgColor: "#0071CE" }
    };

    const getStoreMeta = (storeId: string) => {
      const canonical = normalizeStoreKey(storeId);
      return STORE_METADATA[canonical] || {
        name: storeId.charAt(0).toUpperCase() + storeId.slice(1),
        short: storeId.slice(0, 2).toUpperCase(),
        color: "#FFFFFF",
        bgColor: "#757575"
      };
    };

    // 2. We will compute totals for each store. To handle missing store prices fairly, we use a fallback price
    // (the cheapest available price at any store for that item) when a specific store doesn't carry it.
    const storeTotals: Record<string, number> = {};
    const storeItemsLists: Record<string, { item: GroceryItem; price: number; savings: number; priceInfo?: PriceEntry }[]> = {};
    const untrackedItems: GroceryItem[] = [];

    // Initialize maps for all supported stores
    for (const storeId of Object.keys(STORE_METADATA)) {
      storeTotals[storeId] = 0;
      storeItemsLists[storeId] = [];
    }

    // Identify which stores are active in the user's prices database
    const activeStoreIds = new Set<string>();

    // Pass 1: Parse item prices and assign to groups
    const processedItems = store.groceryItems.map(item => {
      const priceInfo = priceLookup.get(item.name.toLowerCase());
      const itemPrices: Record<string, number> = {};

      if (priceInfo) {
        if (priceInfo.stores && typeof priceInfo.stores === "object") {
          for (const [sId, sInfo] of Object.entries(priceInfo.stores)) {
            const normId = normalizeStoreKey(sId);
            const p = getStoreActivePrice(sInfo);
            if (p !== null && p > 0) {
              itemPrices[normId] = p;
              activeStoreIds.add(normId);
            }
          }
        } else {
          const p = getStoreActivePrice(priceInfo);
          const sId = normalizeStoreKey(priceInfo.store_id || "");
          if (p !== null && p > 0) {
            itemPrices[sId] = p;
            activeStoreIds.add(sId);
          }
        }
      }

      return { item, priceInfo, itemPrices };
    });

    let splitTotal = 0;

    for (const { item, priceInfo, itemPrices } of processedItems) {
      const availableStoreIds = Object.keys(itemPrices);
      
      if (availableStoreIds.length === 0) {
        untrackedItems.push(item);
        continue;
      }

      // Ensure any newly discovered unmapped stores are initialized in the list/total maps
      for (const storeId of availableStoreIds) {
        if (!storeItemsLists[storeId]) {
          storeItemsLists[storeId] = [];
        }
        if (storeTotals[storeId] === undefined) {
          storeTotals[storeId] = 0;
        }
      }

      // Cheapest price for this item across all stores
      const cheapestPrice = Math.min(...Object.values(itemPrices));
      
      // Determine which store offers the cheapest price
      const bestStoreId = availableStoreIds.find(storeId => itemPrices[storeId] === cheapestPrice)!;

      // Add to split total
      splitTotal += cheapestPrice * item.quantity;

      // Update store totals
      for (const storeId of Object.keys(storeTotals)) {
        // If the store carries the item, use its price. Otherwise, fall back to cheapestPrice (comparable benchmark)
        const price = itemStorePrice(storeId, itemPrices, cheapestPrice);
        storeTotals[storeId] += price * item.quantity;
      }

      // Calculate savings for splitting vs buying at the second cheapest store or average
      const maxPrice = Math.max(...Object.values(itemPrices));
      const savings = (maxPrice - cheapestPrice) * item.quantity;

      storeItemsLists[bestStoreId].push({
        item,
        price: cheapestPrice,
        savings,
        priceInfo
      });
    }

    // Helper to get item price or fallback
    function itemStorePrice(storeKey: string, pricesMap: Record<string, number>, fallback: number): number {
      return pricesMap[storeKey] !== undefined ? pricesMap[storeKey] : fallback;
    }

    // Find the cheapest single store among those that have at least one native price in the list
    let singleStoreCheapest = "Food Basics";
    let singleStoreCheapestTotal = Infinity;

    for (const storeId of Object.keys(storeTotals)) {
      if (activeStoreIds.has(storeId)) {
        const total = storeTotals[storeId];
        if (total < singleStoreCheapestTotal) {
          singleStoreCheapestTotal = total;
          singleStoreCheapest = getStoreMeta(storeId).name;
        }
      }
    }

    if (singleStoreCheapestTotal === Infinity) {
      singleStoreCheapestTotal = 0;
    }

    const splitSavings = Math.max(0, singleStoreCheapestTotal - splitTotal);

    return {
      storeTotals,
      splitTotal,
      singleStoreCheapest,
      singleStoreCheapestTotal,
      splitSavings,
      storeItemsLists,
      untrackedItems,
      getStoreMeta
    };
  }, [store.groceryItems, priceLookup]);

  const toggleExpand = (itemId: string) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  const handleReportIncorrectPrice = async (item: GroceryItem, storeId: string, currentPrice: number, lookupUrl: string) => {
    const reportKey = `${item.id}-${storeId}`;
    if (reportingIds.has(reportKey) || reportedIds.has(reportKey)) return;

    setReportingIds((prev) => {
      const next = new Set(prev);
      next.add(reportKey);
      return next;
    });

    try {
      const response = await fetch("/api/report-pricing-issue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemName: item.name,
          storeId,
          reportedPrice: currentPrice,
          lookupUrl,
        }),
      });

      if (response.ok) {
        setReportedIds((prev) => {
          const next = new Set(prev);
          next.add(reportKey);
          return next;
        });
      } else {
        alert("Failed to report pricing issue.");
      }
    } catch (err) {
      console.error(err);
      alert("An error occurred while reporting pricing issue.");
    } finally {
      setReportingIds((prev) => {
        const next = new Set(prev);
        next.delete(reportKey);
        return next;
      });
    }
  };

  // Render empty state if list has no items
  if (store.groceryItems.length === 0) {
    return (
      <div className="text-center py-20 px-6 max-w-sm mx-auto animate-fade-in">
        <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-primary/20">
          <ShoppingBasket className="text-primary w-8 h-8" />
        </div>
        <h3 className="text-base font-extrabold text-on-surface">Your Basket is Empty</h3>
        <p className="text-xs text-on-surface-variant mt-2 leading-relaxed">
          Add items to your list in the Lists tab, and our savings engine will calculate the cheapest stores and optimal splits!
        </p>
        <button
          onClick={onNavigateToLists}
          className="mt-6 px-5 py-2.5 bg-primary text-on-primary text-xs font-bold rounded-lg shadow-sm hover:bg-primary-container transition-all active:scale-95 cursor-pointer"
        >
          Go to Shopping List
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-8 animate-fade-in">
           {/* Cheapest Single Store Card */}
      <section className="bg-surface border border-outline-variant rounded-xl p-4 flex items-center justify-between gap-4 hover:shadow-xs transition-shadow">
        <div className="flex flex-col gap-1.5 flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="bg-secondary/10 text-secondary text-[9px] uppercase font-black tracking-wider px-2 py-0.5 rounded-full">
              Single Store
            </span>
            <span className="text-[10px] text-on-surface-variant font-bold">Lowest Baseline</span>
          </div>
          <div className="flex items-center gap-3">
            {(() => {
              const matchedStoreKey = Object.keys(optimization.storeTotals).find(
                key => optimization.getStoreMeta(key).name === optimization.singleStoreCheapest
              ) || "foodbasics";
              const meta = optimization.getStoreMeta(matchedStoreKey);
              return (
                <div 
                  className="w-9 h-9 rounded-full flex items-center justify-center font-black text-xs shrink-0 select-none border border-black/5"
                  style={{ backgroundColor: meta.bgColor, color: meta.color }}
                >
                  {meta.short}
                </div>
              );
            })()}
            <div>
              <h2 className="text-base font-extrabold text-on-surface leading-snug">
                {optimization.singleStoreCheapest}
              </h2>
              <p className="text-[11px] text-on-surface-variant font-semibold">Cheapest Total Store</p>
            </div>
          </div>
        </div>
        <div className="text-right shrink-0 font-tnum">
          <p className="text-base font-black text-primary">
            ${optimization.singleStoreCheapestTotal.toFixed(2)}
          </p>
        </div>
      </section>

      {/* Smart Split Recommendation Card */}
      <section className={`relative overflow-hidden rounded-xl p-4 border transition-all ${
        optimization.splitSavings > 0 
          ? "bg-primary-container text-on-primary-container border-primary shadow-sm" 
          : "bg-surface border-outline-variant"
      }`}>
        {optimization.splitSavings > 0 && (
          <div className="absolute -right-3 -top-3 opacity-15">
            <Bolt size={72} className="stroke-[1.5px] fill-current" />
          </div>
        )}
        <div className="relative z-10 space-y-2">
          <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wider">
            <Bolt size={12} className={optimization.splitSavings > 0 ? "text-on-primary-container animate-pulse" : "text-primary"} />
            <span>{optimization.splitSavings > 0 ? "Smart Split Recommended" : "Single Store Optimal"}</span>
          </div>
          
          {optimization.splitSavings > 0 ? (
            <>
              <h3 className="text-lg font-black tracking-tight">
                Save ${optimization.splitSavings.toFixed(2)} more
              </h3>
              <p className="text-xs font-semibold leading-relaxed text-on-primary-container/85">
                By splitting your shopping between the cheapest local stores.
              </p>
              <div className="mt-3 pt-3 border-t border-on-primary-container/10 flex justify-between items-center">
                <div className="flex -space-x-1.5">
                  {(Object.entries(optimization.storeItemsLists) as [string, any][])
                    .filter(([_, list]) => list.length > 0)
                    .map(([storeId]) => {
                      const meta = optimization.getStoreMeta(storeId);
                      return (
                        <div 
                          key={storeId}
                          className="w-6 h-6 rounded-full border-2 border-primary-container flex items-center justify-center font-black text-[9px] select-none shadow-xs"
                          style={{ backgroundColor: meta.bgColor, color: meta.color }}
                          title={meta.name}
                        >
                          {meta.short}
                        </div>
                      );
                    })}
                </div>
                <span className="text-xs font-bold font-tnum">${optimization.splitTotal.toFixed(2)} Total</span>
              </div>
            </>
          ) : (
            <>
              <h3 className="text-base font-black tracking-tight text-on-surface">
                Your basket is fully optimized!
              </h3>
              <p className="text-xs text-on-surface-variant font-medium leading-relaxed">
                Buying all items at <span className="font-bold text-primary">{optimization.singleStoreCheapest}</span> provides the absolute lowest total of <span className="font-bold font-tnum text-primary">${optimization.singleStoreCheapestTotal.toFixed(2)}</span>.
              </p>
            </>
          )}
        </div>
      </section>

      {/* Split Breakdown List */}
      <div className="space-y-3 pt-2">
        <h3 className="text-[10px] font-black uppercase text-on-surface-variant tracking-widest pl-1">
          SPLIT BREAKDOWN
        </h3>

        {(Object.entries(optimization.storeItemsLists) as [string, any][])
          .filter(([_, list]) => list.length > 0)
          .map(([storeId, itemsList]) => {
            const meta = optimization.getStoreMeta(storeId);
            const storeCost = itemsList.reduce((acc, i) => acc + i.price * i.item.quantity, 0);
            return (
              <div key={storeId} className="bg-surface-container-lowest border border-outline-variant rounded-xl overflow-hidden shadow-2xs">
                <div className="bg-surface-container-low px-4 py-2.5 flex justify-between items-center border-b border-outline-variant">
                  <div className="flex items-center gap-2">
                    <div 
                      className="w-5 h-5 rounded-full flex items-center justify-center font-black text-[9px] select-none"
                      style={{ backgroundColor: meta.bgColor, color: meta.color }}
                    >
                      {meta.short}
                    </div>
                    <span className="text-xs font-extrabold text-on-surface">{meta.name} Split</span>
                  </div>
                  <span className="text-xs font-extrabold font-tnum text-primary">
                    ${storeCost.toFixed(2)}
                  </span>
                </div>
                
                <div className="divide-y divide-outline-variant">
                  {itemsList.map(({ item, price, savings, priceInfo }) => {
                    const isExpanded = expandedItems.has(item.id);
                    return (
                      <div key={item.id} className="transition-colors">
                        {/* Item header row */}
                        <div 
                          onClick={() => toggleExpand(item.id)}
                          className="p-3.5 flex justify-between items-center gap-3 cursor-pointer hover:bg-surface-container-low select-none"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 min-w-0">
                              <p className="text-xs font-bold text-on-surface truncate">{item.name}</p>
                              <span className="text-[9px] bg-surface-container-low text-on-surface-variant font-bold px-1.5 py-0.5 rounded-sm shrink-0">
                                {item.quantity}x
                              </span>
                            </div>
                            {savings > 0 && (
                              <span className="text-[9px] text-primary font-bold block mt-0.5">
                                Save ${savings.toFixed(2)} here
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 shrink-0 font-tnum">
                            <span className="text-xs font-extrabold text-on-surface">
                              ${(price * item.quantity).toFixed(2)}
                            </span>
                            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                          </div>
                        </div>

                        {/* Accordion panel */}
                        {isExpanded && (
                          <div className="px-4 pb-3.5 pt-0.5 bg-surface-container-lowest border-t border-outline/5 space-y-3">
                            <div className="bg-surface-container-low p-3 rounded-lg border border-primary/10 mt-2 space-y-2">
                              <div className="flex justify-between items-center text-[10px] font-black uppercase text-on-surface-variant border-b border-outline/5 pb-1">
                                <span>Store Verification Link</span>
                                <span>Price details</span>
                              </div>
                              
                              {/* Retailer links */}
                              {priceInfo?.stores && (
                                <div className="space-y-1.5">
                                  {Object.entries(priceInfo.stores).map(([sId, sInfo]: [string, any]) => {
                                    const storePrice = getStoreActivePrice(sInfo);
                                    const isBest = storePrice === price;
                                    const sMeta = optimization.getStoreMeta(sId);
                                    return (
                                      <div key={sId} className="flex justify-between items-center text-xs py-1">
                                        {sInfo.lookup_url ? (
                                          <a 
                                            href={sInfo.lookup_url} 
                                            target="_blank" 
                                            rel="noreferrer" 
                                            className="text-secondary hover:underline font-bold inline-flex items-center gap-1"
                                            onClick={(e) => e.stopPropagation()}
                                          >
                                            <span>{sMeta.name}</span>
                                            <ExternalLink size={10} />
                                          </a>
                                        ) : (
                                          <span className="text-on-surface-variant font-semibold">
                                            {sMeta.name}
                                          </span>
                                        )}
                                        <div className="flex items-center gap-2">
                                          <span className={`font-bold ${isBest ? "text-primary font-black" : "text-on-surface"}`}>
                                            {storePrice !== null ? `$${storePrice.toFixed(2)}` : "—"}
                                          </span>
                                          {storePrice !== null && (
                                            <button
                                              type="button"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                handleReportIncorrectPrice(item, sId, storePrice, sInfo.lookup_url || "");
                                              }}
                                              disabled={reportingIds.has(`${item.id}-${sId}`) || reportedIds.has(`${item.id}-${sId}`)}
                                              className={`p-1 rounded transition-all select-none ${
                                                reportedIds.has(`${item.id}-${sId}`)
                                                  ? "text-emerald-600 bg-emerald-50 border border-emerald-200"
                                                  : "text-on-surface-variant hover:text-red-600 hover:bg-red-50 border border-transparent hover:border-red-200"
                                              }`}
                                              title="Report incorrect price for this store"
                                            >
                                              {reportingIds.has(`${item.id}-${sId}`) ? (
                                                <span className="animate-spin border border-current border-t-transparent rounded-full w-3.5 h-3.5 block"></span>
                                              ) : reportedIds.has(`${item.id}-${sId}`) ? (
                                                <Check size={12} className="stroke-[3.5px]" />
                                              ) : (
                                                <AlertTriangle size={12} />
                                              )}
                                            </button>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
      </div>

        {/* No Price Checking Configured Group */}
        {optimization.untrackedItems.length > 0 && (
          <div className="bg-surface-container-lowest border border-outline-variant rounded-xl overflow-hidden shadow-2xs">
            <div className="bg-surface-container-low px-4 py-2.5 flex justify-between items-center border-b border-outline-variant">
              <div className="flex items-center gap-2">
                <Store size={14} className="text-on-surface-variant" />
                <span className="text-xs font-extrabold text-on-surface">No Price Checking Configured</span>
              </div>
              <span className="text-[10px] bg-surface-container-low text-on-surface-variant font-bold px-2 py-0.5 rounded-full">
                {optimization.untrackedItems.length} Item{optimization.untrackedItems.length !== 1 ? "s" : ""}
              </span>
            </div>
            
            <div className="divide-y divide-outline-variant">
              {optimization.untrackedItems.map((item) => (
                <div key={item.id} className="p-3.5 flex justify-between items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-on-surface truncate">{item.name}</p>
                    <span className="text-[9px] bg-surface-container-low text-on-surface-variant font-semibold px-2 py-0.5 rounded-md mt-1 inline-block uppercase tracking-wider">
                      {item.category || "Other"}
                    </span>
                  </div>
                  <span className="text-xs font-extrabold font-tnum text-on-surface-variant">
                    {item.quantity}x
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

      {/* Start Shopping Optimized Checkout Button */}
      <div className="pt-4">
        <button
          onClick={() => alert("Optimal routes mapped! Open in Google Maps sync is coming in a future update.")}
          className="w-full bg-primary hover:bg-primary-container text-on-primary font-bold py-3.5 rounded-xl shadow-md transition-all active:scale-[0.98] flex items-center justify-center gap-2 select-none cursor-pointer"
        >
          <span>Start Shopping</span>
          <ChevronRight size={16} />
        </button>
        <p className="text-center text-[10px] font-bold text-on-surface-variant/80 mt-2">
          Store routes optimized based on catalog locations
        </p>
      </div>

      {/* Verification Shield */}
      <div className="flex items-center justify-center gap-1.5 pt-4 text-[10px] font-bold text-on-surface-variant/80">
        <ShieldCheck size={14} className="text-primary" />
        <span>Price checks run automatically via Gemini</span>
      </div>

    </div>
  );
}
