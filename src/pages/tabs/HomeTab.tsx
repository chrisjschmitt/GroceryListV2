import { useState, useMemo, useRef } from "react";
import { useOfflineStore } from "@/lib/client/use-offline-store";
import { RegularItem, PriceEntry } from "@/lib/types";
import {
  Sparkles,
  TrendingDown,
  DollarSign,
  ShoppingBasket,
  Search,
  Plus,
  Check,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  X,
  Lightbulb,
  Flame
} from "lucide-react";

// --- Helper Functions copied from ListsTab for consistency ---
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

function isSaleActive(validUntil: string | null | undefined): boolean {
  if (!validUntil) return true;
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expiry = new Date(validUntil);
    if (isNaN(expiry.getTime())) return true;
    return expiry >= today;
  } catch {
    return true;
  }
}

function getStoreActivePrice(storeInfo: any): number | null {
  if (!storeInfo) return null;
  const hasReg = storeInfo.regular_price !== null && storeInfo.regular_price !== undefined && storeInfo.regular_price > 0;
  
  const saleActive = isSaleActive(storeInfo.valid_until);
  const hasSale = storeInfo.is_on_sale && saleActive && storeInfo.sale_price !== null && storeInfo.sale_price !== undefined && storeInfo.sale_price > 0;
  if (!hasReg && !hasSale) return null;
  
  if (hasSale) {
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
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [expandedPrices, setExpandedPrices] = useState<Set<string>>(new Set());
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

  // Trending Items calculations (Staples Basket regular items list)
  const trendingItems = useMemo(() => {
    return store.regularItems.map((ri) => {
      const priceInfo = priceLookup.get(ri.name.toLowerCase());
      const pricesList: {
        storeId: string;
        storeName: string;
        price: number;
        onSale: boolean;
        isExpired: boolean;
        validUntil: string | null;
        regularPrice: number | null;
        salePrice: number | null;
        lookup_url?: string;
      }[] = [];

      if (priceInfo) {
        const addPrice = (sId: string, sInfo: any) => {
          const val = getStoreActivePrice(sInfo);
          if (val !== null) {
            const saleActive = isSaleActive(sInfo.valid_until);
            pricesList.push({
              storeId: sId,
              storeName: sInfo.store_name || sId,
              price: val,
              onSale: (sInfo.is_on_sale === 1 || !!sInfo.is_on_sale) && saleActive,
              isExpired: !!sInfo.is_on_sale && !saleActive,
              validUntil: sInfo.valid_until || null,
              regularPrice: sInfo.regular_price != null ? Number(sInfo.regular_price) : null,
              salePrice: sInfo.sale_price != null ? Number(sInfo.sale_price) : null,
              lookup_url: sInfo.lookup_url,
            });
          }
        };

        if (priceInfo.stores && typeof priceInfo.stores === "object") {
          for (const [sId, sInfo] of Object.entries(priceInfo.stores)) {
            addPrice(sId, sInfo);
          }
        } else {
          addPrice(priceInfo.store_id || "foodbasics", priceInfo);
        }
      }

      let minPrice: number | null = null;
      let maxPrice: number | null = null;
      let avgPrice: number | null = null;

      if (pricesList.length > 0) {
        const vals = pricesList.map((p) => p.price);
        minPrice = Math.min(...vals);
        maxPrice = Math.max(...vals);
        avgPrice = vals.reduce((sum, v) => sum + v, 0) / vals.length;
      }

      return {
        id: ri.id,
        name: ri.name,
        category: ri.category,
        unit: ri.unit,
        units: ri.units,
        minPrice,
        maxPrice,
        avgPrice,
        pricesList,
      };
    }).filter((item) => item.pricesList.length > 0);
  }, [store.regularItems, priceLookup]);

  // Dynamic Categories from regularItems
  const categories = useMemo(() => {
    const cats = new Set<string>();
    cats.add("All");
    for (const item of store.regularItems) {
      if (item.category) {
        cats.add(item.category);
      }
    }
    return Array.from(cats);
  }, [store.regularItems]);

  // Filtered Trending Groceries
  const filteredTrending = useMemo(() => {
    return trendingItems.filter((item) => {
      const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                            item.category.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = selectedCategory === "All" || item.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [trendingItems, searchTerm, selectedCategory]);

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
      walmart: { name: "Walmart" }
    };

    const storeTotals: Record<string, number> = {};
    let splitTotal = 0;
    let pricedCount = 0;

    for (const storeId of Object.keys(STORE_METADATA)) {
      storeTotals[storeId] = 0;
    }

    const activeStoreIds = new Set<string>();

    // Pass 1: Parse item prices
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

      return { item, itemPrices };
    });

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
      for (const storeId of Object.keys(STORE_METADATA)) {
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
      cheapestStoreName = STORE_METADATA[activeTotals[0].storeId].name;
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

  const togglePriceExpand = (itemName: string) => {
    setExpandedPrices((prev) => {
      const next = new Set(prev);
      if (next.has(itemName)) {
        next.delete(itemName);
      } else {
        next.add(itemName);
      }
      return next;
    });
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

      {/* Trending Groceries Section */}
      <section className="space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Trending Groceries</h2>
            <p className="text-xs text-gray-500">Staples Basket catalog items & pricing spread</p>
          </div>

          {/* Search bar integration */}
          <div className="relative w-full sm:w-64">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input 
              type="text" 
              placeholder="Search staples..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-white border border-[#EEEEEE] rounded-full py-2 pl-10 pr-4 text-xs font-medium text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-[#0d631b] focus:border-[#0d631b] transition-all"
            />
            {searchTerm && (
              <button 
                onClick={() => setSearchTerm("")} 
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Category Filter Pills */}
        <div className="flex overflow-x-auto gap-2 no-scrollbar pb-2">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-4 py-2 rounded-full text-xs font-bold transition-all flex-shrink-0 cursor-pointer border
                ${selectedCategory === cat 
                  ? "bg-[#0d631b] text-white border-[#0d631b]" 
                  : "bg-white text-gray-600 border-[#EEEEEE] hover:bg-gray-50"
                }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Grid layout */}
        {filteredTrending.length === 0 ? (
          <div className="bg-white border border-[#EEEEEE] rounded-2xl p-12 text-center text-gray-500 text-xs">
            No trending staples found matching the filters.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredTrending.map((item) => {
              const isAdded = shoppingListNames.has(item.name.toLowerCase());
              
              // Calculate custom percentage values for the range slider
              const hasPrices = item.minPrice !== null && item.maxPrice !== null;
              const priceSpreadStr = hasPrices 
                ? `$${item.minPrice!.toFixed(2)} - $${item.maxPrice!.toFixed(2)}`
                : "No Scraped Prices";

              const maxBound = hasPrices ? item.maxPrice! * 1.25 : 0;
              const leftPercent = hasPrices && maxBound > 0 ? (item.minPrice! / maxBound) * 100 : 0;
              const rightPercent = hasPrices && maxBound > 0 ? 100 - (item.maxPrice! / maxBound) * 100 : 0;
              const avgPercent = hasPrices && maxBound > 0 && item.avgPrice ? (item.avgPrice / maxBound) * 100 : 0;
              const isExpanded = expandedPrices.has(item.name);

              let leftStoreLabel = "";
              let rightStoreLabel = "";
              if (item.pricesList.length > 0) {
                const sortedPrices = [...item.pricesList].sort((a, b) => {
                  if (a.price !== b.price) {
                    return a.price - b.price;
                  }
                  return a.storeName.localeCompare(b.storeName);
                });
                leftStoreLabel = sortedPrices[0].storeName;
                rightStoreLabel = sortedPrices.length > 1 ? sortedPrices[sortedPrices.length - 1].storeName : "";
              }

              return (
                <div 
                  key={item.id}
                  className={`bg-white rounded-2xl border p-4 flex flex-col justify-between transition-all duration-200
                    ${isAdded 
                      ? "border-[#0d631b] bg-emerald-50/5 ring-1 ring-[#0d631b]" 
                      : "border-[#EEEEEE] hover:border-gray-300"
                    }`}
                >
                  <div className="flex gap-4 items-start">
                    <div className="w-16 h-16 bg-gray-50 rounded-xl overflow-hidden border border-gray-100 flex-shrink-0 relative">
                      <img 
                        className="w-full h-full object-cover" 
                        src={getProductImage(item.name)} 
                        alt={item.name} 
                      />
                      {isAdded && (
                        <div className="absolute inset-0 bg-[#0d631b]/30 flex items-center justify-center" />
                      )}
                    </div>
                    
                    <div className="flex-1 min-w-0 py-0.5">
                      <h4 className="text-sm font-bold text-gray-900 truncate" title={item.name}>
                        {item.name}
                      </h4>
                      <p className="text-[11px] text-gray-400 font-bold uppercase tracking-wider mt-0.5">
                        {item.category}
                      </p>
                      {item.unit && (
                        <p className="text-[11px] text-gray-500 font-medium mt-0.5">
                          {item.units || 1} {item.unit}
                        </p>
                      )}
                    </div>

                    <button 
                      onClick={() => handleToggleGroceryItem(item)}
                      className={`w-9 h-9 rounded-full border flex items-center justify-center transition-all cursor-pointer flex-shrink-0
                        ${isAdded 
                          ? "bg-[#0d631b] border-[#0d631b] text-white hover:bg-[#2e7d32]" 
                          : "border-[#EEEEEE] text-[#0d631b] hover:bg-[#0d631b]/5"
                        }`}
                      aria-label={isAdded ? "Remove from Grocery List" : "Add to Grocery List"}
                    >
                      {isAdded ? <Check size={16} className="stroke-[3]" /> : <ShoppingBasket size={16} />}
                    </button>
                  </div>

                  {/* Range Slider Container */}
                  <div className="mt-5 space-y-2">
                    <div 
                      onClick={() => togglePriceExpand(item.name)}
                      className="cursor-pointer hover:bg-gray-50 p-2 rounded-xl border border-dashed border-gray-100 transition-colors"
                      title="Click to view store pricing details"
                    >
                      <div className="flex justify-between items-center mb-1.5">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
                          Price Range {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                        </span>
                        <span className="text-xs font-extrabold text-gray-900">
                          {priceSpreadStr}
                        </span>
                      </div>
                      
                      {hasPrices ? (
                        <div className="space-y-1.5">
                          <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden relative">
                            {/* Green range bar */}
                            <div 
                              className="absolute h-full bg-[#0d631b] rounded-full"
                              style={{ left: `${leftPercent}%`, right: `${rightPercent}%` }}
                            />
                            {/* Black average marker */}
                            <div 
                              className="absolute w-1 h-3 bg-gray-900 -top-0.5"
                              style={{ left: `${avgPercent}%` }}
                            />
                          </div>
                          <div className="flex justify-between items-center text-[9px] text-gray-400 font-bold uppercase">
                            <span className="truncate max-w-[40%] text-left" title={leftStoreLabel}>{leftStoreLabel}</span>
                            <span className="text-gray-900">Avg: ${item.avgPrice!.toFixed(2)}</span>
                            <span className="truncate max-w-[40%] text-right" title={rightStoreLabel}>{rightStoreLabel}</span>
                          </div>
                        </div>
                      ) : (
                        <div className="w-full h-2 bg-gray-100 rounded-full" />
                      )}
                    </div>

                    {/* Expandable store prices details */}
                    {isExpanded && (
                      <div className="bg-gray-50/50 rounded-xl border border-gray-100 p-3 mt-2 space-y-2 animate-fadeIn">
                        <h5 className="text-[9px] font-black text-gray-400 uppercase tracking-wider border-b border-gray-100 pb-1">
                          Available Store Pricing
                        </h5>
                        {item.pricesList.length === 0 ? (
                          <p className="text-[10px] text-gray-400 italic">No price data currently fetched for this item.</p>
                        ) : (
                          <div className="space-y-2">
                            {item.pricesList.map((pr) => (
                              <div key={pr.storeId} className="flex justify-between items-center text-xs">
                                <div className="flex items-center gap-2">
                                  <StoreLogo storeId={pr.storeId} className="w-5 h-5 flex-shrink-0" />
                                  <div className="flex flex-col">
                                    <span className="font-semibold text-gray-800 flex items-center gap-1.5">
                                      {pr.storeName}
                                      {pr.onSale && (
                                        <span className="bg-amber-100 text-amber-900 text-[8px] font-black px-1.5 py-0.5 rounded-sm uppercase flex items-center gap-0.5">
                                          <Flame size={8} className="fill-amber-600 stroke-none" />
                                          Sale
                                        </span>
                                      )}
                                      {pr.isExpired && (
                                        <span className="bg-red-50 text-red-500 text-[8px] font-black px-1.5 py-0.5 rounded-sm border border-red-100 uppercase">
                                          Expired
                                        </span>
                                      )}
                                    </span>
                                    {pr.validUntil && (
                                      <span className="text-[9px] text-gray-400 font-medium">
                                        {pr.onSale ? `ends ${pr.validUntil}` : pr.isExpired ? `expired ${pr.validUntil}` : ""}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  {pr.isExpired ? (
                                    <div className="flex flex-col items-end font-tnum">
                                      <span className="font-extrabold text-gray-900">${pr.regularPrice?.toFixed(2)}</span>
                                      <span className="text-[9px] text-red-500 line-through opacity-85">
                                        Sale: ${pr.salePrice?.toFixed(2)}
                                      </span>
                                    </div>
                                  ) : pr.onSale ? (
                                    <div className="flex flex-col items-end font-tnum">
                                      <span className="font-extrabold text-amber-600">${pr.price.toFixed(2)}</span>
                                      {pr.regularPrice !== null && pr.regularPrice !== undefined && pr.regularPrice > 0 && (
                                        <span className="text-[9px] text-gray-400 line-through opacity-60">
                                          Reg: ${pr.regularPrice.toFixed(2)}
                                        </span>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="font-extrabold text-gray-900 font-tnum">${pr.price.toFixed(2)}</span>
                                  )}
                                  {pr.lookup_url && (
                                    <a 
                                      href={pr.lookup_url} 
                                      target="_blank" 
                                      rel="noopener noreferrer"
                                      className="text-gray-400 hover:text-gray-700 transition-colors p-1"
                                      title="Verify price at store web page"
                                    >
                                      <ExternalLink size={12} />
                                    </a>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

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
