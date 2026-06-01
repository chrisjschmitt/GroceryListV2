import React, { useRef, useState, useCallback, useEffect } from "react";
import Link from "@/components/Link";
import { RegularItem, PriceEntry, ScrapeConfig } from "@/lib/types";
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
  Clipboard
} from "lucide-react";

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
}

interface EditState {
  type: "add" | "edit";
  category: string;
  itemId?: string;
  value: string;
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
}: RegularItemsListProps) {
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [editState, setEditState] = useState<EditState | null>(null);
  const [contextMenu, setContextMenu] = useState<{ id: string; name: string } | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Price Checker & Lookup states
  const [scrapeConfig, setScrapeConfig] = useState<ScrapeConfig | null>(null);
  const [activePriceCheckItem, setActivePriceCheckItem] = useState<RegularItem | null>(null);
  const [modalUrl, setModalUrl] = useState("");
  const [modalUpc, setModalUpc] = useState("");
  const [modalSuccessMsg, setModalSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    async function loadScrapeConfig() {
      try {
        const res = await fetch("/api/scrape-config");
        if (res.ok) {
          const data = await res.json();
          setScrapeConfig(data);
        }
      } catch (err) {
        console.warn("Failed to load scrape config in RegularItemsList", err);
      }
    }
    loadScrapeConfig();
  }, []);

  const handleOpenPriceCheck = (item: RegularItem) => {
    setActivePriceCheckItem(item);
    setModalSuccessMsg(null);
    if (scrapeConfig?.items) {
      const match = scrapeConfig.items.find(
        (sc: any) => sc.name.toLowerCase() === item.name.toLowerCase()
      );
      if (match?.stores?.foodbasics) {
        setModalUrl(match.stores.foodbasics.url || "");
        setModalUpc(match.stores.foodbasics.upc || "");
        return;
      }
    }
    setModalUrl("");
    setModalUpc("");
  };

  const showModalSuccessMessage = (msg: string) => {
    setModalSuccessMsg(msg);
    setTimeout(() => setModalSuccessMsg(null), 3000);
  };

  const handleUrlChange = (val: string) => {
    let cleanUrl = val.trim();
    if (cleanUrl.includes("foodbasics.ca")) {
      const questionIdx = cleanUrl.indexOf("?");
      if (questionIdx !== -1) {
        cleanUrl = cleanUrl.substring(0, questionIdx);
      }
    }
    setModalUrl(cleanUrl);
  };

  const handlePasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        let cleanUrl = text.trim();
        if (cleanUrl.includes("foodbasics.ca")) {
          const questionIdx = cleanUrl.indexOf("?");
          if (questionIdx !== -1) {
            cleanUrl = cleanUrl.substring(0, questionIdx);
          }
        }
        setModalUrl(cleanUrl);
        showModalSuccessMessage("Successfully pasted and cleaned URL!");
      } else {
        alert("Your clipboard appears to be empty.");
      }
    } catch (err) {
      console.warn("Could not read from clipboard automatically", err);
      alert("Direct clipboard reading is blocked/restricted by your browser. Please manual paste (Ctrl+V) directly into the field!");
    }
  };

  const handleSearchAndCopyName = async () => {
    if (!activePriceCheckItem) return;
    try {
      await navigator.clipboard.writeText(activePriceCheckItem.name);
      showModalSuccessMessage(`"${activePriceCheckItem.name}" copied! Ready to paste into search.`);
    } catch (err) {
      console.warn("Could not write item name to clipboard", err);
    }
  };

  const handleSavePriceCheckUrl = async (url: string, upcOverride: string) => {
    if (!activePriceCheckItem) return;
    const finalItemName = activePriceCheckItem.name;
    const trimmedUrl = url.trim();

    if (!trimmedUrl) {
      alert("Please specify product page URL.");
      return;
    }

    let config = scrapeConfig ? { ...scrapeConfig } : { stores: {}, items: [] };
    if (!config.items) config.items = [];
    if (!config.stores) config.stores = {};

    if (!config.stores.foodbasics) {
      config.stores.foodbasics = {
        enabled: true,
        store_name: "Food Basics",
        base_url: "https://www.foodbasics.ca",
        postal_code: "K7H3C6",
        store_id: "7923194",
      };
    }

    let upc = upcOverride.trim();
    if (!upc) {
      const match = trimmedUrl.match(/\/p\/(\d+)/);
      upc = match ? match[1] : `manual-${Date.now()}`;
    }

    const storeKey = "foodbasics";

    let existingItem = config.items.find(i => i.name.toLowerCase() === finalItemName.toLowerCase());
    if (existingItem) {
      existingItem.stores[storeKey] = {
        url: trimmedUrl,
        upc,
      };
    } else {
      config.items.push({
        name: finalItemName,
        stores: {
          [storeKey]: {
            url: trimmedUrl,
            upc,
          }
        }
      });
    }

    try {
      const res = await fetch("/api/scrape-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (res.ok) {
        setScrapeConfig(config);
        showModalSuccessMessage("Saved scraper link successfully!");
      } else {
        alert("Failed to save scraper config.");
      }
    } catch (err) {
      console.error("Failed to save scrape config", err);
      alert("Failed to save scraper config.");
    }
  };

  const handleDeletePriceCheckUrl = async () => {
    if (!activePriceCheckItem || !scrapeConfig) return;
    const finalItemName = activePriceCheckItem.name;

    if (!confirm(`Are you sure you want to remove the price check link for "${finalItemName}"?`)) {
      return;
    }

    const config = { ...scrapeConfig };
    if (!config.items) config.items = [];

    const itemConfig = config.items.find(i => i.name.toLowerCase() === finalItemName.toLowerCase());
    if (itemConfig) {
      delete itemConfig.stores.foodbasics;
      if (Object.keys(itemConfig.stores).length === 0) {
        config.items = config.items.filter(i => i.name.toLowerCase() !== finalItemName.toLowerCase());
      }
    }

    try {
      const res = await fetch("/api/scrape-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (res.ok) {
        setScrapeConfig(config);
        showModalSuccessMessage("Price check link removed!");
        setModalUrl("");
        setModalUpc("");
      } else {
        alert("Failed to remove link config on the server.");
      }
    } catch (err) {
      console.error("Failed to remove link config", err);
      alert("Failed to remove link config.");
    }
  };

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

  const categories = items.reduce<Record<string, RegularItem[]>>((acc, item) => {
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

      <div className="space-y-5">
        {Object.entries(categories)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([category, categoryItems]) => (
            <div key={category} className="bg-[#f9fafb] border-2 border-black p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
              <div className="flex items-center justify-between mb-3 pb-1 border-b-2 border-dashed border-gray-200">
                <h4 className="text-xs font-black uppercase tracking-wider text-black">{category}</h4>
                {allowCrud && (
                  <button
                    onClick={() => handleStartAdd(category)}
                    className="text-[10px] font-black uppercase tracking-wider bg-white border border-black px-2 py-0.5 hover:bg-emerald-50 transition-colors shadow-[1px_1px_0px_0px_rgba(0,0,0,1)]"
                    title={`Add item to ${category}`}
                  >
                    + Add
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {categoryItems.map((item) => {
                  const inList = alreadyInList.has(item.name.toLowerCase());
                  const isEditing = editState?.type === "edit" && editState.itemId === item.id;
                  const hasPriceLink = !!(scrapeConfig?.items?.some(
                    (sc: any) => sc.name.toLowerCase() === item.name.toLowerCase() && sc.stores?.foodbasics?.url
                  ));

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
                        className={`flex-1 flex items-center gap-2.5 px-3 py-2 border-2 border-black text-left text-sm transition-all ${
                          inList
                            ? "bg-emerald-50 text-emerald-800 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:bg-rose-50 hover:text-rose-600 hover:border-rose-600"
                            : "bg-white text-gray-800 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:-translate-x-[2px] hover:-translate-y-[2px]"
                        }`}
                        title={inList ? "Tap to remove from shopping list" : "Tap to add to shopping list"}
                      >
                        <span
                          className={`flex-shrink-0 w-5 h-5 border-2 border-black flex items-center justify-center transition-all ${
                            inList ? "bg-black text-white" : "bg-white text-black"
                          }`}
                        >
                          {inList && (
                            <div className="w-1.5 h-1.5 bg-white rotate-45"></div>
                          )}
                        </span>
                        <span className="truncate font-bold">{item.name}</span>
                        {(() => {
                          const price = priceLookup.get(item.name.toLowerCase());
                          if (!price) return null;
                          const activePrice = price.is_on_sale && price.sale_price !== null ? price.sale_price : price.regular_price;
                          return (
                            <span
                              className={`ml-auto flex-shrink-0 text-[11px] font-black uppercase ${
                                price.is_on_sale ? "text-red-600 bg-red-100 border border-black px-1" : "text-gray-500"
                              }`}
                            >
                              ${activePrice?.toFixed(2)}
                              {price.is_on_sale === 1 && (
                                <span className="ml-0.5 text-[8px] font-bold">sale</span>
                              )}
                            </span>
                          );
                        })()}
                        {inList && !priceLookup.get(item.name.toLowerCase()) && (
                          <span className="ml-auto text-[10px] font-black uppercase text-emerald-600">✔ in list</span>
                        )}
                      </button>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenPriceCheck(item);
                        }}
                        className={`flex-shrink-0 w-10 border-2 border-black flex items-center justify-center transition-all ${
                          hasPriceLink
                            ? "bg-emerald-500 text-white hover:bg-emerald-600 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px]"
                            : "bg-white text-gray-400 hover:text-black hover:bg-emerald-50 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px]"
                        }`}
                        title={hasPriceLink ? `Edit price check for "${item.name}" (active link)` : `Configure/lookup price check for "${item.name}"`}
                      >
                        <DollarSign className="w-4 h-4" />
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

      {/* Price Check Setup & Lookup Dialog Modal */}
      {activePriceCheckItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
          <div 
            className="bg-white border-4 border-black p-6 w-full max-w-lg shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] md:p-8 relative text-[#111827]"
            role="dialog"
            aria-modal="true"
          >
            {/* Modal Close Button */}
            <button
              onClick={() => setActivePriceCheckItem(null)}
              className="absolute right-4 top-4 bg-white hover:bg-gray-100 border-2 border-black p-1 hover:translate-x-[1px] hover:translate-y-[1px] shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none transition-all"
              aria-label="Close dialog"
            >
              <X className="w-4 h-4 text-black" />
            </button>

            {/* Modal Header */}
            <div className="mb-6 flex items-start gap-3">
              <div className="bg-emerald-100 border-2 border-black p-2 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] flex-shrink-0">
                <DollarSign className="w-5 h-5 text-emerald-800" />
              </div>
              <div>
                <span className="text-[10px] font-black uppercase text-emerald-700 tracking-wider block mb-0.5">Price Checking Assistant</span>
                <h3 className="text-2xl font-black uppercase tracking-tight leading-none text-black break-all">
                  {activePriceCheckItem.name}
                </h3>
              </div>
            </div>

            {/* Modal Inner Alert Toast */}
            {modalSuccessMsg && (
              <div className="mb-4 bg-black text-emerald-400 border-2 border-emerald-400 p-2.5 shadow-[3px_3px_0px_0px_rgba(5,150,105,0.3)] flex items-center gap-2 text-xs font-extrabold animate-bounce">
                <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <span>{modalSuccessMsg}</span>
              </div>
            )}

            <div className="space-y-4">
              {/* 1. Store Selector */}
              <div>
                <label className="text-xs font-black uppercase block mb-1 text-black">Target Grocery Store</label>
                <select
                  disabled
                  className="w-full px-3 py-2 text-xs border-2 border-black bg-gray-100 font-bold text-gray-650 focus:outline-none cursor-not-allowed text-black"
                  title="Currently, price check automation scripts are configured specifically for Food Basics."
                >
                  <option value="foodbasics">Food Basics (Active & Monitored)</option>
                  <option value="metro">Metro (Coming soon...)</option>
                  <option value="loblaws">Loblaws (Coming soon...)</option>
                  <option value="nofrills">No Frills (Coming soon...)</option>
                </select>
                <span className="text-[9px] text-[#4b5563] font-bold block mt-1">
                  ℹ Currently, price check scripts run specifically on Food Basics. Metro and Loblaws can be configured upon request.
                </span>
              </div>

              {/* 2. Direct Lookup Search Helper */}
              <div className="bg-emerald-50/50 border-2 border-black p-3 space-y-1.5 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                <span className="text-[10px] uppercase font-black text-emerald-950 block flex items-center gap-1">
                  <Search className="w-3 h-3" /> Live Price & URL Lookup Helper
                </span>
                <p className="text-[11px] text-emerald-950 leading-tight">
                  Click below to find the product page on Food Basics. This will automatically copy the item name to your clipboard for search.
                </p>
                <a
                  href={`https://www.foodbasics.ca/search?searchItem=${encodeURIComponent(activePriceCheckItem.name)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={handleSearchAndCopyName}
                  className="w-full inline-flex items-center justify-center gap-1.5 py-1.5 text-xs font-black uppercase bg-[#059669] hover:bg-emerald-700 text-white border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-colors font-bold"
                >
                  <ExternalLink className="w-3.5 h-3.5" /> Search Food Basics (Auto-Copies Name)
                </a>
              </div>

              {/* 3. Paste Direct Product URL */}
              <div>
                <label className="text-xs font-black uppercase block mb-1 text-black">Direct Product URL (Required for automated script)</label>
                <div className="flex gap-1.5">
                  <input
                    type="url"
                    placeholder="Paste Food Basics product detail link..."
                    value={modalUrl}
                    onChange={(e) => handleUrlChange(e.target.value)}
                    className="flex-1 px-3 py-2 text-xs border-2 border-black bg-white focus:outline-none font-bold text-black shadow-[1px_1px_0px_0px_rgba(0,0,0,1)]"
                  />
                  <button
                    type="button"
                    onClick={handlePasteFromClipboard}
                    className="px-3 bg-gray-100 hover:bg-emerald-50 text-black hover:text-emerald-800 border-2 border-black font-black uppercase text-[10px] tracking-wider transition-all flex items-center gap-1 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px]"
                    title="Click to automatically paste and cleanse URL from your clipboard"
                  >
                    <Clipboard className="w-3.5 h-3.5 text-emerald-700" /> Paste URL
                  </button>
                </div>
                <span className="text-[9px] text-gray-500 block mt-1.5">
                  💡 Tip: Any URL pasted or typed is auto-cleaned of tracking queries on the fly!
                </span>
              </div>

              {/* 4. Optional UPC code override */}
              <div>
                <label className="text-xs font-bold uppercase block mb-1 text-gray-550">ID / UPC Override (Optional)</label>
                <input
                  type="text"
                  placeholder="Will auto-parse from URL if left empty"
                  value={modalUpc}
                  onChange={(e) => setModalUpc(e.target.value)}
                  className="w-full px-3 py-2 text-xs border-2 border-black bg-white focus:outline-none font-bold text-black"
                />
              </div>

              {/* Controls Row */}
              <div className="flex flex-col sm:flex-row gap-2 pt-3 border-t-2 border-black">
                <button
                  onClick={() => handleSavePriceCheckUrl(modalUrl, modalUpc)}
                  disabled={!modalUrl.trim()}
                  className="flex-1 py-1.5 text-xs bg-black text-white hover:bg-[#059669] border-2 border-black font-black uppercase tracking-wider disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-center inline-flex items-center justify-center gap-1 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px]"
                >
                  <Save className="w-3.5 h-3.5" /> Save to Script
                </button>

                {scrapeConfig?.items?.some((sc: any) => sc.name.toLowerCase() === activePriceCheckItem.name.toLowerCase() && sc.stores?.foodbasics?.url) && (
                  <button
                    onClick={handleDeletePriceCheckUrl}
                    className="py-1.5 px-3 text-xs bg-white text-red-655 hover:bg-red-50 border-2 border-black text-red-600 font-black uppercase tracking-wider transition-colors inline-flex items-center justify-center gap-1 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px]"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-red-600" /> Delete URL
                  </button>
                )}

                <button
                  onClick={() => setActivePriceCheckItem(null)}
                  className="py-1.5 px-4 text-xs bg-white text-black hover:bg-gray-100 border-2 border-black font-black uppercase tracking-wider transition-colors text-center shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px]"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
