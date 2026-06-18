import React, { useRef, useState, useCallback, useEffect } from "react";
import Link from "@/components/Link";
import { RegularItem, PriceEntry, ScrapeConfig, PriceData } from "@/lib/types";
import { getCategoryOrderIndex } from "@/lib/categories";
import { 
  Search, 
  X, 
  ExternalLink, 
  Save, 
  Link as LinkIcon, 
  DollarSign, 
  Check, 
  Globe, 
  HelpCircle,
  Plus,
  Trash2,
  Clipboard,
  Wrench,
  ChevronDown,
  ChevronUp
} from "lucide-react";

function isSaleExpiredLocal(validUntil?: string | null): boolean {
  if (!validUntil) return false;
  const expiryDate = new Date(validUntil);
  if (isNaN(expiryDate.getTime())) return false;
  
  const now = new Date();
  if (/^\d{4}-\d{2}-\d{2}$/.test(validUntil.trim())) {
    const [y, m, d] = validUntil.trim().split("-").map(Number);
    const targetDate = new Date(y, m - 1, d, 23, 59, 59, 999);
    return now > targetDate;
  }
  return now > expiryDate;
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

interface RegularItemsListProps {
  items: RegularItem[];
  onAddToGroceryList: (items: RegularItem[]) => Promise<void>;
  onRemoveFromGroceryList: (name: string) => Promise<void>;
  onUploadCsv: (file: File) => Promise<{ count: number; errors: string[] }>;
  alreadyInList: Set<string>;
  onAddItem?: (name: string, category: string) => Promise<void>;
  onEditItem?: (id: string, name: string) => Promise<void>;
  onDeleteItem?: (id: string) => Promise<void>;
  priceLookup: Map<string, PriceEntry>;
  allowCrud?: boolean;
  prices?: PriceData;
  onPricesUpdated?: () => Promise<void>;
  onSaveChanges?: () => Promise<void>;
  hasPendingChanges?: boolean;
}

interface EditState {
  type: "add" | "edit";
  category: string;
  itemId?: string;
  value: string;
}

function abbreviateStoreName(name: string): string {
  if (!name) return "";
  const normalized = name.toLowerCase().trim();
  if (normalized.includes("food basics") || normalized === "fb" || normalized === "foodbasics") return "FB";
  if (normalized.includes("metro") || normalized === "mt") return "MT";
  if (normalized.includes("freshmart") || normalized === "fresh mart") return "FM";
  if (normalized.includes("budget") || normalized === "budgetgrocer") return "BG";
  if (normalized.includes("organic") || normalized === "organicplace") return "OP";
  if (normalized.includes("mega") || normalized === "megasave") return "MS";
  const words = name.split(/\s+/);
  if (words.length > 1) {
    return words.map(w => w[0]).join("").toUpperCase().substring(0, 3);
  }
  return name.substring(0, 2).toUpperCase();
}

function checkIfLowestPriceForEntry(price: any, storeId: string): boolean {
  if (!price.stores || typeof price.stores !== "object") return true;

  let lowestPrice = Infinity;
  for (const key of Object.keys(price.stores)) {
    const s = price.stores[key];
    const p = getStoreActivePrice(s);
    if (p !== null && p < lowestPrice) {
      lowestPrice = p;
    }
  }

  const currentStore = price.stores[storeId];
  if (!currentStore) return false;
  const currentPrice = getStoreActivePrice(currentStore);
  if (currentPrice === null) return false;
  return currentPrice <= lowestPrice;
}

function getSearchUrlForStore(storeKey: string, itemName: string): string {
  const encodedName = encodeURIComponent(itemName);
  switch (storeKey) {
    case "foodbasics":
      return `https://www.foodbasics.ca/search?searchItem=${encodedName}`;
    case "metro":
      return `https://www.metro.ca/en/search?filter=${encodedName}`;
    case "loblaws":
      return `https://www.loblaws.ca/search?search-bar=${encodedName}`;
    case "nofrills":
      return `https://www.nofrills.ca/search?search-bar=${encodedName}`;
    case "freshco":
      return `https://freshco.com/search?q=${encodedName}`;
    case "yourindependentgrocer":
      return `https://www.yourindependentgrocer.ca/search?search-bar=${encodedName}`;
    default:
      return `https://www.google.com/search?q=${encodeURIComponent(itemName + " " + storeKey)}`;
  }
}

export default function RegularItemsList({
  items,
  onAddToGroceryList,
  onRemoveFromGroceryList,
  onUploadCsv,
  alreadyInList,
  onAddItem,
  onEditItem,
  onDeleteItem,
  priceLookup,
  allowCrud = false,
  prices,
  onPricesUpdated,
  onSaveChanges,
  hasPendingChanges = false,
}: RegularItemsListProps) {
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [editState, setEditState] = useState<EditState | null>(null);
  const [contextMenu, setContextMenu] = useState<{ id: string; name: string } | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Search query state for general catalog filtering
  const [searchQuery, setSearchQuery] = useState("");




  const handleFile = async (file: File) => {
    if (!file.name.endsWith(".csv")) {
      setUploadMsg("Please upload a .csv file");
      return;
    }
    setUploading(true);
    setUploadMsg(null);
    const { count, errors } = await onUploadCsv(file);
    if (count > 0) {
      setUploadMsg(errors.length > 0 ? `Imported ${count} items (${errors.length} rows skipped)` : null);
    } else {
      setUploadMsg(errors[0] || "Failed to parse CSV");
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleTap = (item: RegularItem) => {
    if (contextMenu || editState) return;
    if (alreadyInList.has(item.name.toLowerCase())) {
      onRemoveFromGroceryList(item.name);
    } else {
      onAddToGroceryList([item]);
    }
  };

  const handleLongPressStart = useCallback((item: RegularItem) => {
    longPressTimer.current = setTimeout(() => {
      setContextMenu({ id: item.id, name: item.name });
    }, 500);
  }, []);

  const handleLongPressEnd = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const handleEdit = (id: string, currentName: string) => {
    const item = items.find((i) => i.id === id);
    if (!item) return;
    setContextMenu(null);
    setEditState({ type: "edit", category: item.category, itemId: id, value: currentName });
    setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 50);
  };

  const handleDelete = async (id: string) => {
    setContextMenu(null);
    if (onDeleteItem) await onDeleteItem(id);
  };

  const handleStartAdd = (category: string) => {
    if (!allowCrud) return;
    setEditState({ type: "add", category, value: "" });
    setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 50);
  };

  const handleEditSubmit = async () => {
    if (!editState || !editState.value.trim()) {
      setEditState(null);
      return;
    }

    if (editState.type === "add" && onAddItem) {
      await onAddItem(editState.value.trim(), editState.category);
    } else if (editState.type === "edit" && editState.itemId && onEditItem) {
      await onEditItem(editState.itemId, editState.value.trim());
    }
    setEditState(null);
  };

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleEditSubmit();
    if (e.key === "Escape") setEditState(null);
  };

  const filteredItems = items.filter((item) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase().trim();
    return (
      item.name.toLowerCase().includes(query) ||
      (item.category && item.category.toLowerCase().includes(query))
    );
  });

  const categories = filteredItems.reduce<Record<string, RegularItem[]>>((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    acc[item.category].sort((a, b) => a.name.localeCompare(b.name));
    return acc;
  }, {});

  if (items.length === 0) {
    return (
      <div className="space-y-4">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const f = e.dataTransfer.files?.[0];
            if (f) handleFile(f);
          }}
          onClick={() => fileInputRef.current?.click()}
          className={`relative cursor-pointer rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
            dragOver ? "border-emerald-400 bg-emerald-50" : "border-gray-200 hover:border-emerald-300 hover:bg-gray-50"
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
            className="hidden"
            aria-label="Upload CSV file"
          />
          <div className="text-3xl mb-2">📄</div>
          <p className="text-sm font-medium text-gray-700">
            {uploading ? "Uploading..." : "Upload your grocery items CSV"}
          </p>
          <p className="text-xs text-gray-400 mt-1">Format: category, item name (one per row)</p>
          {uploading && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/80 rounded-xl">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-600" />
            </div>
          )}
        </div>
        {uploadMsg && <p className="text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded-lg">{uploadMsg}</p>}

        <div className="text-center py-8">
          <div className="text-4xl mb-3">📋</div>
          <h3 className="text-base font-medium text-gray-900 mb-1">No grocery items yet</h3>
          <p className="text-sm text-gray-500 mb-4">Upload a CSV above or use the Admin page</p>
          <Link href="/admin" className="inline-flex items-center gap-1 text-sm font-medium text-emerald-600 hover:text-emerald-700">
            Go to Admin →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {contextMenu && (
        <div className="fixed inset-0 z-10" onClick={() => setContextMenu(null)} />
      )}

      {allowCrud ? (
        <p className="text-xs font-bold uppercase tracking-widest text-[#6b7280]">Tap to add • long press to edit</p>
      ) : (
        <p className="text-sm font-medium text-gray-500">Tap items to add or remove them from your active shopping list below.</p>
      )}

      {/* Modern High-Contrast Neo-Brutalist Search Input */}
      <div className="relative flex items-center bg-white border-2 border-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] text-[#111827] focus-within:shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] focus-within:translate-x-[2px] focus-within:translate-y-[2px] transition-all my-2">
        <div className="pl-3.5 text-black shrink-0 select-none">
          <Search className="w-4 h-4 font-black" />
        </div>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search catalog by item name or category..."
          className="w-full bg-transparent px-3 py-3 text-xs font-black uppercase tracking-wider placeholder:text-gray-400 focus:outline-none placeholder:normal-case font-mono"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            className="pr-3.5 text-black hover:text-red-650 transition-colors font-bold"
            title="Clear search query"
          >
            <X className="w-4 h-4 shrink-0" />
          </button>
        )}
      </div>

      {filteredItems.length === 0 ? (
        <div className="text-center py-12 bg-white border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] p-6 my-4">
          <div className="text-4xl mb-3">🔍</div>
          <h4 className="text-xs font-black uppercase tracking-wider text-black">No matching items found</h4>
          <p className="text-xs text-gray-500 mt-2 max-w-sm mx-auto font-medium">
            We couldn't find items in the catalog that match "{searchQuery}". Try searching for another item or clear your query.
          </p>
          <button
            onClick={() => setSearchQuery("")}
            className="mt-5 text-[10px] font-black uppercase tracking-wider bg-white border-2 border-black px-4 py-2 hover:bg-gray-50 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all text-black"
          >
            Clear Search Filter
          </button>
        </div>
      ) : (
        <div className="space-y-5">
          {Object.entries(categories)
            .sort(([a], [b]) => getCategoryOrderIndex(a) - getCategoryOrderIndex(b))
            .map(([category, categoryItems]) => (
            <div key={category} className="bg-[#f9fafb] border-2 border-black p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
              <div className="flex items-center justify-between mb-3 pb-1 border-b-2 border-dashed border-gray-200">
                <h4 className="text-xs font-black uppercase tracking-wider text-black">{category}</h4>
                <div className="flex items-center gap-1.5">
                  {hasPendingChanges && onSaveChanges ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onSaveChanges();
                      }}
                      className="animate-pulse text-[9px] font-black uppercase tracking-wider bg-amber-400 hover:bg-amber-500 border border-black px-1.5 py-0.5 shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] text-black"
                      title="Save all changes to the server"
                    >
                      💾 Save changes
                    </button>
                  ) : null}

                  {allowCrud && (
                    <button
                      onClick={() => handleStartAdd(category)}
                      className="text-[10px] font-black uppercase tracking-wider bg-white border border-black px-2 py-0.5 hover:bg-emerald-50 transition-colors shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] text-black"
                      title={`Add item to ${category}`}
                    >
                      + Add
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {categoryItems.map((item) => {
                  const inList = alreadyInList.has(item.name.toLowerCase());
                  const isEditing = editState?.type === "edit" && editState.itemId === item.id;

                  if (isEditing) {
                    return (
                      <div key={item.id} className="flex items-center gap-1.5 px-3 py-1.5 border-2 border-black bg-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                        <input
                          ref={inputRef}
                          type="text"
                          value={editState.value}
                          onChange={(e) => setEditState({ ...editState, value: e.target.value })}
                          onKeyDown={handleEditKeyDown}
                          onBlur={handleEditSubmit}
                          className="flex-1 text-sm outline-none bg-transparent font-bold text-black"
                        />
                      </div>
                    );
                  }

                  return (
                    <div key={item.id} className="flex gap-1.5 items-stretch relative">
                      <button
                        onClick={() => handleTap(item)}
                        onMouseDown={allowCrud ? () => handleLongPressStart(item) : undefined}
                        onMouseUp={allowCrud ? handleLongPressEnd : undefined}
                        onMouseLeave={allowCrud ? handleLongPressEnd : undefined}
                        onTouchStart={allowCrud ? () => handleLongPressStart(item) : undefined}
                        onTouchEnd={allowCrud ? handleLongPressEnd : undefined}
                        onContextMenu={allowCrud ? (e) => {
                          e.preventDefault();
                          setContextMenu({ id: item.id, name: item.name });
                        } : undefined}
                        className={`flex-1 flex items-start sm:items-center gap-2 px-2.5 py-1.5 sm:px-3 sm:py-2 border-2 border-black text-left text-sm transition-all ${
                          inList
                            ? "bg-emerald-50 text-emerald-800 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:bg-rose-50 hover:text-rose-600 hover:border-rose-600"
                            : "bg-white text-gray-800 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:-translate-x-[2px] hover:-translate-y-[2px]"
                        }`}
                        title={inList ? "Tap to remove from shopping list" : "Tap to add to shopping list"}
                      >
                        <span
                          className={`flex-shrink-0 w-5 h-5 border-2 border-black flex items-center justify-center mt-0.5 sm:mt-0 transition-all ${
                            inList ? "bg-black text-white" : "bg-white text-black"
                          }`}
                        >
                          {inList && (
                            <div className="w-1.5 h-1.5 bg-white rotate-45"></div>
                          )}
                        </span>
                        
                        <div className="flex-1 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 min-w-0">
                          <span className="font-bold overflow-hidden break-words text-xs sm:text-sm leading-tight pr-1.5">{item.name}</span>
                          {(() => {
                            const price = priceLookup.get(item.name.toLowerCase());
                            if (!price) return null;

                            if (price.stores && typeof price.stores === "object") {
                              const storeEntries = Object.entries(price.stores);
                              if (storeEntries.length > 0) {
                                const validStoreEntries = storeEntries.filter(([_, storeInfo]: [string, any]) => {
                                  return getStoreActivePrice(storeInfo) !== null;
                                });

                                if (validStoreEntries.length === 0) {
                                  return null;
                                }

                                return (
                                  <span className="sm:ml-auto inline-flex flex-wrap gap-1 items-center">
                                    {validStoreEntries.map(([storeId, storeInfo]: [string, any]) => {
                                      const activeP = getStoreActivePrice(storeInfo);
                                      if (activeP === null) return null;
                                      const isLowest = checkIfLowestPriceForEntry(price, storeId);
                                      const storeExpired = storeInfo.is_on_sale && storeInfo.valid_until && isSaleExpiredLocal(storeInfo.valid_until);
                                      const hasActiveSale = storeInfo.is_on_sale === 1;

                                      const hasUrl = !!storeInfo.lookup_url;
                                      let badgeColorClass = "";
                                      let customAppendText = "";

                                      if (hasUrl) {
                                        if (hasActiveSale) {
                                          badgeColorClass = "bg-emerald-600 text-white border-black font-black";
                                          if (storeExpired) {
                                            customAppendText = " EXPIRED";
                                          } else {
                                            customAppendText = " SALE";
                                          }
                                        } else {
                                          badgeColorClass = "bg-yellow-400 text-black border-black font-black";
                                        }
                                      } else {
                                        badgeColorClass = isLowest
                                          ? hasActiveSale 
                                            ? storeExpired
                                              ? "bg-amber-100 text-amber-800 border-yellow-500 animate-pulse"
                                              : "bg-red-100 text-red-700 font-extrabold"
                                            : "bg-emerald-100 text-emerald-800"
                                          : "bg-gray-100 text-gray-500 font-normal";
                                      }

                                      return (
                                        <span
                                          key={storeId}
                                          className={`text-[9px] font-black uppercase border border-black px-1.5 py-0.2 shrink-0 inline-flex items-center gap-0.5 rounded-none ${badgeColorClass}`}
                                          title={`${storeInfo.store_name || storeId}: $${activeP.toFixed(2)}${storeInfo.valid_until ? ` (valid until ${storeInfo.valid_until})` : ""}`}
                                        >
                                          <span>{abbreviateStoreName(storeInfo.store_name || storeId)}:</span>
                                          <span className={(storeExpired && !hasUrl) ? "text-amber-500 font-black animate-pulse" : ""}>$</span>
                                          <span>{activeP.toFixed(2)}</span>
                                          {hasUrl && customAppendText && (
                                            <span className="font-extrabold ml-0.5 text-[7px]" style={{ color: "inherit" }}>
                                              {customAppendText}
                                            </span>
                                          )}
                                          {!hasUrl && hasActiveSale && (
                                            <span className={storeExpired ? "text-amber-600 font-extrabold ml-0.5 text-[7px]" : "text-red-600 font-extrabold ml-0.5 text-[7px]"}>
                                              {storeExpired ? "expired" : "sale"}
                                            </span>
                                          )}
                                        </span>
                                      );
                                    })}
                                  </span>
                                );
                              }
                            }

                            // Single Store Fallback
                            const activePrice = getStoreActivePrice(price);
                            if (activePrice === null) return null;
                            
                            const hasUrl = !!price.lookup_url;
                            const hasRegularPrice = price.regular_price !== null && price.regular_price !== undefined && price.regular_price > 0;
                            const hasSalePrice = price.sale_price !== null && price.sale_price !== undefined && price.sale_price > 0;
                            const hasPricingFields = hasRegularPrice || hasSalePrice;

                            if (hasUrl && !hasPricingFields) {
                              return null;
                            }

                            const fallbackExpired = price.is_on_sale && price.valid_until && isSaleExpiredLocal(price.valid_until);
                            const hasActiveSale = price.is_on_sale === 1;

                            let badgeColorClass = "";
                            let customAppendText = "";

                            if (hasUrl) {
                              if (hasActiveSale) {
                                badgeColorClass = "bg-emerald-600 text-white border-black font-black";
                                if (fallbackExpired) {
                                  customAppendText = " EXPIRED";
                                } else {
                                  customAppendText = " SALE";
                                }
                              } else {
                                badgeColorClass = "bg-yellow-400 text-black border-black font-black";
                              }
                            } else {
                              badgeColorClass = price.is_on_sale 
                                ? fallbackExpired
                                  ? "text-amber-700 bg-amber-50 border-yellow-500 animate-pulse"
                                  : "text-red-700 bg-red-100" 
                                : "text-gray-500 bg-gray-50";
                            }

                            return (
                              <span
                                className={`sm:ml-auto flex-shrink-0 text-[10px] font-black uppercase border border-black px-1.5 py-0.2 shrink-0 inline-flex items-center gap-0.5 ${badgeColorClass}`}
                                title={price.valid_until ? `Valid until ${price.valid_until}` : undefined}
                              >
                                <span>{abbreviateStoreName(price.store_name || "Food Basics")}:</span>
                                <span className={(fallbackExpired && !hasUrl) ? "text-amber-500 font-black animate-pulse" : ""}>$</span>
                                <span>{activePrice?.toFixed(2)}</span>
                                {hasUrl && customAppendText && (
                                  <span className="font-extrabold ml-0.5 text-[7px]" style={{ color: "inherit" }}>
                                    {customAppendText}
                                  </span>
                                )}
                                {!hasUrl && price.is_on_sale === 1 && (
                                  <span className={fallbackExpired ? "ml-0.5 text-[7px] text-amber-600 font-bold" : "ml-0.5 text-[7px] font-bold"}>
                                    {fallbackExpired ? "expired" : "sale"}
                                  </span>
                                )}
                              </span>
                            );
                          })()}
                          {inList && !priceLookup.get(item.name.toLowerCase()) && (
                            <span className="sm:ml-auto text-[10px] font-black uppercase text-emerald-600">✔ in list</span>
                          )}
                        </div>
                      </button>


                      {contextMenu?.id === item.id && (
                        <div className="absolute right-0 top-full mt-1 z-20 bg-white border-2 border-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] py-1 min-w-[120px]">
                          <button
                            onClick={() => handleEdit(item.id, item.name)}
                            className="w-full text-left px-3 py-1.5 text-xs font-bold uppercase tracking-wider hover:bg-gray-50 text-black"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(item.id)}
                            className="w-full text-left px-3 py-1.5 text-xs font-bold uppercase tracking-wider hover:bg-red-50 text-red-600"
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}

                {editState?.type === "add" && editState.category === category && (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 border-2 border-black bg-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                    <input
                      ref={inputRef}
                      type="text"
                      value={editState.value}
                      onChange={(e) => setEditState({ ...editState, value: e.target.value })}
                      onKeyDown={handleEditKeyDown}
                      onBlur={handleEditSubmit}
                      placeholder="New item name"
                      className="flex-1 text-sm outline-none bg-transparent font-bold placeholder-gray-400 text-black"
                    />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
