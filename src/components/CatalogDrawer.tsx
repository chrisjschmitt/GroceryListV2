import { useState, useMemo } from "react";
import { X, Search, Sparkles, Flame, Check, Plus, TrendingDown } from "lucide-react";
import { RegularItem, PriceEntry } from "@/lib/types";

interface CatalogDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  regularItems: RegularItem[];
  alreadyInList: Set<string>;
  priceLookup: Map<string, PriceEntry>;
  onAdd: (item: RegularItem) => Promise<void>;
  onRemove: (name: string) => Promise<void>;
}

export default function CatalogDrawer({
  isOpen,
  onClose,
  regularItems,
  alreadyInList,
  priceLookup,
  onAdd,
  onRemove,
}: CatalogDrawerProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All Items");
  const [addingIds, setAddingIds] = useState<Set<string>>(new Set());

  // Available categories derived dynamically or using standard list
  const categories = ["All Items", "Produce", "Dairy", "Pantry", "Bakery", "Meat", "Other"];

  // Filter catalog items
  const filteredItems = useMemo(() => {
    return regularItems.filter((item) => {
      const nameMatch = item.name.toLowerCase().includes(searchQuery.toLowerCase());
      
      const itemCategory = item.category || "Other";
      const normSelectedCategory = selectedCategory.toLowerCase();
      const normItemCategory = itemCategory.toLowerCase();

      let categoryMatch = false;
      if (selectedCategory === "All Items") {
        categoryMatch = true;
      } else if (normSelectedCategory === "dairy" && (normItemCategory.includes("dairy") || normItemCategory.includes("egg"))) {
        categoryMatch = true; // Match "Dairy" or "Dairy & Eggs"
      } else {
        categoryMatch = normItemCategory.includes(normSelectedCategory);
      }

      return nameMatch && categoryMatch;
    });
  }, [regularItems, searchQuery, selectedCategory]);

  const handleAddToggle = async (item: RegularItem) => {
    if (addingIds.has(item.id)) return;
    const isAdded = alreadyInList.has(item.name.toLowerCase());
    setAddingIds((prev) => {
      const next = new Set(prev);
      next.add(item.id);
      return next;
    });

    try {
      if (isAdded) {
        await onRemove(item.name);
      } else {
        await onAdd(item);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setAddingIds((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex justify-end transition-opacity duration-300">
      <div className="bg-background w-full max-w-lg h-full flex flex-col shadow-2xl relative animate-slide-in-right">
        {/* Drawer Header */}
        <div className="flex justify-between items-center px-4 py-4 border-b border-outline/10 bg-surface">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-extrabold text-on-surface">Browse Catalog</h2>
            <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-bold">
              {filteredItems.length} Items
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-surface-container rounded-full text-on-surface-variant hover:text-on-surface transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Search Bar */}
        <div className="p-4 bg-surface border-b border-outline/10 space-y-3">
          <div className="relative">
            <Search size={18} className="absolute left-4 top-3.5 text-on-surface-variant" />
            <input
              type="text"
              placeholder="Search groceries, brands, or deals..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-11 pl-11 pr-4 bg-surface-container-low border border-outline-variant rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all shadow-xs"
            />
          </div>

          {/* Horizontal Scrollable Categories */}
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none -mx-4 px-4">
            {categories.map((category) => {
              const isActive = selectedCategory === category;
              return (
                <button
                  key={category}
                  onClick={() => setSelectedCategory(category)}
                  className={`flex-shrink-0 px-4 py-1.5 rounded-full text-xs font-bold transition-all active:scale-95 ${
                    isActive
                      ? "bg-secondary text-on-secondary shadow-md"
                      : "bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high"
                  }`}
                >
                  {category}
                </button>
              );
            })}
          </div>
        </div>

        {/* Products Grid Area */}
        <div className="flex-1 overflow-y-auto p-4">
          {filteredItems.length === 0 ? (
            <div className="text-center py-16 text-on-surface-variant">
              <span className="text-4xl block mb-2">🔍</span>
              <h3 className="font-bold text-sm">No items found</h3>
              <p className="text-xs opacity-75 mt-1">Try checking your search terms or filters</p>
            </div>
          ) : (
            <div className="space-y-2 pb-8">
              {filteredItems.map((item) => {
                const isAdded = alreadyInList.has(item.name.toLowerCase());
                const isAdding = addingIds.has(item.id);

                // Price checking details
                const priceInfo = priceLookup.get(item.name.toLowerCase());
                let cheapestPriceStr = "";
                let isOnSale = false;
                let unitStr = item.unit ? ` / ${item.unit}` : "";

                if (priceInfo) {
                  let lowestPrice = Infinity;
                  if (priceInfo.stores && typeof priceInfo.stores === "object") {
                    for (const storeInfo of Object.values(priceInfo.stores)) {
                      const regPrice = typeof storeInfo.regular_price === "number" ? storeInfo.regular_price : parseFloat(storeInfo.regular_price || "0");
                      const activePrice = storeInfo.is_on_sale && storeInfo.sale_price !== null ? (typeof storeInfo.sale_price === "number" ? storeInfo.sale_price : parseFloat(storeInfo.sale_price || "0")) : regPrice;
                      if (activePrice > 0 && activePrice < lowestPrice) {
                        lowestPrice = activePrice;
                        if (storeInfo.is_on_sale) isOnSale = true;
                      }
                    }
                  } else {
                    const regPrice = typeof priceInfo.regular_price === "number" ? priceInfo.regular_price : parseFloat(priceInfo.regular_price || "0");
                    const activePrice = priceInfo.is_on_sale && priceInfo.sale_price !== null ? (typeof priceInfo.sale_price === "number" ? priceInfo.sale_price : parseFloat(priceInfo.sale_price || "0")) : regPrice;
                    if (activePrice > 0) {
                      lowestPrice = activePrice;
                      if (priceInfo.is_on_sale) isOnSale = true;
                    }
                  }

                  if (lowestPrice !== Infinity) {
                    cheapestPriceStr = `$${lowestPrice.toFixed(2)}`;
                  }
                }

                // Dynamic Category badge styles
                const getCategoryStyle = (category: string) => {
                  const cat = (category || "").toLowerCase();
                  if (cat.includes("produce")) return "bg-[#FFF9C4] text-[#827717]";
                  if (cat.includes("bakery")) return "bg-[#F3E5F5] text-[#7B1FA2]";
                  if (cat.includes("dairy") || cat.includes("egg")) return "bg-[#E1F5FE] text-[#0288D1]";
                  if (cat.includes("meat")) return "bg-[#FFEBEE] text-[#C62828]";
                  if (cat.includes("pantry")) return "bg-[#E8F5E9] text-[#2E7D32]";
                  return "bg-[#ECEFF1] text-[#37474F]";
                };

                return (
                  <div
                    key={item.id}
                    onClick={() => handleAddToggle(item)}
                    className={`cursor-pointer select-none transition-all duration-200 border rounded-xl p-4 flex items-center justify-between gap-4 hover:shadow-xs active:scale-[0.99] ${
                      isAdded
                        ? "bg-primary/[0.04] border-primary/25"
                        : "bg-surface-container-lowest border-outline-variant hover:bg-surface-container-low hover:border-outline"
                    }`}
                  >
                    <div className="flex flex-col flex-grow min-w-0">
                      {/* Category Badge & Product Name */}
                      <div className="flex items-center gap-2 mb-1.5 min-w-0">
                        <span className={`px-2 py-0.5 rounded-md font-bold text-[9px] uppercase tracking-wider shrink-0 select-none ${getCategoryStyle(item.category)}`}>
                          {item.category || "Other"}
                        </span>
                        <h4 className="text-sm font-bold text-on-surface truncate leading-tight" title={item.name}>
                          {item.name}
                        </h4>
                      </div>

                      {/* Price details & Price matched badge */}
                      {cheapestPriceStr && (
                        <div className="flex items-center gap-2 flex-wrap font-tnum mt-1">
                          <span className="text-sm font-extrabold text-primary">
                            {cheapestPriceStr}
                            <span className="text-[10px] text-on-surface-variant ml-0.5 font-normal">{unitStr}</span>
                          </span>
                          
                          {isOnSale ? (
                            <div className="flex items-center gap-0.5 bg-[#FFF9C4] text-[#7B5E00] px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider">
                              <Flame size={10} className="fill-amber-600 stroke-none" />
                              <span>Sale</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-0.5 bg-primary/10 text-primary px-1.5 py-0.5 rounded text-[9px] font-bold">
                              <TrendingDown size={10} />
                              <span>Tracked</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Status Circle indicator */}
                    <div
                      className={`shrink-0 w-8 h-8 rounded-full border flex items-center justify-center transition-all duration-200 ${
                        isAdded
                          ? "bg-primary border-primary text-on-primary"
                          : "border-primary/30 bg-transparent text-primary"
                      }`}
                    >
                      {isAdding ? (
                        <span className="animate-spin border-2 border-current border-t-transparent rounded-full w-4 h-4"></span>
                      ) : isAdded ? (
                        <Check size={16} className="stroke-[3.5px]" />
                      ) : (
                        <Plus size={16} className="stroke-[3.5px]" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
