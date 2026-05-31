import React, { useRef, useState, useCallback } from "react";
import Link from "@/components/Link";
import { RegularItem, PriceEntry } from "@/lib/types";

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
                    <div key={item.id} className="relative">
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
                        className={`w-full flex items-center gap-2.5 px-3 py-2 border-2 border-black text-left text-sm transition-all ${
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
    </div>
  );
}
