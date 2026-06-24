import { useState, useMemo } from "react";
import { useOfflineStore } from "@/lib/client/use-offline-store";
import { GroceryItem, PriceEntry } from "@/lib/types";
import { ChevronDown, ChevronUp, Trash2, Plus, Minus, ListPlus, ExternalLink, RefreshCw } from "lucide-react";
import CatalogDrawer from "../../components/CatalogDrawer";
import SyncIndicator from "../../components/SyncIndicator";

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

export default function ListsTab() {
  const store = useOfflineStore();
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [isCatalogOpen, setIsCatalogOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"byStore" | "all">("byStore");

  // Build name ➔ price lookup from scraped data (match on config_name and item_name)
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

          let bestStoreId = "";
          let bestPriceVal = Infinity;
          for (const [sId, sInfo] of Object.entries(mergedStores) as [string, any]) {
            const pVal = getStoreActivePrice(sInfo);
            if (pVal !== null && pVal < bestPriceVal) {
              bestPriceVal = pVal;
              bestStoreId = sId;
            }
          }

          const bestStoreInfo = mergedStores[bestStoreId] || {
            store_name: "Food Basics",
            postal_code: "",
            store_id: "foodbasics",
            regular_price: null,
            sale_price: null,
            is_on_sale: 0,
            lookup_url: "",
            valid_until: "",
          };

          map.set(nameKey, {
            ...existing,
            ...bestStoreInfo,
            stores: mergedStores,
          });
        } else {
          const initialStores: Record<string, any> = {};
          if (entry.stores && typeof entry.stores === "object") {
            for (const [sId, sInfo] of Object.entries(entry.stores)) {
              const normId = normalizeStoreKey(sId);
              initialStores[normId] = {
                ...sInfo,
                store_id: normId,
              };
            }
          } else {
            const entryStoreId = entry.store_id || "foodbasics";
            const normStoreId = normalizeStoreKey(entryStoreId);
            initialStores[normStoreId] = {
              store_name: entry.store_name || "Food Basics",
              postal_code: entry.postal_code || "",
              store_id: normStoreId,
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

  const shoppingListNames = useMemo(
    () => new Set(store.groceryItems.map((i) => i.name.toLowerCase())),
    [store.groceryItems]
  );

  // Group items by the store where they are cheapest
  const groupedByStore = useMemo(() => {
    const storeMap: Record<string, { name: string; items: GroceryItem[] }> = {
      foodbasics: { name: "Food Basics", items: [] },
      metro: { name: "Metro", items: [] },
      unassigned: { name: "Custom / Other Stores", items: [] }
    };

    for (const item of store.groceryItems) {
      const priceInfo = priceLookup.get(item.name.toLowerCase());
      if (priceInfo) {
        let bestStoreId = "";
        let bestPriceVal = Infinity;
        
        if (priceInfo.stores && typeof priceInfo.stores === "object") {
          for (const [sId, sInfo] of Object.entries(priceInfo.stores) as [string, any][]) {
            const val = getStoreActivePrice(sInfo);
            if (val !== null && val < bestPriceVal) {
              bestPriceVal = val;
              bestStoreId = sId;
            }
          }
        } else {
          const val = getStoreActivePrice(priceInfo);
          if (val !== null) {
            bestPriceVal = val;
            bestStoreId = priceInfo.store_id || "foodbasics";
          }
        }
        
        const normStoreId = bestStoreId ? normalizeStoreKey(bestStoreId) : "unassigned";
        if (storeMap[normStoreId]) {
          storeMap[normStoreId].items.push(item);
        } else {
          const prettyName = priceInfo.stores?.[bestStoreId]?.store_name || bestStoreId;
          storeMap[normStoreId] = { name: prettyName, items: [item] };
        }
      } else {
        storeMap.unassigned.items.push(item);
      }
    }

    return Object.entries(storeMap)
      .filter(([_, data]) => data.items.length > 0)
      .map(([id, data]) => ({ id, ...data }));
  }, [store.groceryItems, priceLookup]);

  // Group all items by category (for All Items view)
  const groupedByCategory = useMemo(() => {
    const categoriesMap: Record<string, GroceryItem[]> = {};
    for (const item of store.groceryItems) {
      const cat = item.category || "Other";
      if (!categoriesMap[cat]) categoriesMap[cat] = [];
      categoriesMap[cat].push(item);
    }
    return Object.entries(categoriesMap)
      .map(([name, items]) => ({ id: name.toLowerCase(), name, items }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [store.groceryItems]);

  const activeGroups = viewMode === "byStore" ? groupedByStore : groupedByCategory;

  const totalItems = store.groceryItems.length;
  const storeCount = groupedByStore.filter(g => g.id !== "unassigned").length;

  const toggleExpand = (itemId: string) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  };

  const handleAddFromCatalog = async (catalogItem: any) => {
    // Adds a catalog regular item to the grocery list
    await store.addSelectedToGroceryList([catalogItem]);
  };

  const handleRemoveFromCatalog = async (name: string) => {
    // Removes by name
    await store.removeGroceryItemByName(name);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* List Header */}
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-xl font-extrabold text-on-surface">Weekly Grocery List</h2>
          <p className="text-xs text-on-surface-variant mt-0.5 font-medium">
            {totalItems === 0
              ? "List is empty"
              : `${totalItems} item${totalItems !== 1 ? "s" : ""} across ${storeCount} store${storeCount !== 1 ? "s" : ""}`}
          </p>
        </div>

        {store.hasPendingChanges && (
          <button
            onClick={store.saveChanges}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-black text-xs font-bold rounded-lg border border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-px hover:translate-y-px transition-all"
            title="Save pending changes to database"
          >
            <RefreshCw size={14} className="animate-spin" />
            <span>Save Changes</span>
          </button>
        )}
      </div>

      {/* Sync Indicator at Top of Page */}
      <div className="bg-surface p-3 rounded-lg border border-outline/10 shadow-xs">
        <SyncIndicator
          status={store.syncStatus}
          isOnline={store.isOnline}
          lastSynced={store.lastSynced}
          hasPendingChanges={store.hasPendingChanges}
          lastSavedBy={store.lastSavedBy}
          onSave={store.saveChanges}
          onRefresh={store.refreshFromServer}
        />
      </div>

      {/* Control Actions Row (Clear and edit buttons) */}
      {totalItems > 0 && (
        <div className="flex gap-2 justify-end">
          <button
            onClick={store.clearCheckedGroceryItems}
            className="text-[10px] font-bold uppercase tracking-wide bg-surface hover:bg-surface-container-low text-on-surface border border-outline/20 px-3 py-1.5 rounded-md transition-all shadow-xs"
          >
            Clear Checked
          </button>
          <button
            onClick={store.clearAllGroceryItems}
            className="text-[10px] font-bold uppercase tracking-wide bg-red-50 hover:bg-red-100 text-red-700 border border-red-200/50 px-3 py-1.5 rounded-md transition-all shadow-xs"
          >
            Clear List
          </button>
        </div>
      )}

      {/* View Mode Toggle Segmented Control */}
      {totalItems > 0 && (
        <div className="flex bg-surface-container-low p-1 rounded-xl w-full max-w-xs mx-auto border border-outline/5">
          <button
            onClick={() => setViewMode("byStore")}
            className={`flex-1 py-1.5 px-4 rounded-lg font-bold text-xs transition-all cursor-pointer ${
              viewMode === "byStore"
                ? "bg-primary text-on-primary shadow-xs"
                : "text-on-surface-variant hover:bg-surface-container-high"
            }`}
          >
            By Store
          </button>
          <button
            onClick={() => setViewMode("all")}
            className={`flex-1 py-1.5 px-4 rounded-lg font-bold text-xs transition-all cursor-pointer ${
              viewMode === "all"
                ? "bg-primary text-on-primary shadow-xs"
                : "text-on-surface-variant hover:bg-surface-container-high"
            }`}
          >
            All Items
          </button>
        </div>
      )}

      {/* Dynamic Store / Category Groups */}
      {totalItems > 0 ? (
        <div className="space-y-6">
          {activeGroups.map((group) => (
            <section key={group.id} className="space-y-3">
              {/* Store Title Bar */}
              <div className="flex items-center justify-between pb-1 border-b border-outline/10">
                <h3 className="text-sm font-extrabold text-secondary flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-secondary"></span>
                  {group.name}
                </h3>
                <span className="text-[10px] font-bold bg-secondary-container/20 text-secondary px-2.5 py-0.5 rounded-full">
                  {group.items.length} Item{group.items.length !== 1 ? "s" : ""}
                </span>
              </div>

              {/* Items in store */}
              <div className="space-y-2">
                {group.items.map((item) => {
                  const isExpanded = expandedItems.has(item.id);
                  const priceInfo = priceLookup.get(item.name.toLowerCase());
                  
                  // Compute cheapest price display
                  let cheapestPriceVal: number | null = null;
                  let matchedStoreName = "";
                  if (priceInfo) {
                    let minP = Infinity;
                    if (priceInfo.stores && typeof priceInfo.stores === "object") {
                      for (const [sId, sInfo] of Object.entries(priceInfo.stores) as [string, any][]) {
                        const val = getStoreActivePrice(sInfo);
                        if (val !== null && val < minP) {
                          minP = val;
                          matchedStoreName = sInfo.store_name || sId;
                        }
                      }
                    } else {
                      const val = getStoreActivePrice(priceInfo);
                      if (val !== null) {
                        minP = val;
                        matchedStoreName = priceInfo.store_name || "Food Basics";
                      }
                    }
                    if (minP !== Infinity) {
                      cheapestPriceVal = minP;
                    }
                  }

                  return (
                    <div
                      key={item.id}
                      className={`bg-surface border border-outline-variant rounded-lg overflow-hidden transition-all duration-200 ${
                        item.checked ? "opacity-60" : ""
                      }`}
                    >
                      {/* Interactive Header Row */}
                      <div
                        onClick={cheapestPriceVal !== null ? () => toggleExpand(item.id) : undefined}
                        className={`flex items-center justify-between p-3.5 select-none ${
                          cheapestPriceVal !== null ? "cursor-pointer hover:bg-surface-container-low" : ""
                        }`}
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          {/* Checked checkbox */}
                          <input
                            type="checkbox"
                            checked={item.checked}
                            onChange={() => store.toggleGroceryItem(item.id)}
                            onClick={(e) => e.stopPropagation()}
                            className="w-5 h-5 rounded-md border-2 border-outline-variant text-primary focus:ring-primary transition-all custom-checkbox cursor-pointer shrink-0"
                          />

                          {/* Item text / description */}
                          <div className="flex-1 min-w-0">
                            <p
                              className={`text-sm font-bold text-on-surface truncate transition-all ${
                                item.checked ? "line-through text-on-surface-variant/70" : ""
                              }`}
                            >
                              {item.name}
                            </p>
                            <span className="text-[10px] font-medium text-on-surface-variant uppercase tracking-wider block mt-0.5">
                              {item.category || "Other"}
                            </span>
                          </div>
                        </div>

                        {/* Quantity Selector - Compact Horizontal Layout */}
                        {!item.checked ? (
                          <div
                            className="flex items-center border border-outline-variant bg-surface rounded-md overflow-hidden shrink-0 mr-2 ml-1"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                if (item.quantity <= 1) {
                                  store.removeGroceryItem(item.id);
                                } else {
                                  store.updateGroceryItemQuantity(item.id, item.quantity - 1);
                                }
                              }}
                              className="px-2 py-1.5 hover:bg-surface-container-low text-primary font-extrabold border-r border-outline-variant transition-colors"
                              title="Decrease Quantity"
                            >
                              <Minus size={12} />
                            </button>
                            <span className="w-7 text-center text-xs font-bold font-tnum select-none">
                              {item.quantity}
                            </span>
                            <button
                              type="button"
                              onClick={() => store.updateGroceryItemQuantity(item.id, item.quantity + 1)}
                              className="px-2 py-1.5 hover:bg-surface-container-low text-primary font-extrabold border-l border-outline-variant transition-colors"
                              title="Increase Quantity"
                            >
                              <Plus size={12} />
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs font-extrabold bg-surface-container-low text-on-surface-variant px-2 py-0.5 rounded-md mr-1 ml-1 font-tnum shrink-0">
                            {item.quantity}x
                          </span>
                        )}

                        {/* Price & Expand button */}
                        <div className="flex items-center gap-3 shrink-0 font-tnum ml-2">
                          {cheapestPriceVal !== null && (
                            <div className="text-right flex flex-col items-end">
                              <span className="text-sm font-extrabold text-primary">
                                ${(cheapestPriceVal * item.quantity).toFixed(2)}
                              </span>
                              
                              {item.quantity > 1 && (
                                <span className="text-[9px] text-on-surface-variant font-medium">
                                  {item.quantity} × ${cheapestPriceVal.toFixed(2)}
                                </span>
                              )}
                            </div>
                          )}
                          
                          {cheapestPriceVal !== null && (
                            isExpanded ? (
                              <ChevronUp size={16} className="text-on-surface-variant" />
                            ) : (
                              <ChevronDown size={16} className="text-on-surface-variant" />
                            )
                          )}
                        </div>
                      </div>

                      {/* Expandable Accordion Panel */}
                      {isExpanded && cheapestPriceVal !== null && (
                        <div className="px-3.5 pb-3.5 pt-0 border-t border-outline/5 bg-surface-container-lowest animate-fade-in">
                          <div className="mt-3 bg-surface-container-low border border-primary/20 p-3.5 rounded-lg space-y-3">
                            <div className="flex justify-between items-start">
                              <div>
                                <h4 className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">
                                  Verification Detail
                                </h4>
                                <p className="text-xs font-bold text-on-surface mt-0.5">{item.name}</p>
                              </div>
                              <span className="text-[10px] font-black uppercase bg-primary/10 text-primary px-2 py-0.5 rounded-sm">
                                cheapest store
                              </span>
                            </div>

                            {/* Store price list details */}
                            <div className="space-y-1.5">
                              {priceInfo && priceInfo.stores ? (
                                (Object.entries(priceInfo.stores) as [string, any][]).map(([storeId, storeInfo]) => {
                                  const activePrice = getStoreActivePrice(storeInfo);
                                  const isCheapest = activePrice === cheapestPriceVal;
                                  return (
                                    <div key={storeId} className="flex justify-between items-center text-xs">
                                      <span className="text-on-surface-variant font-medium">
                                        {storeInfo.store_name}
                                      </span>
                                      <div className="flex items-center gap-2">
                                        {storeInfo.is_on_sale === 1 && (
                                          <span className="bg-red-50 text-red-700 text-[9px] px-1 py-0.5 font-bold rounded-sm">
                                            SALE
                                          </span>
                                        )}
                                        <span className={`font-bold ${isCheapest ? "text-primary font-black" : "text-on-surface"}`}>
                                          {activePrice !== null ? `$${activePrice.toFixed(2)}` : "—"}
                                        </span>
                                      </div>
                                    </div>
                                  );
                                })
                              ) : (
                                <div className="text-xs text-on-surface-variant/70 italic">
                                  No stores comparison available.
                                </div>
                              )}
                            </div>

                            {/* Action Buttons Row */}
                            <div className="flex justify-end items-center pt-2 border-t border-outline/5 gap-2 text-xs">
                              {priceInfo?.lookup_url && (
                                <a
                                  href={priceInfo.lookup_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="flex items-center gap-1.5 px-3 py-1.5 bg-surface hover:bg-surface-container-low border border-outline-variant text-on-surface-variant hover:text-on-surface rounded-md transition-colors font-bold text-xs"
                                  title="View store website"
                                >
                                  <ExternalLink size={12} />
                                  <span>View Store</span>
                                </a>
                              )}

                              <button
                                onClick={() => store.removeGroceryItem(item.id)}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 hover:bg-red-155 border border-red-100 text-red-650 hover:text-red-750 rounded-md transition-colors font-bold text-xs"
                                title="Delete item"
                              >
                                <Trash2 size={12} />
                                <span>Delete</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      ) : (
        /* Empty State */
        <div className="border-2 border-dashed border-outline-variant bg-surface rounded-xl flex flex-col items-center justify-center py-16 px-4 text-center mt-3">
          <span className="text-4xl mb-3">🛍</span>
          <h3 className="text-sm font-extrabold uppercase text-on-surface">Your Shopping List is Empty</h3>
          <p className="text-xs text-on-surface-variant max-w-xs mx-auto mt-1 leading-relaxed">
            Tap the floating action button in the bottom right corner to browse items from the catalog.
          </p>
        </div>
      )}

      {/* Floating Action Button (FAB) to open catalog */}
      <button
        onClick={() => setIsCatalogOpen(true)}
        className="fixed bottom-24 right-6 w-14 h-14 bg-primary text-on-primary rounded-2xl shadow-lg flex items-center justify-center hover:scale-105 active:scale-95 transition-transform z-40 cursor-pointer"
        title="Browse Grocery Catalog"
      >
        <ListPlus size={26} className="stroke-[2.5px]" />
      </button>

      {/* Catalog Drawer Modal */}
      <CatalogDrawer
        isOpen={isCatalogOpen}
        onClose={() => setIsCatalogOpen(false)}
        regularItems={store.regularItems}
        alreadyInList={shoppingListNames}
        priceLookup={priceLookup}
        onAdd={handleAddFromCatalog}
        onRemove={handleRemoveFromCatalog}
      />
    </div>
  );
}
