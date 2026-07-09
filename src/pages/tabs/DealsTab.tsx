import { useMemo, useRef, useState } from "react";
import { useOfflineStore } from "@/lib/client/offline-store-context";
import type { PriceEntry } from "@/lib/types";
import { ChevronLeft, ChevronRight, Check, Search, X, Plus } from "lucide-react";
import { isSaleActive, normalizeStoreKey, getStoreDisplayName } from "@/lib/price-utils";

const PRODUCT_IMAGES: Record<string, string> = {
  milk: "https://images.unsplash.com/photo-1550583724-b2692b85b150?auto=format&fit=crop&q=80&w=200",
  egg: "https://images.unsplash.com/photo-1506976785307-8732e854ad03?auto=format&fit=crop&q=80&w=200",
  bread: "https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&q=80&w=200",
  banana: "https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?auto=format&fit=crop&q=80&w=200",
  coffee: "https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&q=80&w=200",
  broccoli: "https://images.unsplash.com/photo-1453224311646-69d40b747e25?auto=format&fit=crop&q=80&w=200",
  chicken: "https://images.unsplash.com/photo-1604503468506-a8da13d82791?auto=format&fit=crop&q=80&w=200",
  beef: "https://images.unsplash.com/photo-1588166524941-3bf61a9c41db?auto=format&fit=crop&q=80&w=200",
  butter: "https://images.unsplash.com/photo-1589985270826-4b7bb135bc9d?auto=format&fit=crop&q=80&w=200",
  yogurt: "https://images.unsplash.com/photo-1571244856353-fb085c66d2c0?auto=format&fit=crop&q=80&w=200",
  cheese: "https://images.unsplash.com/photo-1552763440-47e2ebde8f1f?auto=format&fit=crop&q=80&w=200",
  lettuce: "https://images.unsplash.com/photo-1622206151226-18ca2c9ab4a1?auto=format&fit=crop&q=80&w=200",
  mushroom: "https://images.unsplash.com/photo-1534422298391-e4f8c172dddb?auto=format&fit=crop&q=80&w=200",
  cereal: "https://images.unsplash.com/photo-1586444248902-2f64eddc13df?auto=format&fit=crop&q=80&w=200",
};

function getProductImage(name: string): string {
  const lower = (name || "").toLowerCase();
  for (const [key, url] of Object.entries(PRODUCT_IMAGES)) {
    if (lower.includes(key)) return url;
  }
  return PRODUCT_IMAGES.cereal;
}

