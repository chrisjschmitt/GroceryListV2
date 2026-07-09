import { useMemo, useRef, useState } from "react";
import { useOfflineStore } from "@/lib/client/offline-store-context";
import { RegularItem, PriceEntry } from "@/lib/types";
import {
  Sparkles,
  Search,
  Plus,
  Check,
  ChevronLeft,
  ChevronRight,
  X,
  Lightbulb,
} from "lucide-react";

import { normalizeStoreKey, isSaleActive, getStoreActivePrice, getStoreDisplayName } from "@/lib/price-utils";

const PRODUCT_IMAGES: Record<string, string> = {
  milk: "https://images.unsplash.com/photo-1550583724-b2692b85b150?auto=format&fit=crop&q=80&w=200",
  egg: "https://images.unsplash.com/photo-1506976785307-8732e854ad03?auto=format&fit=crop&q=80&w=200",
  bread: "https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&q=80&w=200",
  tortilla: "https://images.unsplash.com/photo-1628102476697-8d4e92a2a07c?auto=format&fit=crop&q=80&w=200",
  banana: "https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?auto=format&fit=crop&q=80&w=200",
  coffee: "https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&q=80&w=200",
  blueberr: "https://images.unsplash.com/photo-1601004890684-d8cbf643f5f2?auto=format&fit=crop&q=80&w=200",
  strawberr: "https://images.unsplash.com/photo-1518635017498-87f514b751ba?auto=format&fit=crop&q=80&w=200",
  raspberr: "https://images.unsplash.com/photo-1577069861033-55d04cec4ef5?auto=format&fit=crop&q=80&w=200",
  broccoli: "https://images.unsplash.com/photo-1453224311646-69d40b747e25?auto=format&fit=crop&q=80&w=200",
  chicken: "https://images.unsplash.com/photo-1604503468506-a8da13d82791?auto=format&fit=crop&q=80&w=200",
  beef: "https://images.unsplash.com/photo-1588166524941-3bf61a9c41db?auto=format&fit=crop&q=80&w=200",
  butter: "https://images.unsplash.com/photo-1589985270826-4b7bb135bc9d?auto=format&fit=crop&q=80&w=200",
  sausage: "https://images.unsplash.com/photo-1541048611056-291e110cfacc?auto=format&fit=crop&q=80&w=200",
  yogurt: "https://images.unsplash.com/photo-1571244856353-fb085c66d2c0?auto=format&fit=crop&q=80&w=200",
  cheese: "https://images.unsplash.com/photo-1552763440-47e2ebde8f1f?auto=format&fit=crop&q=80&w=200",
  lettuce: "https://images.unsplash.com/photo-1622206151226-18ca2c9ab4a1?auto=format&fit=crop&q=80&w=200",
  salad: "https://images.unsplash.com/photo-1622206151226-18ca2c9ab4a1?auto=format&fit=crop&q=80&w=200",
  romaine: "https://images.unsplash.com/photo-1622206151226-18ca2c9ab4a1?auto=format&fit=crop&q=80&w=200",
  olive: "https://images.unsplash.com/photo-1541432901042-2d8bd64b4a9b?auto=format&fit=crop&q=80&w=200",
  towel: "https://images.unsplash.com/photo-1583947215259-38e31be8751f?auto=format&fit=crop&q=80&w=200",
  paper: "https://images.unsplash.com/photo-1583947215259-38e31be8751f?auto=format&fit=crop&q=80&w=200",
  mushroom: "https://images.unsplash.com/photo-1534422298391-e4f8c172dddb?auto=format&fit=crop&q=80&w=200",
  "ice cream": "https://images.unsplash.com/photo-1563805042-7684c019e1cb?auto=format&fit=crop&q=80&w=200",
  cereal: "https://images.unsplash.com/photo-1586444248902-2f64eddc13df?auto=format&fit=crop&q=80&w=200",
};

