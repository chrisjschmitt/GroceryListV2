import { useMemo, useState } from "react";
import { useOfflineStore } from "@/lib/client/use-offline-store";
import { GroceryItem, PriceEntry } from "@/lib/types";
import AddItemForm from "./AddItemForm";
import GroceryItemRow, { abbreviateStoreName } from "./GroceryItemRow";
import RegularItemsList from "./RegularItemsList";
import SyncIndicator from "./SyncIndicator";
import PullToRefresh from "./PullToRefresh";

function groupByCategory(items: GroceryItem[]): [string, GroceryItem[]][] {
  const groups: Record<string, GroceryItem[]> = {};
  for (const item of items) {
    const cat = item.category || "Other";
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(item);
  }
  return Object.entries(groups)
    .map(([cat, items]) => [cat, items.sort((a, b) => a.name.localeCompare(b.name))] as [string, GroceryItem[]])
    .sort(([a], [b]) => a.localeCompare(b));
}

export default function GroceryList() {
  const store = useOfflineStore();
  const [confirmUncheckAll, setConfirmUncheckAll] = useState(false);

  const shoppingListNames = useMemo(
    () => new Set(store.groceryItems.map((i) => i.name.toLowerCase())),
    [store.groceryItems]
  );

  // Build name ➔ price lookup from scraped data (match on config_name and item_name)
  // If there are multiple entries matching the same name (e.g. from different stores/UPCs),
  // we merge their store prices into a single synthesized PriceEntry to let the UI compare them properly!
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
          // Merge stores
          const mergedStores = { ...(existing.stores || {}) };
          
          // Seed the existing entry's flat price as its own store if not already inside nested stores
          const existingStoreId = existing.store_id || "foodbasics";
          if (!mergedStores[existingStoreId]) {
            mergedStores[existingStoreId] = {
              store_name: existing.store_name || "Food Basics",
              postal_code: existing.postal_code || "",
              store_id: existingStoreId,
              regular_price: existing.regular_price,
              sale_price: existing.sale_price,
              is_on_sale: existing.is_on_sale,
              lookup_url: existing.lookup_url,
              valid_until: existing.valid_until,
            };
          }

          // Seed the new entry's stores or its flat representation
          if (entry.stores && typeof entry.stores === "object") {
            for (const [sId, sInfo] of Object.entries(entry.stores)) {
              const currentStorePrice = (sInfo.is_on_sale && sInfo.sale_price !== null) ? sInfo.sale_price : (sInfo.regular_price || 0);
              const existingStorePriceInfo = mergedStores[sId];
              const existingStorePrice = existingStorePriceInfo
                ? ((existingStorePriceInfo.is_on_sale && existingStorePriceInfo.sale_price !== null) ? existingStorePriceInfo.sale_price : (existingStorePriceInfo.regular_price || 0))
                : Infinity;

              if (!existingStorePriceInfo || currentStorePrice < existingStorePrice) {
                mergedStores[sId] = sInfo;
              }
            }
          } else {
            const entryStoreId = entry.store_id || "foodbasics";
            const currentStorePrice = (entry.is_on_sale && entry.sale_price !== null) ? entry.sale_price : (entry.regular_price || 0);
            const existingStorePriceInfo = mergedStores[entryStoreId];
            const existingStorePrice = existingStorePriceInfo
              ? ((existingStorePriceInfo.is_on_sale && existingStorePriceInfo.sale_price !== null) ? existingStorePriceInfo.sale_price : (existingStorePriceInfo.regular_price || 0))
              : Infinity;

            if (!existingStorePriceInfo || currentStorePrice < existingStorePrice) {
              mergedStores[entryStoreId] = {
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
          }

          // Determine the best overall store from updated mergedStores
          let bestStoreId = existingStoreId;
          let bestPriceVal = Infinity;
          for (const [sId, sInfo] of Object.entries(mergedStores) as [string, any]) {
            const pVal = (sInfo.is_on_sale && sInfo.sale_price !== null) ? sInfo.sale_price : (sInfo.regular_price || 0);
            if (pVal < bestPriceVal) {
              bestPriceVal = pVal;
              bestStoreId = sId;
            }
          }

          const bestStoreInfo = mergedStores[bestStoreId];

          map.set(nameKey, {
            ...existing,
            store_name: bestStoreInfo.store_name,
            postal_code: bestStoreInfo.postal_code,
            store_id: bestStoreInfo.store_id,
            regular_price: bestStoreInfo.regular_price,
            sale_price: bestStoreInfo.sale_price,
            is_on_sale: bestStoreInfo.is_on_sale,
            lookup_url: bestStoreInfo.lookup_url,
            valid_until: bestStoreInfo.valid_until,
            stores: mergedStores,
          });
        } else {
          // Create baseline representation
          const baseStores: Record<string, any> = {};
          if (entry.stores && typeof entry.stores === "object") {
            for (const [sId, sInfo] of Object.entries(entry.stores)) {
              baseStores[sId] = sInfo;
            }
          } else {
            const sId = entry.store_id || "foodbasics";
            baseStores[sId] = {
              store_name: entry.store_name || "Food Basics",
              postal_code: entry.postal_code || "",
              store_id: sId,
              regular_price: entry.regular_price,
              sale_price: entry.sale_price,
              is_on_sale: entry.is_on_sale,
              lookup_url: entry.lookup_url,
              valid_until: entry.valid_until,
            };
          }
          map.set(nameKey, {
            ...entry,
            stores: baseStores,
          });
        }
      }
    }
    return map;
  }, [store.prices]);

  const savingsEstimate = useMemo(() => {
    let sum = 0;
    for (const item of store.groceryItems) {
      const price = priceLookup.get(item.name.toLowerCase());
      if (price) {
        const regular = price.regular_price;
        const sale = price.sale_price;
        const isOnSale = price.is_on_sale === 1 || !!price.is_on_sale;
        if (isOnSale && regular !== null && sale !== null && typeof regular === "number" && typeof sale === "number") {
          const itemSavings = regular - sale;
          if (itemSavings > 0) {
            sum += itemSavings * (item.quantity || 1);
          }
        }
      }
    }
    return sum;
  }, [store.groceryItems, priceLookup]);

  const handleAdd = async (name: string, quantity: number, unit: string) => {
    if (shoppingListNames.has(name.toLowerCase())) return;
    await store.addGroceryItem(name, quantity, unit);
  };

  const handleUncheckAll = () => {
    if (!confirmUncheckAll) {
      setConfirmUncheckAll(true);
      return;
    }
    store.clearAllGroceryItems();
    setConfirmUncheckAll(false);
  };

  const uncheckedItems = store.groceryItems.filter((i) => !i.checked);
  const checkedItems = store.groceryItems.filter((i) => i.checked);
  const uncheckedByCategory = groupByCategory(uncheckedItems);

  const progressPercent = store.groceryItems.length > 0
    ? Math.round((checkedItems.length / store.groceryItems.length) * 100)
    : 0;

  const storeMetrics = useMemo(() => {
    const storeMap = new Map<string, { storeName: string; totalCost: number; itemsAvailableCount: number; lowestPriceCount: number; saleSavings: number; totalCheckedCount: number }>();
    
    // Seed standard store entries
    storeMap.set("foodbasics", { storeName: "Food Basics", totalCost: 0, itemsAvailableCount: 0, lowestPriceCount: 0, saleSavings: 0, totalCheckedCount: 0 });
    storeMap.set("metro", { storeName: "Metro", totalCost: 0, itemsAvailableCount: 0, lowestPriceCount: 0, saleSavings: 0, totalCheckedCount: 0 });

    // Populate stores from the global store.prices map
    for (const entry of Object.values(store.prices) as PriceEntry[]) {
      if (entry.stores && typeof entry.stores === "object") {
        for (const [storeId, storeInfo] of Object.entries(entry.stores)) {
          if (!storeMap.has(storeId)) {
            storeMap.set(storeId, {
              storeName: storeInfo.store_name || storeId,
              totalCost: 0,
              itemsAvailableCount: 0,
              lowestPriceCount: 0,
              saleSavings: 0,
              totalCheckedCount: 0
            });
          }
        }
      }
    }

    const itemsInBasket = store.groceryItems;
    for (const item of itemsInBasket) {
      const matchingEntry = priceLookup.get(item.name.toLowerCase());

      if (matchingEntry) {
        const pricesByStore: Record<string, { price: number; onSale: boolean; regular: number }> = {};
        
        if (matchingEntry.stores && typeof matchingEntry.stores === "object") {
          for (const [storeId, storeInfo] of Object.entries(matchingEntry.stores) as [string, any]) {
            const regular = typeof storeInfo.regular_price === "number" ? storeInfo.regular_price : parseFloat(storeInfo.regular_price) || 0;
            const priceVal = (storeInfo.is_on_sale && storeInfo.sale_price !== null && storeInfo.sale_price !== undefined) 
              ? storeInfo.sale_price 
              : regular;
            pricesByStore[storeId] = {
              price: priceVal,
              onSale: storeInfo.is_on_sale === 1 || !!storeInfo.is_on_sale,
              regular: regular,
            };
          }
        } else {
          const regular = typeof matchingEntry.regular_price === "number" ? matchingEntry.regular_price : parseFloat(matchingEntry.regular_price) || 0;
          const priceVal = (matchingEntry.is_on_sale && matchingEntry.sale_price !== null && matchingEntry.sale_price !== undefined)
            ? matchingEntry.sale_price
            : regular;
          pricesByStore[matchingEntry.store_id || "foodbasics"] = {
            price: priceVal,
            onSale: matchingEntry.is_on_sale === 1 || !!matchingEntry.is_on_sale,
            regular: regular,
          };
        }

        for (const [storeId, info] of Object.entries(pricesByStore)) {
          let metric = storeMap.get(storeId);
          if (!metric) {
            metric = {
              storeName: storeId === "foodbasics" ? "Food Basics" : storeId === "metro" ? "Metro" : storeId,
              totalCost: 0,
              itemsAvailableCount: 0,
              lowestPriceCount: 0,
              saleSavings: 0,
              totalCheckedCount: 0
            };
            storeMap.set(storeId, metric);
          }
          metric.itemsAvailableCount += 1;
          metric.totalCost += info.price * item.quantity;
          if (info.onSale && info.regular > info.price) {
            metric.saleSavings += (info.regular - info.price) * item.quantity;
          }
          if (item.checked) {
            metric.totalCheckedCount += 1;
          }
        }

        const storeKeys = Object.keys(pricesByStore);
        if (storeKeys.length > 0) {
          let minP = Infinity;
          for (const key of storeKeys) {
            if (pricesByStore[key].price < minP) {
              minP = pricesByStore[key].price;
            }
          }
          for (const key of storeKeys) {
            if (pricesByStore[key].price === minP) {
              const m = storeMap.get(key);
              if (m) m.lowestPriceCount += 1;
            }
          }
        }
      }
    }

    return Array.from(storeMap.entries()).map(([storeId, m]) => ({
      storeId,
      ...m
    })).filter(m => m.itemsAvailableCount > 0 || m.storeId === "foodbasics" || m.storeId === "metro");
  }, [store.groceryItems, store.prices]);

  return (
    <PullToRefresh onRefresh={store.refreshFromServer} enabled={!store.hasPendingChanges && store.isOnline}>
      <div className="space-y-8 animate-fade-in">
        
        {/* Bento Grid Stats Row with Smart Basket Dashboard */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
          {/* Smart Basket Dashboard Panel */}
          <div className="col-span-1 md:col-span-6 bg-white border-2 border-black p-5 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between border-b-2 border-black pb-2 mb-3">
                <h2 className="text-sm font-black uppercase tracking-wider text-black flex items-center gap-1.5">
                  <span>📊</span>
                  <span>Smart Basket Indices</span>
                </h2>
                <span className="text-[10px] font-black uppercase bg-black text-white px-2 py-0.5">
                  Basket Match
                </span>
              </div>

              {store.groceryItems.length === 0 ? (
                <div className="text-center py-6 text-gray-400 text-xs font-bold uppercase tracking-wider">
                  Add items to your list to view the grocery chain price comparison
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {storeMetrics.map((storeMetric) => {
                    const isBestStore = storeMetrics.length > 1 && 
                      storeMetric.itemsAvailableCount > 0 &&
                      storeMetric.lowestPriceCount === Math.max(...storeMetrics.map(m => m.lowestPriceCount)) &&
                      storeMetric.totalCost === Math.min(...storeMetrics.map(m => m.totalCost > 0 ? m.totalCost : Infinity));

                    return (
                      <div 
                        key={storeMetric.storeId} 
                        className={`border-2 border-black p-3.5 flex flex-col justify-between relative transition-all ${
                          isBestStore 
                            ? "bg-emerald-50/70 border-emerald-600 shadow-[3px_3px_0px_0px_rgba(5,150,105,1)]" 
                            : "bg-gray-50/40 border-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]"
                        }`}
                      >
                        {isBestStore && (
                          <span className="absolute -top-2.5 right-3 bg-emerald-600 text-white text-[8px] font-black uppercase tracking-widest px-2 py-0.5 border border-black shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] z-10">
                            ★ SMART CHOICE
                          </span>
                        )}

                        <div>
                          <div className="flex items-baseline justify-between mb-1.5">
                            <h3 className="text-sm font-black uppercase tracking-tight text-black">
                              {storeMetric.storeName} 
                              <span className="text-gray-450 font-bold ml-1.5 text-xs">({abbreviateStoreName(storeMetric.storeName)})</span>
                            </h3>
                            <span className="text-lg font-black text-black">
                              {storeMetric.totalCost > 0 ? `$${storeMetric.totalCost.toFixed(2)}` : "—"}
                            </span>
                          </div>

                          <div className="grid grid-cols-2 gap-2 text-[11px] font-bold uppercase text-gray-650 mt-2 border-t border-dashed border-gray-200 pt-2">
                            <div>
                              <span className="text-[9px] text-gray-400 block leading-none mb-0.5">Sale Savings</span>
                              <span className="text-xs font-black text-red-650">+${storeMetric.saleSavings.toFixed(2)}</span>
                            </div>
                            <div className="text-right">
                              <span className="text-[9px] text-gray-400 block leading-none mb-0.5">Availability</span>
                              <span className="text-xs font-black text-black">
                                {storeMetric.itemsAvailableCount} / {store.groceryItems.length} items
                              </span>
                            </div>
                          </div>

                          <div className="mt-2 text-[10px] text-gray-500 font-bold uppercase flex items-center justify-between bg-white border border-gray-150 px-2 py-0.5">
                            <span>Lowest Price Matches:</span>
                            <span className="font-black text-emerald-700">{storeMetric.lowestPriceCount} items</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider mt-3 leading-tight">
              * Savings indicate store discounts (regular vs active sale price). Purchases at the store with highest matches and lowest cost optimize savings. No pricing assumptions are made.
            </p>
          </div>

          {/* Savings Estimate Box */}
          <div className="col-span-1 md:col-span-3 bg-[#f0fdf4] border-2 border-black p-5 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] flex flex-col justify-between min-h-[145px]">
            <div>
              <h2 className="text-xs font-black uppercase text-[#166534] tracking-wider mb-1">Savings Estimate</h2>
              <span className="text-4xl font-black text-[#15803d]">${savingsEstimate.toFixed(2)}</span>
              <div className="mt-3 h-1 bg-[#166534] w-full opacity-25"></div>
            </div>
            <p className="text-[10px] font-black uppercase text-[#166534]">Favorable sale discounts</p>
          </div>

          {/* Sync status & online Box */}
          <div className="col-span-1 md:col-span-3 bg-white border-2 border-black p-5 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] flex flex-col justify-between min-h-[145px]">
            <div>
              <span className="text-xs font-extrabold uppercase tracking-widest text-[#6b7280] mb-2 block">System Sync</span>
              <div className="pt-0.5">
                <SyncIndicator
                  status={store.syncStatus}
                  isOnline={store.isOnline}
                  lastSynced={store.lastSynced}
                  hasPendingChanges={store.hasPendingChanges}
                  lastSavedBy={store.lastSavedBy}
                  onSave={store.saveChanges}
                />
              </div>
            </div>
            <div className="text-[10px] font-black uppercase text-gray-500 tracking-wider">
              {store.isOnline ? "● Live Connected" : "○ Local Only"}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Grocery Items checklist */}
          <section className="lg:col-span-7 order-2 lg:order-1 bg-white border-2 border-black p-6 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-6 pb-3 border-b-2 border-black">
              <h2 className="text-xl font-black uppercase tracking-tight flex items-center gap-2 text-black">
                <span>📋</span>
                <span>Item Catalog</span>
              </h2>
            </div>
            <RegularItemsList
              items={store.regularItems}
              onAddToGroceryList={store.addSelectedToGroceryList}
              onRemoveFromGroceryList={store.removeGroceryItemByName}
              onUploadCsv={store.uploadCsv}
              alreadyInList={shoppingListNames}
              onAddItem={store.addRegularItem}
              onEditItem={store.editRegularItem}
              onDeleteItem={store.deleteRegularItem}
              priceLookup={priceLookup}
              allowCrud={false}
              prices={store.prices}
              onPricesUpdated={store.refreshFromServer}
              hasPendingChanges={store.hasPendingChanges}
              onSaveChanges={store.saveChanges}
            />
          </section>

          {/* Shopping List — sticky with bordered frame */}
          <section className="lg:col-span-5 lg:sticky lg:top-4 order-1 lg:order-2 bg-white border-2 border-black p-6 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] md:min-h-[calc(100vh-220px)] flex flex-col">
            <div className="flex flex-col flex-1">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pb-3 border-b-2 border-black">
                <h2 className="text-xl font-black uppercase tracking-tight flex items-center gap-2 text-black">
                  <span>🛒</span>
                  <span>Shopping List</span>
                </h2>
                <div className="flex items-center gap-2">
                  {store.hasPendingChanges ? (
                    <button
                      onClick={store.saveChanges}
                      className="animate-pulse bg-amber-400 hover:bg-amber-500 text-black text-[10px] font-black uppercase px-2 py-1 border-2 border-black shadow-[1.5px_1.5px_0px_0px_rgba(0,0,0,1)]"
                      title="Save pending local changes to the server"
                    >
                      💾 Save changes
                    </button>
                  ) : (
                    <span className="text-[10px] font-bold uppercase bg-emerald-100 text-emerald-850 border border-emerald-300 px-1.5 py-0.5">
                      Saved ✔
                    </span>
                  )}
                  {store.groceryItems.length > 0 && (
                    <span className="bg-black text-white text-xs font-black uppercase tracking-wider px-2 py-1">
                      {uncheckedItems.length} Remaining
                    </span>
                  )}
                </div>
              </div>

              <div className="mb-4">
                <AddItemForm onAdd={handleAdd} />
              </div>

              {store.groceryItems.length > 0 && (
                <div className="flex items-center justify-between mb-3 text-xs">
                  <p className="font-bold text-gray-500 uppercase tracking-wider">
                    {uncheckedItems.length} item{uncheckedItems.length !== 1 ? "s" : ""} remaining
                  </p>
                  <div className="flex gap-2">
                    {checkedItems.length > 0 && (
                      <button
                        onClick={store.clearCheckedGroceryItems}
                        className="text-[10px] font-black uppercase tracking-wide bg-white text-gray-600 hover:text-black border-2 border-black px-2 py-1 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all"
                      >
                        Clear Checked
                      </button>
                    )}
                    <button
                      onClick={store.clearAllGroceryItems}
                      className="text-[10px] font-black uppercase tracking-wide bg-white text-red-600 hover:bg-red-50 border-2 border-black px-2 py-1 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all"
                    >
                      Clear List
                    </button>
                  </div>
                </div>
              )}

              {store.groceryItems.length > 0 ? (
                <div className="flex-1 min-h-[300px] max-h-[500px] overflow-y-auto border-2 border-black bg-white p-3 shadow-inner space-y-4">
                  {uncheckedByCategory.map(([category, categoryItems]) => (
                    <div key={category} className="mb-2 last:mb-0">
                      <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest pb-1 border-b border-gray-200">
                        {category}
                      </h4>
                      <div className="flex flex-col">
                        {categoryItems.map((item) => (
                          <GroceryItemRow
                            key={item.id}
                            item={item}
                            onToggle={store.toggleGroceryItem}
                            onRemove={store.removeGroceryItem}
                            onUpdateQuantity={store.updateGroceryItemQuantity}
                            priceInfo={priceLookup.get(item.name.toLowerCase())}
                          />
                        ))}
                      </div>
                    </div>
                  ))}

                  {checkedItems.length > 0 && (
                    <div className="mt-4 pt-3 border-t-2 border-dashed border-gray-300">
                      <h4 className="text-[10px] font-black text-[#059669] uppercase tracking-widest mb-2">
                        COMPLETED ✔
                      </h4>
                      <div className="flex flex-col">
                        {checkedItems.map((item) => (
                          <GroceryItemRow
                            key={item.id}
                            item={item}
                            onToggle={store.toggleGroceryItem}
                            onRemove={store.removeGroceryItem}
                            onUpdateQuantity={store.updateGroceryItemQuantity}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="border-2 border-dashed border-black bg-[#f9fafb] flex flex-col items-center justify-center py-12 px-4 text-center mt-3 flex-1 min-h-[300px]">
                  <div>
                    <div className="text-4xl mb-3">🛍</div>
                    <h3 className="text-base font-black uppercase tracking-tight text-black mb-1">Shopping list is empty</h3>
                    <p className="text-xs text-gray-500 max-w-xs mx-auto">
                      Add items manually above or tap items from your grocery list on the left to add them here.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </PullToRefresh>
  );
}