function StoreLogo({ storeId, className = "w-6 h-6" }: { storeId: string; className?: string }) {
  const normId = normalizeStoreKey(storeId);
  if (normId === "foodbasics") {
    return (
      <div className={`${className} bg-[#0d631b]/10 text-[#0d631b] rounded-full flex items-center justify-center font-extrabold text-[9px]`} title="Food Basics">
        FB
      </div>
    );
  }
  if (normId === "metro") {
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
  relevanceScore?: number;
  badgeType?: "freq" | "recent" | "top" | "sale";
  purchaseCount?: number;
}

export default function DealsTab() {
  const store = useOfflineStore();
  const carouselRef = useRef<HTMLDivElement>(null);

  const [isViewAllSaleOpen, setIsViewAllSaleOpen] = useState(false);
  const [saleSearchTerm, setSaleSearchTerm] = useState("");

  const priceLookup = useMemo(() => {
    const map = new Map<string, PriceEntry>();
    for (const entry of Object.values(store.prices)) {
      if (!entry) continue;
      const keysToRegister: string[] = [];
      if ((entry as any).config_name) keysToRegister.push(String((entry as any).config_name).toLowerCase());
      if ((entry as any).item_name) keysToRegister.push(String((entry as any).item_name).toLowerCase());
      for (const k of keysToRegister) {
        if (!map.has(k)) map.set(k, entry);
      }
    }
    return map;
  }, [store.prices]);

  const shoppingListNames = useMemo(() => new Set(store.groceryItems.map((i) => i.name.toLowerCase())), [store.groceryItems]);

  const saleItems = useMemo(() => {
    const list: SaleItem[] = [];
    const seenNames = new Set<string>();

    for (const ri of store.regularItems) {
      const nameLower = (ri.name || "").toLowerCase();
      if (!nameLower || seenNames.has(nameLower)) continue;

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
              storeId: normalizeStoreKey(sId),
              storeName: sInfo.store_name || getStoreDisplayName(sId),
              regularPrice: regVal || saleVal,
              salePrice: saleVal,
            };
          }
        }
      };

      if ((priceInfo as any).stores && typeof (priceInfo as any).stores === "object") {
        for (const [sId, sInfo] of Object.entries((priceInfo as any).stores)) {
          checkStoreSale(sId, sInfo);
        }
      } else {
        const storeId = (priceInfo as any).store_id || "foodbasics";
        checkStoreSale(storeId, priceInfo);
      }

      if (!bestSaleStore) continue;
      seenNames.add(nameLower);

      const itemHistory = (store.purchaseLogs || []).filter((log) => (log.name || "").toLowerCase() === nameLower);
      const purchaseCount = itemHistory.reduce((sum, log) => sum + (log.quantity || 1), 0);
      let daysSinceLastPurchase = Infinity;
      if (itemHistory.length > 0) {
        const latestLog = itemHistory.reduce((latest, current) =>
          new Date(current.timestamp).getTime() > new Date(latest.timestamp).getTime() ? current : latest
        );
        const diffMs = new Date().getTime() - new Date(latestLog.timestamp).getTime();
        daysSinceLastPurchase = Math.max(0, diffMs / (1000 * 60 * 60 * 24));
      }

      const savings = Math.max(0, bestSaleStore.regularPrice - bestSaleStore.salePrice);
      let relevanceScore = 0;
      let badgeType: "freq" | "recent" | "top" | "sale" = "sale";
      if (purchaseCount > 0) {
        relevanceScore += 1000 + purchaseCount * 100;
        relevanceScore += Math.max(0, 100 - daysSinceLastPurchase * 2);
        if (purchaseCount >= 2) badgeType = "freq";
        else if (daysSinceLastPurchase <= 14) badgeType = "recent";
      } else {
        relevanceScore += savings * 10;
        if (savings >= 1.5) badgeType = "top";
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
        relevanceScore,
        badgeType,
        purchaseCount,
      });
    }

    return list.sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));
  }, [store.regularItems, priceLookup, store.purchaseLogs]);

  const filteredSales = useMemo(() => {
    const q = saleSearchTerm.trim().toLowerCase();
    if (!q) return saleItems;
    return saleItems.filter((item) => item.name.toLowerCase().includes(q) || item.category.toLowerCase().includes(q));
  }, [saleItems, saleSearchTerm]);

  const handleToggleGroceryItem = async (ri: { name: string; category: string; unit?: string; units?: number }) => {
    const isAdded = shoppingListNames.has(ri.name.toLowerCase());
    if (isAdded) await store.removeGroceryItemByName(ri.name);
    else await store.addGroceryItem(ri.name, 1, ri.unit || "unit", ri.category, ri.units);
  };

  const scrollCarousel = (direction: "left" | "right") => {
    if (!carouselRef.current) return;
    const scrollAmount = 320;
    carouselRef.current.scrollBy({ left: direction === "left" ? -scrollAmount : scrollAmount, behavior: "smooth" });
  };

  return (
    <div className="space-y-6 pb-10">
      <section className="relative">
        <div className="flex justify-between items-end mb-4">
          <div>
            <h2 className="text-lg font-extrabold text-gray-900">Items currently on sale</h2>
            <p className="text-xs text-gray-500">Tap an item to add/remove it from your grocery list</p>
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
            No items are currently flagged on sale.
          </div>
        ) : (
          <div className="relative group">
            <button
              onClick={() => scrollCarousel("left")}
              className="absolute left-2 top-1/2 -translate-y-1/2 z-10 w-9 h-9 bg-white border border-[#EEEEEE] rounded-full shadow-md flex items-center justify-center text-gray-600 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity hover:bg-gray-50"
              aria-label="Scroll left"
            >
              <ChevronLeft size={18} />
            </button>

            <div ref={carouselRef} className="flex overflow-x-auto gap-4 no-scrollbar pb-3 scroll-smooth snap-x snap-mandatory">
              {saleItems.map((item) => {
                const isAdded = shoppingListNames.has(item.name.toLowerCase());
                return (
                  <div
                    key={item.id}
                    onClick={() => handleToggleGroceryItem(item)}
                    className={`flex-shrink-0 w-72 bg-white rounded-2xl border transition-all duration-200 p-4 cursor-pointer snap-start select-none relative
                      ${isAdded ? "border-[#0d631b] shadow-xs bg-emerald-50/10 ring-1 ring-[#0d631b]" : "border-[#EEEEEE] hover:border-gray-300 hover:shadow-md"}`}
                  >
                    <div className="flex gap-4">
                      <div className="w-20 h-20 bg-gray-50 rounded-xl overflow-hidden flex-shrink-0 border border-gray-100 relative">
                        <img className="w-full h-full object-cover" src={getProductImage(item.name)} alt={item.name} />
                        {isAdded && (
                          <div className="absolute inset-0 bg-[#0d631b]/60 flex items-center justify-center">
                            <div className="bg-white text-[#0d631b] p-1.5 rounded-full shadow-sm">
                              <Check size={16} className="stroke-[3]" />
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="flex flex-col justify-between py-0.5 flex-1 min-w-0">
                        <div className="space-y-1">
                          <div className="flex gap-1 flex-wrap">
                            {item.badgeType === "freq" && (
                              <span className="bg-[#E8F5E9] text-[#2E7D32] text-[8px] font-black px-1.5 py-0.5 rounded-full uppercase tracking-wider border border-[#C8E6C9] flex-shrink-0">
                                Freq. bought
                              </span>
                            )}
                            {item.badgeType === "recent" && (
                              <span className="bg-[#E3F2FD] text-[#1565C0] text-[8px] font-black px-1.5 py-0.5 rounded-full uppercase tracking-wider border border-[#BBDEFB] flex-shrink-0">
                                Recently bought
                              </span>
                            )}
                            {item.badgeType === "top" && (
                              <span className="bg-[#FFE0B2] text-[#E65100] text-[8px] font-black px-1.5 py-0.5 rounded-full uppercase tracking-wider border border-[#FFD180] flex-shrink-0">
                                Top deal
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

      {isViewAllSaleOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div onClick={() => setIsViewAllSaleOpen(false)} className="absolute inset-0 bg-black/35 backdrop-blur-xs transition-opacity duration-300" />

          <div className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col p-6 z-10 animate-slideIn">
            <div className="flex justify-between items-center border-b border-gray-100 pb-4 mb-4">
              <div>
                <h3 className="text-base font-extrabold text-gray-900">Items on sale</h3>
                <p className="text-[11px] text-gray-400 font-bold uppercase tracking-wider">All active deals</p>
              </div>
              <button
                onClick={() => setIsViewAllSaleOpen(false)}
                className="w-8 h-8 rounded-full bg-gray-50 border border-gray-100 flex items-center justify-center text-gray-600 hover:bg-gray-100 transition-all"
                aria-label="Close panel"
              >
                <X size={16} />
              </button>
            </div>

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
                <button onClick={() => setSaleSearchTerm("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                  <X size={12} />
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto pr-1 space-y-3 no-scrollbar">
              {filteredSales.length === 0 ? (
                <div className="text-center text-gray-400 py-12 text-xs italic">No sales found matching search.</div>
              ) : (
                filteredSales.map((item) => {
                  const isAdded = shoppingListNames.has(item.name.toLowerCase());
                  return (
                    <div
                      key={item.id}
                      onClick={() => handleToggleGroceryItem(item)}
                      className={`flex items-center justify-between border rounded-xl p-3 cursor-pointer select-none transition-all duration-150
                        ${isAdded ? "border-[#0d631b] bg-emerald-50/10 ring-1 ring-[#0d631b]" : "border-gray-100 hover:border-gray-300 hover:shadow-xs"}`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-12 h-12 bg-gray-50 rounded-lg overflow-hidden border border-gray-100 flex-shrink-0 relative">
                          <img className="w-full h-full object-cover" src={getProductImage(item.name)} alt={item.name} />
                          {isAdded && (
                            <div className="absolute inset-0 bg-[#0d631b]/60 flex items-center justify-center">
                              <Check size={12} className="text-white stroke-[3]" />
                            </div>
                          )}
                        </div>

                        <div className="min-w-0">
                          <h4 className="text-xs font-bold text-gray-800 truncate" title={item.name}>
                            {item.name}
                          </h4>
                          <div className="flex flex-wrap items-center gap-1.5 mt-1">
                            <StoreLogo storeId={item.storeId} className="w-4 h-4" />
                            <span className="text-[10px] text-gray-400 font-bold uppercase">{item.storeName}</span>
                            <span className="bg-gray-100 text-gray-700 text-[8px] font-bold px-1.5 py-0.2 rounded-full uppercase tracking-wider flex-shrink-0">
                              Save ${item.savings.toFixed(2)}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 pl-3">
                        <div className="text-right">
                          <div className="text-xs font-black text-[#0d631b]">${item.salePrice.toFixed(2)}</div>
                          <div className="text-[9px] text-gray-400 line-through">${item.regularPrice.toFixed(2)}</div>
                        </div>
                        <div
                          className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors
                            ${isAdded ? "bg-[#0d631b] text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}
                        >
                          {isAdded ? <Check size={14} className="stroke-[3]" /> : <Plus size={14} />}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="border-t border-gray-100 pt-4 mt-4">
              <button
                onClick={() => setIsViewAllSaleOpen(false)}
                className="w-full py-2.5 bg-gray-900 text-white rounded-xl text-xs font-bold hover:bg-black transition-colors cursor-pointer text-center block"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