function getProductImage(name: string): string {
  const lower = name.toLowerCase();
  for (const [key, url] of Object.entries(PRODUCT_IMAGES)) {
    if (lower.includes(key)) {
      return url;
    }
  }
  // Default high-quality grocery placeholder
  return PRODUCT_IMAGES.cereal;
}

// --- Stylized Store Initial Circle Badges ---
function StoreLogo({ storeId, className = "w-6 h-6" }: { storeId: string; className?: string }) {
  const normId = normalizeStoreKey(storeId);
  if (normId === "foodbasics") {
    return (
      <div className={`${className} bg-[#0d631b]/10 text-[#0d631b] rounded-full flex items-center justify-center font-extrabold text-[9px]`} title="Food Basics">
        FB
      </div>
    );
  } else if (normId === "metro") {
    return (
      <div className={`${className} bg-[#4c56af]/10 text-[#4c56af] rounded-full flex items-center justify-center font-extrabold text-[9px]`} title="Metro">
        M
      </div>
    );
  }
  return (
    <div className={`${className} bg-gray-100 text-gray-600 rounded-full flex items-center justify-center font-extrabold text-[9px]`} title={storeId}>
      {storeId.substring(0, 2).toUpperCase()}
    </div>
  );
}

interface SaleItem {
  id: string;
  name: string;
  category: string;
  unit?: string;
  units?: number;
  regularPrice: number;
  salePrice: number;
  savings: number;
  storeName: string;
  storeId: string;
  lookup_url?: string;
  relevanceScore?: number;
  badgeType?: "freq" | "recent" | "top" | "sale";
  purchaseCount?: number;
}

