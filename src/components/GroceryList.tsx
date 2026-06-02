import { useMemo, useState } from "react";
import { useOfflineStore } from "@/lib/client/use-offline-store";
import { GroceryItem, PriceEntry } from "@/lib/types";
import AddItemForm from "./AddItemForm";
import GroceryItemRow from "./GroceryItemRow";
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
  const priceLookup = useMemo(() => {
    const map = new Map<string, PriceEntry>();
    for (const entry of Object.values(store.prices)) {
      if (entry.config_name) map.set(entry.config_name.toLowerCase(), entry);
      map.set(entry.item_name.toLowerCase(), entry);
    }
    return map;
  }, [store.prices]);

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

  const budgetEstimate = useMemo(() => {
    let sum = 0;
    for (const item of store.groceryItems) {
      const price = priceLookup.get(item.name.toLowerCase());
      if (price) {
        const activePrice = price.is_on_sale && price.sale_price !== null ? price.sale_price : price.regular_price;
        if (activePrice) {
          sum += activePrice * (item.quantity || 1);
        }
      }
    }
    return sum;
  }, [store.groceryItems, priceLookup]);

  return (
    <PullToRefresh onRefresh={store.refreshFromServer} enabled={!store.hasPendingChanges && store.isOnline}>
      <div className="space-y-8 animate-fade-in">
        
        {/* Bento Grid Stats Row */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
          {/* Progress Box */}
          <div className="col-span-1 md:col-span-5 bg-[#059669] text-white border-2 border-black p-5 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] flex flex-col justify-between min-h-[140px]">
            <div>
              <h2 className="text-2xl font-black leading-none uppercase tracking-tight">
                Shopping<br />Progress
              </h2>
              <div className="w-full bg-[#064e3b] h-8 border-2 border-black relative overflow-hidden mt-3">
                <div
                  className="h-full bg-white transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                ></div>
                <div className="absolute inset-0 flex items-center justify-center font-black text-[10px] mix-blend-difference text-white uppercase tracking-wider">
                  {progressPercent}% COMPLETED
                </div>
              </div>
            </div>
            <p className="text-xs font-bold opacity-90 uppercase tracking-wider">
              {checkedItems.length} of {store.groceryItems.length} items checked off
            </p>
          </div>

          {/* Budget / Estimates Box */}
          <div className="col-span-1 md:col-span-4 bg-[#fee2e2] border-2 border-black p-5 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] flex flex-col justify-between min-h-[140px]">
            <div>
              <h2 className="text-xs font-black uppercase text-[#991b1b] tracking-wider mb-1">Budget Estimate</h2>
              <span className="text-4xl font-black text-[#991b1b]">${budgetEstimate.toFixed(2)}</span>
              <div className="mt-3 h-1 bg-[#991b1b] w-full opacity-20"></div>
            </div>
            <p className="text-[10px] font-black uppercase text-[#991b1b]">From list prices</p>
          </div>

          {/* Sync status & online Box */}
          <div className="col-span-1 md:col-span-3 bg-white border-2 border-black p-5 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] flex flex-col justify-between min-h-[140px]">
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
          <section className="lg:col-span-7 bg-white border-2 border-black p-6 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-6 pb-3 border-b-2 border-black">
              <h2 className="text-xl font-black uppercase tracking-tight flex items-center gap-2 text-black">
                <span>📋</span>
                <span>Item Catalog</span>
              </h2>
              {shoppingListNames.size > 0 && (
                <>
                  {confirmUncheckAll ? (
                    <div className="flex items-center gap-2 bg-red-50 border-2 border-[#991b1b] p-2 text-black">
                      <span className="text-[10px] font-black text-[#991b1b] uppercase tracking-wide">Confirm clear?</span>
                      <button
                        onClick={handleUncheckAll}
                        className="text-[9px] px-2 py-0.5 bg-red-600 text-white font-black uppercase border border-black hover:bg-rose-700 transition-colors"
                      >
                        Yes
                      </button>
                      <button
                        onClick={() => setConfirmUncheckAll(false)}
                        className="text-[9px] px-2 py-0.5 bg-white text-black font-black uppercase border border-black hover:bg-gray-100 transition-colors"
                      >
                        No
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={handleUncheckAll}
                      className="text-xs font-black uppercase tracking-wide bg-white hover:bg-rose-50 text-red-600 px-3 py-1.5 border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all"
                    >
                      Clear Catalog
                    </button>
                  )}
                </>
              )}
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
            />
          </section>

          {/* Shopping List — sticky with bordered frame */}
          <section className="lg:col-span-5 lg:sticky lg:top-4 bg-white border-2 border-black p-6 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
            <div className="flex flex-col">
              <div className="flex items-center justify-between mb-4 pb-3 border-b-2 border-black">
                <h2 className="text-xl font-black uppercase tracking-tight flex items-center gap-2 text-black">
                  <span>🛒</span>
                  <span>Active List</span>
                </h2>
                {store.groceryItems.length > 0 && (
                  <span className="bg-black text-white text-xs font-black uppercase tracking-wider px-2 py-1">
                    {uncheckedItems.length} Remaining
                  </span>
                )}
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
                <div className="max-h-[450px] overflow-y-auto border-2 border-black bg-white p-3 shadow-inner space-y-4">
                  {uncheckedByCategory.map(([category, categoryItems]) => (
                    <div key={category} className="mb-2 last:mb-0">
                      <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest pb-1 border-b border-gray-200">
                        {category}
                      </h4>
                      <div className="divide-y divide-gray-100">
                        {categoryItems.map((item) => (
                          <GroceryItemRow
                            key={item.id}
                            item={item}
                            onToggle={store.toggleGroceryItem}
                            onRemove={store.removeGroceryItem}
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
                      <div className="divide-y divide-gray-150">
                        {checkedItems.map((item) => (
                          <GroceryItemRow
                            key={item.id}
                            item={item}
                            onToggle={store.toggleGroceryItem}
                            onRemove={store.removeGroceryItem}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="border-2 border-dashed border-black bg-[#f9fafb] flex items-center justify-center py-12 px-4 text-center mt-3">
                  <div>
                    <div className="text-4xl mb-3">🛍</div>
                    <h3 className="text-base font-black uppercase tracking-tight text-black mb-1">Active list is empty</h3>
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
