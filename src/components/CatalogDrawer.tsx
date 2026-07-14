import React, { useState, useMemo } from "react";
import { X, Search, Sparkles, Flame, Check, Plus, TrendingDown, ExternalLink } from "lucide-react";
import { RegularItem, PriceEntry } from "@/lib/types";

interface CatalogDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  regularItems: RegularItem[];
  alreadyInList: Set<string>;
  priceLookup: Map<string, PriceEntry>;
  onAdd: (item: RegularItem) => Promise<void>;
  onRemove: (name: string) => Promise<void>;
  onCustomAdd: (name: string, category: string, quantity: number) => Promise<void>;
  isInline?: boolean;
}

import { normalizeStoreKey, isSaleActive, getStoreActivePrice, isOnSaleFlag } from "@/lib/price-utils";

export default function CatalogDrawer({
  isOpen,
  onClose,
  regularItems,
  alreadyInList,
  priceLookup,
  onAdd,
  onRemove,
  onCustomAdd,
  isInline = false,
}: CatalogDrawerProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All Items");
  const [addingIds, setAddingIds] = useState<Set<string>>(new Set());
  
  // Custom item addition state
  const [showAddCustomForm, setShowAddCustomForm] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customCategory, setCustomCategory] = useState("Other");
  const [customQty, setCustomQty] = useState(1);
  
  // Expanded dropdown & reporting states
  const [expandedItemPrices, setExpandedItemPrices] = useState<Set<string>>(new Set());
  const [reportingKeys, setReportingKeys] = useState<Set<string>>(new Set());
  const [reportedKeys, setReportedKeys] = useState<Set<string>>(new Set());

  // Available categories derived dynamically or using standard list
  const categories = ["All Items", "Produce", "Dairy", "Pantry", "Bakery", "Meat", "Other"];

  // Filter and sort catalog items
  const filteredItems = useMemo(() => {
    const filtered = regularItems.filter((item) => {
      // Hide unmatched flyer items that no longer have any active/valid prices (expired sale and no distinct regular price)
      if (item.id.startsWith("regular-unmatched-")) {
        const hasActivePrice = Object.values(item.stores || {}).some((storeInfo: any) => {
          return getStoreActivePrice(storeInfo) !== null;
        });
        if (!hasActivePrice) {
          return false;
        }
      }

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

    if (selectedCategory === "All Items") {
      return [...filtered].sort((a, b) => {
        const catA = (a.category || "Other").toLowerCase();
        const catB = (b.category || "Other").toLowerCase();
        if (catA !== catB) {
          return catA.localeCompare(catB);
        }
        return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
      });
    } else {
      return [...filtered].sort((a, b) => {
        return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
      });
    }
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

  const toggleItemPrices = (itemId: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Avoid triggering lists toggle
    setExpandedItemPrices((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  };

  const handleReportIncorrectPrice = async (
    e: React.MouseEvent,
    itemName: string,
    itemId: string,
    storeId: string,
    currentPrice: number,
    lookupUrl: string
  ) => {
    e.stopPropagation(); // Avoid triggering list addition toggle
    const reportKey = `${itemId}-${storeId}`;
    if (reportingKeys.has(reportKey) || reportedKeys.has(reportKey)) return;

    setReportingKeys((prev) => {
      const next = new Set(prev);
      next.add(reportKey);
      return next;
    });

    try {
      const response = await fetch("/api/report-pricing-issue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemName,
          storeId,
          reportedPrice: currentPrice,
          lookupUrl,
        }),
      });

      if (response.ok) {
        setReportedKeys((prev) => {
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
      setReportingKeys((prev) => {
        const next = new Set(prev);
        next.delete(reportKey);
        return next;
      });
    }
  };

  const getStoreBadgeClass = (storeId: string) => {
    const norm = normalizeStoreKey(storeId);
    if (norm === "foodbasics") return "bg-[#0d631b]/10 text-[#0d631b] border-[#0d631b]/20 hover:bg-[#0d631b]/20";
    if (norm === "metro") return "bg-[#4c56af]/10 text-[#4c56af] border-[#4c56af]/20 hover:bg-[#4c56af]/20";
    if (norm === "costco") return "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100";
    if (norm === "freshco") return "bg-lime-50 text-lime-700 border-lime-200 hover:bg-lime-100";
    return "bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100";
  };

  if (!isOpen && !isInline) return null;

  const innerContent = (
    <>
        {/* Drawer Header */}
        <div className="flex justify-between items-center px-4 py-4 border-b border-outline/10 bg-surface">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-extrabold text-on-surface">Browse Catalog</h2>
            <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-bold">
              {filteredItems.length} Items
            </span>
          </div>
          {!isInline && (
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-surface-container rounded-full text-on-surface-variant hover:text-on-surface transition-colors"
            >
              <X size={20} />
            </button>
          )}
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
          {showAddCustomForm ? (
            <div className="bg-surface border-2 border-black rounded-2xl p-5 shadow-[4px_4px_0px_rgba(0,0,0,1)] space-y-4 max-w-sm mx-auto">
              <h3 className="text-base font-black uppercase tracking-wider text-primary">Add Custom Item</h3>
              
              {/* Item Name Input */}
              <div className="space-y-1.5">
                <label className="text-xs font-black uppercase text-on-surface-variant">Item Name</label>
                <input
                  type="text"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder="e.g. Organic Avocados"
                  className="w-full h-11 px-4 bg-surface-container-low border-2 border-black rounded-lg text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                />
              </div>

              {/* Category Select Dropdown */}
              <div className="space-y-1.5">
                <label className="text-xs font-black uppercase text-on-surface-variant">Category</label>
                <select
                  value={customCategory}
                  onChange={(e) => setCustomCategory(e.target.value)}
                  className="w-full h-11 px-4 bg-surface-container-low border-2 border-black rounded-lg text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                >
                  {categories.filter(c => c !== "All Items").map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              {/* Quantity Counter */}
              <div className="space-y-1.5">
                <label className="text-xs font-black uppercase text-on-surface-variant block">Quantity</label>
                <div className="flex items-center border-2 border-black bg-surface rounded-lg overflow-hidden w-32">
                  <button
                    type="button"
                    onClick={() => setCustomQty(prev => Math.max(1, prev - 1))}
                    className="px-3 py-2 hover:bg-surface-container-low text-primary font-extrabold border-r-2 border-black transition-colors"
                  >
                    -
                  </button>
                  <span className="flex-1 text-center text-sm font-black font-tnum select-none">
                    {customQty}
                  </span>
                  <button
                    type="button"
                    onClick={() => setCustomQty(prev => prev + 1)}
                    className="px-3 py-2 hover:bg-surface-container-low text-primary font-extrabold border-l-2 border-black transition-colors"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddCustomForm(false)}
                  className="px-4 py-2 border-2 border-black font-black text-xs uppercase rounded-lg hover:bg-surface-container-low transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (!customName.trim()) return;
                    await onCustomAdd(customName.trim(), customCategory, customQty);
                    // Reset and close
                    setShowAddCustomForm(false);
                    setSearchQuery("");
                    onClose();
                  }}
                  className="px-4 py-2 bg-emerald-500 text-black hover:bg-emerald-600 font-black text-xs uppercase rounded-lg border-2 border-black shadow-[2px_2px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all cursor-pointer"
                >
                  Add Item
                </button>
              </div>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="text-center py-16 text-on-surface-variant space-y-4">
              <div>
                <span className="text-4xl block mb-2">🔍</span>
                <h3 className="font-bold text-sm">No items found</h3>
                <p className="text-xs opacity-75 mt-1">Try checking your search terms or filters</p>
              </div>
              {searchQuery.trim() !== "" && (
                <div className="border border-outline/10 p-4 rounded-xl bg-surface-container-low max-w-xs mx-auto space-y-3">
                  <p className="text-xs font-bold leading-relaxed">
                    Would you like to add <strong className="text-primary">"{searchQuery}"</strong> to your list?
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setCustomName(searchQuery.trim());
                      setCustomCategory(selectedCategory !== "All Items" ? selectedCategory : "Other");
                      setCustomQty(1);
                      setShowAddCustomForm(true);
                    }}
                    className="w-full py-2 bg-primary text-on-primary hover:bg-primary-container font-black text-xs uppercase rounded-lg border border-black shadow-[2px_2px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all cursor-pointer"
                  >
                    Create Custom Item
                  </button>
                </div>
              )}
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

                const storesWithPrices: {
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
                      const isExpired = isOnSaleFlag(sInfo.is_on_sale) && !saleActive;
                      storesWithPrices.push({
                        storeId: sId,
                        storeName: sInfo.store_name || sId,
                        price: val,
                        onSale: isOnSaleFlag(sInfo.is_on_sale) && saleActive,
                        isExpired,
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

                  if (storesWithPrices.length > 0) {
                    const activePrices = storesWithPrices.map(p => p.price);
                    const lowestPrice = Math.min(...activePrices);
                    cheapestPriceStr = `$${lowestPrice.toFixed(2)}`;
                    isOnSale = storesWithPrices.some(p => p.onSale);
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
                    className={`cursor-pointer select-none transition-all duration-200 border rounded-xl p-4 flex flex-col gap-1 hover:shadow-xs active:scale-[0.99] ${
                      isAdded
                        ? "bg-primary/[0.04] border-primary/25"
                        : "bg-surface-container-lowest border-outline-variant hover:bg-surface-container-low hover:border-outline"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-4 w-full">
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

                    {/* Store Badges Row */}
                    {storesWithPrices.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {storesWithPrices.map((sp) => (
                          <button
                            key={sp.storeId}
                            onClick={(e) => toggleItemPrices(item.id, e)}
                            className={`px-2.5 py-1 rounded-full text-[9px] font-extrabold border cursor-pointer select-none transition-all hover:scale-105 active:scale-95 flex items-center gap-1 ${getStoreBadgeClass(sp.storeId)}`}
                          >
                            {sp.onSale && <Flame size={9} className="fill-amber-600 stroke-none" />}
                            {sp.isExpired && <span>⏰</span>}
                            <span>{sp.storeName}</span>
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Expandable store prices details */}
                    {expandedItemPrices.has(item.id) && storesWithPrices.length > 0 && (
                      <div 
                        onClick={(e) => e.stopPropagation()} 
                        className="mt-3 pt-3 border-t border-outline/10 space-y-2 cursor-default w-full"
                      >
                        <div className="text-[9px] font-black text-on-surface-variant uppercase tracking-wider mb-2">
                          Scraped Prices by Store
                        </div>
                        <div className="space-y-2">
                          {storesWithPrices.map((sp) => {
                            const reportKey = `${item.id}-${sp.storeId}`;
                            const isReporting = reportingKeys.has(reportKey);
                            const isReported = reportedKeys.has(reportKey);
                            
                            return (
                              <div key={sp.storeId} className="flex justify-between items-center text-xs">
                                <div className="flex items-center gap-2">
                                  <span className="font-bold">
                                    {sp.lookup_url ? (
                                      <a 
                                        href={sp.lookup_url} 
                                        target="_blank" 
                                        rel="noopener noreferrer" 
                                        className="text-[#4c56af] hover:underline flex items-center gap-1"
                                      >
                                        {sp.storeName}
                                        <ExternalLink size={10} />
                                      </a>
                                    ) : (
                                      sp.storeName
                                    )}
                                  </span>
                                  {sp.onSale && (
                                    <span className="bg-[#FFF9C4] text-[#7B5E00] text-[8px] font-black px-1.5 py-0.5 rounded-sm uppercase flex items-center gap-0.5">
                                      <Flame size={8} className="fill-amber-600 stroke-none" />
                                      Sale
                                    </span>
                                  )}
                                  {sp.isExpired && (
                                    <span className="bg-red-50 text-red-500 text-[8px] font-black px-1.5 py-0.5 rounded-sm border border-red-100 uppercase">
                                      Expired
                                    </span>
                                  )}
                                  {sp.validUntil && (
                                    <span className="text-[9px] text-on-surface-variant opacity-75">
                                      {sp.onSale ? `until ${sp.validUntil}` : `on ${sp.validUntil}`}
                                    </span>
                                  )}
                                </div>
                                
                                <div className="flex items-center gap-3">
                                  {sp.isExpired ? (
                                    <div className="flex flex-col items-end font-tnum">
                                      <span className="font-extrabold text-on-surface">${sp.regularPrice?.toFixed(2)}</span>
                                      <span className="text-[9px] text-red-500 line-through opacity-85">
                                        Sale: ${sp.salePrice?.toFixed(2)}
                                      </span>
                                    </div>
                                  ) : sp.onSale ? (
                                    <div className="flex flex-col items-end font-tnum">
                                      <span className="font-extrabold text-amber-600">${sp.price.toFixed(2)}</span>
                                      {sp.regularPrice !== null && sp.regularPrice !== undefined && sp.regularPrice > 0 && (
                                        <span className="text-[9px] text-on-surface-variant line-through opacity-60">
                                          Reg: ${sp.regularPrice.toFixed(2)}
                                        </span>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="font-extrabold text-on-surface font-tnum">${sp.price.toFixed(2)}</span>
                                  )}
                                  
                                  <button
                                    onClick={(e) => handleReportIncorrectPrice(e, item.name, item.id, sp.storeId, sp.price, sp.lookup_url || "")}
                                    disabled={isReporting || isReported}
                                    className={`flex items-center gap-1 px-2 py-1 rounded text-[9px] font-extrabold border transition-colors cursor-pointer select-none
                                      ${isReported 
                                        ? "bg-red-50 text-red-500 border-red-200" 
                                        : isReporting 
                                          ? "bg-gray-50 text-gray-400 border-gray-200 cursor-wait" 
                                          : "bg-amber-50 text-amber-600 border-amber-200 hover:bg-amber-100 hover:text-amber-700"
                                      }`}
                                  >
                                    {isReported ? "Reported" : "Report Error"}
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </>
    );

    if (isInline) {
      return (
        <div className="bg-background w-full h-full flex flex-col relative overflow-hidden">
          {innerContent}
        </div>
      );
    }

    return (
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex justify-end transition-opacity duration-300">
        <div className="bg-background w-full max-w-lg h-full flex flex-col shadow-2xl relative animate-slide-in-right">
          {innerContent}
        </div>
      </div>
    );
  }