export default function HomeTab() {
  const store = useOfflineStore();
  const carouselRef = useRef<HTMLDivElement>(null);

  // States
  const [isViewAllSaleOpen, setIsViewAllSaleOpen] = useState(false);
  const [saleSearchTerm, setSaleSearchTerm] = useState("");

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
            ...existing,
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

  // Shopping list set for O(1) checks
  const shoppingListNames = useMemo(() => {
    return new Set(store.groceryItems.map((i) => i.name.toLowerCase()));
  }, [store.groceryItems]);

  // Staples on Sale Calculations
  const saleItems = useMemo(() => {
    const list: SaleItem[] = [];
    // Keep track of added names to avoid duplicate items in carousel
    const seenNames = new Set<string>();

    for (const ri of store.regularItems) {
      const nameLower = ri.name.toLowerCase();
      if (seenNames.has(nameLower)) continue;

      const priceInfo = priceLookup.get(nameLower);
      if (!priceInfo) continue;

      let bestSaleStore: any = null;
      let minSalePrice = Infinity;

      const checkStoreSale = (sId: string, sInfo: any) => {
        const saleActive = isSaleActive(sInfo.valid_until);
        const isSale = (sInfo.is_on_sale === 1 || !!sInfo.is_on_sale) && saleActive;
        const saleVal = sInfo.sale_price;
        const regVal = sInfo.regular_price;
        if (isSale && saleVal !== null && saleVal !== undefined && saleVal > 0) {
          if (saleVal < minSalePrice) {
            minSalePrice = saleVal;
            bestSaleStore = {
              storeId: sId,
              storeName: sInfo.store_name || sId,
              regularPrice: regVal || saleVal,
              salePrice: saleVal,
              lookup_url: sInfo.lookup_url || "",
            };
          }
        }
      };

      if (priceInfo.stores && typeof priceInfo.stores === "object") {
        for (const [sId, sInfo] of Object.entries(priceInfo.stores)) {
          checkStoreSale(sId, sInfo);
        }
      } else {
        checkStoreSale(priceInfo.store_id || "foodbasics", priceInfo);
      }

      if (bestSaleStore) {
        seenNames.add(nameLower);
        
        // Calculate purchase metrics
        const itemHistory = (store.purchaseLogs || []).filter(
          (log) => log.name.toLowerCase() === nameLower
        );
        const purchaseCount = itemHistory.reduce((sum, log) => sum + (log.quantity || 1), 0);
        
        let daysSinceLastPurchase = Infinity;
        if (itemHistory.length > 0) {
          const latestLog = itemHistory.reduce((latest, current) => {
            return new Date(current.timestamp).getTime() > new Date(latest.timestamp).getTime() ? current : latest;
          }, itemHistory[0]);
          const lastDate = new Date(latestLog.timestamp);
          const diffMs = new Date().getTime() - lastDate.getTime();
          daysSinceLastPurchase = Math.max(0, diffMs / (1000 * 60 * 60 * 24));
        }

        const savings = Math.max(0, bestSaleStore.regularPrice - bestSaleStore.salePrice);
        
        // Relevance score computation
        let relevanceScore = 0;
        let badgeType: "freq" | "recent" | "top" | "sale" = "sale";

        if (purchaseCount > 0) {
          relevanceScore += 1000;
          relevanceScore += purchaseCount * 100;
          const recencyBoost = Math.max(0, 100 - daysSinceLastPurchase * 2);
          relevanceScore += recencyBoost;

          if (purchaseCount >= 2) {
            badgeType = "freq";
          } else if (daysSinceLastPurchase <= 14) {
            badgeType = "recent";
          }
        } else {
          relevanceScore += savings * 10;
          if (savings >= 1.50) {
            badgeType = "top";
          }
        }

        list.push({
          id: ri.id,
          name: ri.name,
          category: ri.category,
          unit: ri.unit,
          units: ri.units,
          regularPrice: bestSaleStore.regularPrice,
          salePrice: bestSaleStore.salePrice,
          savings,
          storeName: bestSaleStore.storeName,
          storeId: bestSaleStore.storeId,
          lookup_url: bestSaleStore.lookup_url,
          relevanceScore,
          badgeType,
          purchaseCount,
        });
      }
    }

    // Sort by relevanceScore descending
    return list.sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));
  }, [store.regularItems, priceLookup, store.purchaseLogs]);

  // Filtered View All Sale Items
  const filteredSales = useMemo(() => {
    return saleItems.filter((item) =>
      item.name.toLowerCase().includes(saleSearchTerm.toLowerCase()) ||
      item.category.toLowerCase().includes(saleSearchTerm.toLowerCase())
    );
  }, [saleItems, saleSearchTerm]);

  // Active Grocery Basket cost optimizations
  const optimization = useMemo(() => {
    const STORE_METADATA: Record<string, { name: string }> = {
      foodbasics: { name: "Food Basics" },
      metro: { name: "Metro" },
      freshco: { name: "FreshCo" },
      loblaws: { name: "Loblaws" },
      nofrills: { name: "No Frills" },
      yourindependentgrocer: { name: "Your Independent Grocer" },
      walmart: { name: "Walmart" },
      costco: { name: "Costco" },
      canadiantire: { name: "Canadian Tire" }
    };

    const activeStoreIds = new Set<string>();

    // Pass 1: Parse item prices
    const processedItems = store.groceryItems.map(item => {
      const priceInfo = priceLookup.get(item.name.toLowerCase());
      const itemPrices: Record<string, number> = {};

      if (priceInfo) {
        if (priceInfo.stores && typeof priceInfo.stores === "object") {
          for (const [sId, sInfo] of Object.entries(priceInfo.stores)) {
            const normId = normalizeStoreKey(sId);
            const p = getStoreActivePrice(sInfo as any);
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

      return { item, itemPrices };
    });

    const allStoreIds = new Set([
      ...Object.keys(STORE_METADATA),
      ...activeStoreIds
    ]);

    const storeTotals: Record<string, number> = {};
    for (const storeId of allStoreIds) {
      storeTotals[storeId] = 0;
    }

    let splitTotal = 0;
    let pricedCount = 0;

    for (const { item, itemPrices } of processedItems) {
      const availableStoreIds = Object.keys(itemPrices);
      
      if (availableStoreIds.length === 0) {
        continue;
      }

      pricedCount++;

      // Cheapest price for this item across all stores
      const cheapestPrice = Math.min(...Object.values(itemPrices));
      splitTotal += cheapestPrice * item.quantity;

      // Update store totals
      for (const storeId of allStoreIds) {
        const price = itemPrices[storeId] !== undefined ? itemPrices[storeId] : cheapestPrice;
        storeTotals[storeId] += price * item.quantity;
      }
    }

    // Find the cheapest and second cheapest single stores
    const activeTotals = Object.entries(storeTotals)
      .filter(([storeId]) => activeStoreIds.has(storeId))
      .map(([storeId, total]) => ({ storeId, total }))
      .sort((a, b) => a.total - b.total);

    let cheapestStoreName = "Food Basics";
    let singleStoreCheapestTotal = 0;
    let alternativeTotal = 0;

    if (activeTotals.length > 0) {
      cheapestStoreName = getStoreDisplayName(activeTotals[0].storeId);
      singleStoreCheapestTotal = activeTotals[0].total;
      alternativeTotal = activeTotals[1] ? activeTotals[1].total : activeTotals[0].total;
    }

    const splitSavings = Math.max(0, singleStoreCheapestTotal - splitTotal);
    const storeSavings = Math.max(0, alternativeTotal - singleStoreCheapestTotal);

    return {
      splitTotal,
      splitSavings,
      pricedCount,
      totalCount: store.groceryItems.length,
      cheapestStore: cheapestStoreName,
      singleStoreCheapestTotal,
      storeSavings,
      hasMultipleStores: activeTotals.length > 1
    };
  }, [store.groceryItems, priceLookup]);

  // Actions
  const handleToggleGroceryItem = async (ri: { name: string; category: string; unit?: string; units?: number }) => {
    const isAdded = shoppingListNames.has(ri.name.toLowerCase());
    if (isAdded) {
      await store.removeGroceryItemByName(ri.name);
    } else {
      await store.addGroceryItem(ri.name, 1, ri.unit || "unit", ri.category, ri.units);
    }
  };

  const scrollCarousel = (direction: "left" | "right") => {
    if (carouselRef.current) {
      const scrollAmount = 320;
      carouselRef.current.scrollBy({
        left: direction === "left" ? -scrollAmount : scrollAmount,
        behavior: "smooth"
      });
    }
  };

  return (
    <div className="space-y-8 pb-10">
      {/* Hero Welcome banner */}
      <div className="bg-gradient-to-br from-[#0d631b] via-[#2e7d32] to-[#4c56af] text-white p-6 rounded-2xl shadow-md relative overflow-hidden">
        <div className="absolute right-0 bottom-0 translate-x-4 translate-y-4 opacity-10">
          <Sparkles size={160} />
        </div>
        <div className="relative z-10 space-y-3">
          <span className="text-[10px] font-bold uppercase tracking-widest bg-white/20 px-2.5 py-1 rounded-full backdrop-blur-xs">
            ⚡ BasketWise Smart Saver
          </span>
          <h2 className="text-2xl font-extrabold tracking-tight leading-tight">
            Welcome back to BasketWise
          </h2>
          <p className="text-xs opacity-90 max-w-md leading-relaxed">
            Compare prices across Food Basics and Metro dynamically. Find local deals and split your basket to maximize savings!
          </p>
        </div>
      </div>

      {/* Staples on Sale Carousel Section */}
      <section className="relative">
        <div className="flex justify-between items-end mb-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Staples on Sale</h2>
            <p className="text-xs text-gray-500">Best local prices for everyday essentials</p>
          </div>
          <button 
            onClick={() => setIsViewAllSaleOpen(true)}
            className="text-[#0d631b] text-xs font-bold hover:underline bg-[#0d631b]/5 px-3 py-1.5 rounded-full transition-colors"
          >
            View All ({saleItems.length})
          </button>
        </div>

        {saleItems.length === 0 ? (
          <div className="bg-gray-50 border border-[#EEEEEE] rounded-2xl p-8 text-center text-gray-500 text-xs">
            No items are currently flagged on sale. Try loading more scraper configs or check back later!
          </div>
        ) : (
          <div className="relative group">
            {/* Scroll indicators for desktop */}
            <button 
              onClick={() => scrollCarousel("left")}
              className="absolute left-2 top-1/2 -translate-y-1/2 z-10 w-9 h-9 bg-white border border-[#EEEEEE] rounded-full shadow-md flex items-center justify-center text-gray-600 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity hover:bg-gray-50"
              aria-label="Scroll left"
            >
              <ChevronLeft size={18} />
            </button>
            
            <div 
              ref={carouselRef}
              className="flex overflow-x-auto gap-4 no-scrollbar pb-3 scroll-smooth snap-x snap-mandatory"
            >
              {saleItems.map((item) => {
                const isAdded = shoppingListNames.has(item.name.toLowerCase());
                return (
                  <div 
                    key={item.id}
                    onClick={() => handleToggleGroceryItem(item)}
                    className={`flex-shrink-0 w-72 bg-white rounded-2xl border transition-all duration-200 p-4 cursor-pointer snap-start select-none relative
                      ${isAdded 
                        ? "border-[#0d631b] shadow-xs bg-emerald-50/10 ring-1 ring-[#0d631b]" 
                        : "border-[#EEEEEE] hover:border-gray-300 hover:shadow-md"
                      }`}
                  >
                    <div className="flex gap-4">
                      {/* Image container */}
                      <div className="w-20 h-20 bg-gray-50 rounded-xl overflow-hidden flex-shrink-0 border border-gray-100 relative">
                        <img 
                          className="w-full h-full object-cover" 
                          src={getProductImage(item.name)} 
                          alt={item.name} 
                        />
                        {isAdded && (
                          <div className="absolute inset-0 bg-[#0d631b]/60 flex items-center justify-center">
                            <div className="bg-white text-[#0d631b] p-1.5 rounded-full shadow-sm">
                              <Check size={16} className="stroke-[3]" />
                            </div>
                          </div>
                        )}
                      </div>
                      
                      {/* Item Details */}
                      <div className="flex flex-col justify-between py-0.5 flex-1 min-w-0">
                        <div className="space-y-1">
                          <div className="flex gap-1 flex-wrap">
                            {item.badgeType === "freq" && (
                              <span className="bg-[#E8F5E9] text-[#2E7D32] text-[8px] font-black px-1.5 py-0.5 rounded-full uppercase tracking-wider border border-[#C8E6C9] flex-shrink-0">
                                🔥 Freq. Bought
                              </span>
                            )}
                            {item.badgeType === "recent" && (
                              <span className="bg-[#E3F2FD] text-[#1565C0] text-[8px] font-black px-1.5 py-0.5 rounded-full uppercase tracking-wider border border-[#BBDEFB] flex-shrink-0">
                                🕒 Rec. Bought
                              </span>
                            )}
                            {item.badgeType === "top" && (
                              <span className="bg-[#FFE0B2] text-[#E65100] text-[8px] font-black px-1.5 py-0.5 rounded-full uppercase tracking-wider border border-[#FFD180] flex-shrink-0">
                                💎 Top Deal
                              </span>
                            )}
                            {item.badgeType === "sale" && (
                              <span className="bg-[#FFF9C4] text-amber-900 text-[8px] font-black px-1.5 py-0.5 rounded-full uppercase tracking-wider border border-[#FFF59D] flex-shrink-0">
                                🏷️ On Sale
                              </span>
                            )}
                            <span className="bg-gray-100 text-gray-700 text-[8px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wider flex-shrink-0">
                              Save ${item.savings.toFixed(2)}
                            </span>
                          </div>
                          <h3 className="text-sm font-bold text-gray-900 truncate" title={item.name}>
                            {item.name}
                          </h3>
                        </div>

                        <div className="flex items-center gap-2">
                          <StoreLogo storeId={item.storeId} className="w-5 h-5 flex-shrink-0" />
                          <div className="flex items-baseline gap-1.5">
                            <span className="text-sm font-extrabold text-[#0d631b]">${item.salePrice.toFixed(2)}</span>
                            <span className="text-[10px] text-gray-400 line-through">${item.regularPrice.toFixed(2)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <button 
              onClick={() => scrollCarousel("right")}
              className="absolute right-2 top-1/2 -translate-y-1/2 z-10 w-9 h-9 bg-white border border-[#EEEEEE] rounded-full shadow-md flex items-center justify-center text-gray-600 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity hover:bg-gray-50"
              aria-label="Scroll right"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        )}
      </section>

      {/* Dynamic Smart Basket Tip Card */}
      <div className="bg-white rounded-2xl border border-[#EEEEEE] p-5 shadow-xs flex items-center gap-4 transition-all duration-300">
        <div className="w-12 h-12 bg-[#4c56af]/10 rounded-full flex items-center justify-center text-[#4c56af] flex-shrink-0">
          <Lightbulb size={24} />
        </div>
        <div className="space-y-1">
          <h4 className="text-xs font-bold text-[#4c56af] uppercase tracking-wider">Smart Basket Tip</h4>
          <p className="text-xs text-gray-700 leading-relaxed font-medium">
            {store.groceryItems.length === 0 ? (
              "Your shopping list is empty! Go to the Catalog or tap items above to add staples, compare prices, and unlock savings."
            ) : optimization.pricedCount === 0 ? (
              "Add price-tracked items to compare store prices and see which store is cheaper."
            ) : optimization.splitSavings > 0 ? (
              <span>
                Splitting your shopping list between the cheapest stores can save you <strong className="text-[#0d631b]">${optimization.splitSavings.toFixed(2)}</strong> today!
              </span>
            ) : (
              <span>
                Shopping entirely at <strong className="text-[#0d631b]">{optimization.cheapestStore}</strong> is currently your best option{optimization.hasMultipleStores && (
                  <>
                    , saving you <strong className="text-[#0d631b]">${optimization.storeSavings.toFixed(2)}</strong> over the alternative
                  </>
                )}.
              </span>
            )}
          </p>
        </div>
      </div>

      {/* --- Staples on Sale View All Modal Drawer Overlay --- */}
      {isViewAllSaleOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div 
            onClick={() => setIsViewAllSaleOpen(false)}
            className="absolute inset-0 bg-black/35 backdrop-blur-xs transition-opacity duration-300"
          />

          {/* Drawer container */}
          <div className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col p-6 z-10 animate-slideIn">
            {/* Header */}
            <div className="flex justify-between items-center border-b border-gray-100 pb-4 mb-4">
              <div>
                <h3 className="text-base font-extrabold text-gray-900">Staples on Sale</h3>
                <p className="text-[11px] text-gray-400 font-bold uppercase tracking-wider">All Active Deals</p>
              </div>
              <button 
                onClick={() => setIsViewAllSaleOpen(false)}
                className="w-8 h-8 rounded-full bg-gray-50 border border-gray-100 flex items-center justify-center text-gray-600 hover:bg-gray-100 transition-all"
                aria-label="Close panel"
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal search input */}
            <div className="relative mb-4">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input 
                type="text" 
                placeholder="Search deals..."
                value={saleSearchTerm}
                onChange={(e) => setSaleSearchTerm(e.target.value)}
                className="w-full bg-gray-50 border border-gray-100 rounded-xl py-2 pl-9 pr-4 text-xs font-medium text-gray-900 focus:outline-none focus:ring-1 focus:ring-[#0d631b] transition-all"
              />
              {saleSearchTerm && (
                <button 
                  onClick={() => setSaleSearchTerm("")} 
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                >
                  <X size={12} />
                </button>
              )}
            </div>

            {/* Scrollable Deals Grid */}
            <div className="flex-1 overflow-y-auto pr-1 space-y-3 no-scrollbar">
              {filteredSales.length === 0 ? (
                <div className="text-center text-gray-400 py-12 text-xs italic">
                  No sales found matching search.
                </div>
              ) : (
                filteredSales.map((item) => {
                  const isAdded = shoppingListNames.has(item.name.toLowerCase());
                  return (
                    <div 
                      key={item.id}
                      onClick={() => handleToggleGroceryItem(item)}
                      className={`flex items-center justify-between border rounded-xl p-3 cursor-pointer select-none transition-all duration-150
                        ${isAdded 
                          ? "border-[#0d631b] bg-emerald-50/10 ring-1 ring-[#0d631b]" 
                          : "border-gray-100 hover:border-gray-300 hover:shadow-xs"
                        }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {/* Image */}
                        <div className="w-12 h-12 bg-gray-50 rounded-lg overflow-hidden border border-gray-100 flex-shrink-0 relative">
                          <img 
                            className="w-full h-full object-cover" 
                            src={getProductImage(item.name)} 
                            alt={item.name} 
                          />
                          {isAdded && (
                            <div className="absolute inset-0 bg-[#0d631b]/60 flex items-center justify-center">
                              <Check size={12} className="text-white stroke-[3]" />
                            </div>
                          )}
                        </div>

                        {/* Title and details */}
                        <div className="min-w-0">
                          <h4 className="text-xs font-bold text-gray-800 truncate" title={item.name}>
                            {item.name}
                          </h4>
                          <div className="flex flex-wrap items-center gap-1.5 mt-1">
                            <StoreLogo storeId={item.storeId} className="w-4 h-4" />
                            <span className="text-[10px] text-gray-400 font-bold uppercase">{item.storeName}</span>
                            {item.badgeType === "freq" && (
                              <span className="bg-[#E8F5E9] text-[#2E7D32] text-[8px] font-black px-1.5 py-0.2 rounded-full uppercase tracking-wider border border-[#C8E6C9] flex-shrink-0">
                                🔥 Freq. Bought
                              </span>
                            )}
                            {item.badgeType === "recent" && (
                              <span className="bg-[#E3F2FD] text-[#1565C0] text-[8px] font-black px-1.5 py-0.2 rounded-full uppercase tracking-wider border border-[#BBDEFB] flex-shrink-0">
                                🕒 Rec. Bought
                              </span>
                            )}
                            {item.badgeType === "top" && (
                              <span className="bg-[#FFE0B2] text-[#E65100] text-[8px] font-black px-1.5 py-0.2 rounded-full uppercase tracking-wider border border-[#FFD180] flex-shrink-0">
                                💎 Top Deal
                              </span>
                            )}
                            <span className="bg-gray-100 text-gray-700 text-[8px] font-bold px-1.5 py-0.2 rounded-full uppercase tracking-wider flex-shrink-0">
                              Save ${item.savings.toFixed(2)}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Pricing and Action */}
                      <div className="flex items-center gap-3 pl-3">
                        <div className="text-right">
                          <div className="text-xs font-black text-[#0d631b]">${item.salePrice.toFixed(2)}</div>
                          <div className="text-[9px] text-gray-400 line-through">${item.regularPrice.toFixed(2)}</div>
                        </div>
                        <div 
                          className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors
                            ${isAdded 
                              ? "bg-[#0d631b] text-white" 
                              : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                            }`}
                        >
                          {isAdded ? <Check size={14} className="stroke-[3]" /> : <Plus size={14} />}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <div className="border-t border-gray-100 pt-4 mt-4">
              <button 
                onClick={() => setIsViewAllSaleOpen(false)}
                className="w-full py-2.5 bg-gray-900 text-white rounded-xl text-xs font-bold hover:bg-black transition-colors cursor-pointer text-center block"
              >
                Close Deals
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
