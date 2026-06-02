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

          {/* Savings Estimate Box */}
          <div className="col-span-1 md:col-span-4 bg-[#f0fdf4] border-2 border-black p-5 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] flex flex-col justify-between min-h-[140px]">
            <div>
              <h2 className="text-xs font-black uppercase text-[#166534] tracking-wider mb-1">Savings Estimate</h2>
              <span className="text-4xl font-black text-[#15803d]">${savingsEstimate.toFixed(2)}</span>
              <div className="mt-3 h-1 bg-[#166534] w-full opacity-25"></div>
            </div>
            <p className="text-[10px] font-black uppercase text-[#166534]">Favorable sale discounts</p>
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
                      <div className="divide-y divide-gray-100">
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
                      <div className="divide-y divide-gray-150">
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
