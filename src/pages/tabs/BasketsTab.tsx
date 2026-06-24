import { useState, useMemo } from "react";
import { useOfflineStore } from "@/lib/client/use-offline-store";
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
  if (lower.includes("freshco")) return "freshco";
  if (lower.includes("yourindependentgrocer")) return "yourindependentgrocer";
  if (lower === "7923194" || lower.includes("foodbasics") || lower.includes("food basics")) return "foodbasics";
  return lower;
}

function getStoreActivePrice(storeInfo: any): number | null {
  if (!storeInfo) return null;
  const hasReg = storeInfo.regular_price !== null && storeInfo.regular_price !== undefined && storeInfo.regular_price > 0;
  const hasSale = storeInfo.is_on_sale && storeInfo.sale_price !== null && storeInfo.sale_price !== undefined && storeInfo.sale_price > 0;
  if (!hasReg && !hasSale) return null;
  
  if (storeInfo.is_on_sale && storeInfo.sale_price !== null && storeInfo.sale_price !== undefined && storeInfo.sale_price > 0) {
    return typeof storeInfo.sale_price === "number" ? storeInfo.sale_price : parseFloat(storeInfo.sale_price) || null;
  }
  return typeof storeInfo.regular_price === "number" ? storeInfo.regular_price : parseFloat(storeInfo.regular_price) || null;
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
    let foodbasicsTotal = 0;
    let metroTotal = 0;
    let splitTotal = 0;

    const foodbasicsItems: { item: GroceryItem; price: number; savings: number; priceInfo?: PriceEntry }[] = [];
    const metroItems: { item: GroceryItem; price: number; savings: number; priceInfo?: PriceEntry }[] = [];
    const untrackedItems: GroceryItem[] = [];

    for (const item of store.groceryItems) {
      const priceInfo = priceLookup.get(item.name.toLowerCase());
      
      let basicsPrice: number | null = null;
      let metroPrice: number | null = null;

      if (priceInfo) {
        if (priceInfo.stores && typeof priceInfo.stores === "object") {
          const basicsInfo = priceInfo.stores["foodbasics"];
          const metroInfo = priceInfo.stores["metro"];
          basicsPrice = getStoreActivePrice(basicsInfo);
          metroPrice = getStoreActivePrice(metroInfo);
        } else {
          const p = getStoreActivePrice(priceInfo);
          const sId = normalizeStoreKey(priceInfo.store_id || "");
          if (sId === "foodbasics") basicsPrice = p;
          else if (sId === "metro") metroPrice = p;
        }
      }

      if (basicsPrice === null && metroPrice === null) {
        untrackedItems.push(item);
      } else {
        const basicsCost = (basicsPrice ?? metroPrice ?? 0) * item.quantity;
        const metroCost = (metroPrice ?? basicsPrice ?? 0) * item.quantity;

        foodbasicsTotal += basicsCost;
        metroTotal += metroCost;

        // Split optimization
        if (basicsPrice !== null && metroPrice !== null) {
          if (basicsPrice < metroPrice) {
            splitTotal += basicsPrice * item.quantity;
            foodbasicsItems.push({
              item,
              price: basicsPrice,
              savings: (metroPrice - basicsPrice) * item.quantity,
              priceInfo
            });
          } else if (metroPrice < basicsPrice) {
            splitTotal += metroPrice * item.quantity;
            metroItems.push({
              item,
              price: metroPrice,
              savings: (basicsPrice - metroPrice) * item.quantity,
              priceInfo
            });
          } else {
            // Equal - assign to Food Basics by default
            splitTotal += basicsPrice * item.quantity;
            foodbasicsItems.push({ item, price: basicsPrice, savings: 0, priceInfo });
          }
        } else if (basicsPrice !== null) {
          splitTotal += basicsPrice * item.quantity;
          foodbasicsItems.push({ item, price: basicsPrice, savings: 0, priceInfo });
        } else if (metroPrice !== null) {
          splitTotal += metroPrice * item.quantity;
          metroItems.push({ item, price: metroPrice, savings: 0, priceInfo });
        }
      }
    }

    const singleStoreCheapest = foodbasicsTotal <= metroTotal ? "Food Basics" : "Metro";
    const singleStoreCheapestTotal = Math.min(foodbasicsTotal, metroTotal);
    const splitSavings = Math.max(0, singleStoreCheapestTotal - splitTotal);

    return {
      foodbasicsTotal,
      metroTotal,
      splitTotal,
      singleStoreCheapest,
      singleStoreCheapestTotal,
      splitSavings,
      foodbasicsItems,
      metroItems,
      untrackedItems,
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

  const handleReportIncorrectPrice = async (item: GroceryItem, storeId: string, currentPrice: number) => {
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
            {optimization.singleStoreCheapest === "Food Basics" ? (
              <div className="w-9 h-9 rounded-full bg-[#FFD54F] text-[#1B5E20] flex items-center justify-center font-black text-xs shrink-0 select-none border border-black/5">
                FB
              </div>
            ) : (
              <div className="w-9 h-9 rounded-full bg-[#E53935] text-white flex items-center justify-center font-black text-xs shrink-0 select-none border border-black/5">
                M
              </div>
            )}
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
                By splitting your shopping between <span className="underline font-extrabold">Food Basics</span> and <span className="underline font-extrabold">Metro</span>.
              </p>
              <div className="mt-3 pt-3 border-t border-on-primary-container/10 flex justify-between items-center">
                <div className="flex -space-x-1.5">
                  <div className="w-6 h-6 rounded-full bg-[#FFD54F] text-[#1B5E20] border-2 border-primary-container flex items-center justify-center font-black text-[9px] select-none shadow-xs">
                    FB
                  </div>
                  <div className="w-6 h-6 rounded-full bg-[#E53935] text-white border-2 border-primary-container flex items-center justify-center font-black text-[9px] select-none shadow-xs">
                    M
                  </div>
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

        {/* Food Basics Split Items */}
        {optimization.foodbasicsItems.length > 0 && (
          <div className="bg-surface-container-lowest border border-outline-variant rounded-xl overflow-hidden shadow-2xs">
            <div className="bg-surface-container-low px-4 py-2.5 flex justify-between items-center border-b border-outline-variant">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-full bg-[#FFD54F] text-[#1B5E20] flex items-center justify-center font-black text-[9px] select-none">FB</div>
                <span className="text-xs font-extrabold text-on-surface">Food Basics Split</span>
              </div>
              <span className="text-xs font-extrabold font-tnum text-primary">
                ${optimization.foodbasicsItems.reduce((acc, i) => acc + i.price * i.item.quantity, 0).toFixed(2)}
              </span>
            </div>
            
            <div className="divide-y divide-outline-variant">
              {optimization.foodbasicsItems.map(({ item, price, savings, priceInfo }) => {
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
                              {Object.entries(priceInfo.stores).map(([storeKey, sInfo]: [string, any]) => {
                                const storePrice = getStoreActivePrice(sInfo);
                                const isBest = storePrice === price;
                                return (
                                  <div key={storeKey} className="flex justify-between items-center text-xs">
                                    {sInfo.lookup_url ? (
                                      <a 
                                        href={sInfo.lookup_url} 
                                        target="_blank" 
                                        rel="noreferrer" 
                                        className="text-secondary hover:underline font-bold inline-flex items-center gap-1"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        <span>{sInfo.store_name || storeKey}</span>
                                        <ExternalLink size={10} />
                                      </a>
                                    ) : (
                                      <span className="text-on-surface-variant font-semibold">
                                        {sInfo.store_name || storeKey}
                                      </span>
                                    )}
                                    <span className={`font-bold ${isBest ? "text-primary font-black" : "text-on-surface"}`}>
                                      {storePrice !== null ? `$${storePrice.toFixed(2)}` : "—"}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {/* Report incorrect price */}
                          <div className="pt-2 border-t border-outline/5 flex justify-end">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleReportIncorrectPrice(item, "foodbasics", price);
                              }}
                              disabled={reportingIds.has(`${item.id}-foodbasics`) || reportedIds.has(`${item.id}-foodbasics`)}
                              className={`px-2.5 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all select-none ${
                                reportedIds.has(`${item.id}-foodbasics`)
                                  ? "bg-emerald-50 text-emerald-700 border border-emerald-300"
                                  : "bg-surface hover:bg-red-50 text-on-surface-variant hover:text-red-700 border border-outline-variant hover:border-red-200"
                              }`}
                            >
                              {reportingIds.has(`${item.id}-foodbasics`) ? (
                                <span className="animate-spin border border-current border-t-transparent rounded-full w-3 h-3"></span>
                              ) : reportedIds.has(`${item.id}-foodbasics`) ? (
                                <>
                                  <Check size={11} className="stroke-[3.5px]" />
                                  <span>Reported</span>
                                </>
                              ) : (
                                <>
                                  <AlertTriangle size={11} />
                                  <span>Report Incorrect Price</span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Metro Split Items */}
        {optimization.metroItems.length > 0 && (
          <div className="bg-surface-container-lowest border border-outline-variant rounded-xl overflow-hidden shadow-2xs">
            <div className="bg-surface-container-low px-4 py-2.5 flex justify-between items-center border-b border-outline-variant">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-full bg-[#E53935] text-white flex items-center justify-center font-black text-[9px] select-none">M</div>
                <span className="text-xs font-extrabold text-on-surface">Metro Split</span>
              </div>
              <span className="text-xs font-extrabold font-tnum text-primary">
                ${optimization.metroItems.reduce((acc, i) => acc + i.price * i.item.quantity, 0).toFixed(2)}
              </span>
            </div>
            
            <div className="divide-y divide-outline-variant">
              {optimization.metroItems.map(({ item, price, savings, priceInfo }) => {
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
                              {Object.entries(priceInfo.stores).map(([storeKey, sInfo]: [string, any]) => {
                                const storePrice = getStoreActivePrice(sInfo);
                                const isBest = storePrice === price;
                                return (
                                  <div key={storeKey} className="flex justify-between items-center text-xs">
                                    {sInfo.lookup_url ? (
                                      <a 
                                        href={sInfo.lookup_url} 
                                        target="_blank" 
                                        rel="noreferrer" 
                                        className="text-secondary hover:underline font-bold inline-flex items-center gap-1"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        <span>{sInfo.store_name || storeKey}</span>
                                        <ExternalLink size={10} />
                                      </a>
                                    ) : (
                                      <span className="text-on-surface-variant font-semibold">
                                        {sInfo.store_name || storeKey}
                                      </span>
                                    )}
                                    <span className={`font-bold ${isBest ? "text-primary font-black" : "text-on-surface"}`}>
                                      {storePrice !== null ? `$${storePrice.toFixed(2)}` : "—"}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {/* Report incorrect price */}
                          <div className="pt-2 border-t border-outline/5 flex justify-end">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleReportIncorrectPrice(item, "metro", price);
                              }}
                              disabled={reportingIds.has(`${item.id}-metro`) || reportedIds.has(`${item.id}-metro`)}
                              className={`px-2.5 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all select-none ${
                                reportedIds.has(`${item.id}-metro`)
                                  ? "bg-emerald-50 text-emerald-700 border border-emerald-300"
                                  : "bg-surface hover:bg-red-50 text-on-surface-variant hover:text-red-700 border border-outline-variant hover:border-red-200"
                              }`}
                            >
                              {reportingIds.has(`${item.id}-metro`) ? (
                                <span className="animate-spin border border-current border-t-transparent rounded-full w-3 h-3"></span>
                              ) : reportedIds.has(`${item.id}-metro`) ? (
                                <>
                                  <Check size={11} className="stroke-[3.5px]" />
                                  <span>Reported</span>
                                </>
                              ) : (
                                <>
                                  <AlertTriangle size={11} />
                                  <span>Report Incorrect Price</span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

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
      </div>

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
