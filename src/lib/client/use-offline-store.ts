import { useState, useEffect, useCallback, useRef } from "react";
import { GroceryItem, RegularItem, PriceData, PriceEntry } from "../types";
import {
  localGetGroceryItems,
  localAddGroceryItem,
  localUpdateGroceryItem,
  localRemoveGroceryItem,
  localClearCheckedGroceryItems,
  localClearAllGroceryItems,
  localGetRegularItems,
  localSetRegularItems,
  localUpdateRegularItem,
  localClearRegularItems,
  localRemoveRegularItem,
} from "./local-db";
import { pullFromServer, pushDirtyToServer, syncAllToServer, SyncStatus, DirtyFlag } from "./sync";
import { parseCsv } from "../csv-parser";
import { getDeviceName } from "./device-name";
import { getAutoSaveEnabled } from "./settings";

const POLL_INTERVAL = 60000;

export interface OfflineStore {
  groceryItems: GroceryItem[];
  regularItems: RegularItem[];
  syncStatus: SyncStatus;
  isOnline: boolean;
  lastSynced: Date | null;
  lastSavedBy: string | null;
  hasPendingChanges: boolean;
  prices: PriceData;
  saveChanges: () => Promise<void>;
  addGroceryItem: (name: string, quantity: number, unit: string, category?: string) => Promise<void>;
  toggleGroceryItem: (id: string) => Promise<void>;
  removeGroceryItem: (id: string) => Promise<void>;
  removeGroceryItemByName: (name: string) => Promise<void>;
  clearCheckedGroceryItems: () => Promise<void>;
  clearAllGroceryItems: () => Promise<void>;
  toggleRegularItem: (id: string) => Promise<void>;
  uploadCsv: (file: File) => Promise<{ count: number; errors: string[] }>;
  clearRegularItems: () => Promise<void>;
  addRegularItem: (name: string, category: string) => Promise<void>;
  editRegularItem: (id: string, name: string) => Promise<void>;
  deleteRegularItem: (id: string) => Promise<void>;
  addSelectedToGroceryList: (items: RegularItem[]) => Promise<void>;
  refreshFromServer: () => Promise<void>;
}

export function useOfflineStore(): OfflineStore {
  const [groceryItems, setGroceryItems] = useState<GroceryItem[]>([]);
  const [regularItems, setRegularItems] = useState<RegularItem[]>([]);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("synced");
  const [isOnline, setIsOnline] = useState(true);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const [lastSavedBy, setLastSavedBy] = useState<string | null>(null);
  const [hasPendingChanges, setHasPendingChanges] = useState(false);
  const [prices, setPrices] = useState<PriceData>({});

  const dirtyRef = useRef<Set<DirtyFlag>>(new Set());

  const markSynced = useCallback((savedBy?: string) => {
    setSyncStatus("synced");
    setLastSynced(new Date());
    setHasPendingChanges(false);
    if (savedBy) setLastSavedBy(savedBy);
  }, []);

  const markDirty = useCallback((flag: DirtyFlag) => {
    dirtyRef.current.add(flag);
    setHasPendingChanges(true);
  }, []);

  const saveChanges = useCallback(async () => {
    if (dirtyRef.current.size === 0) return;
    if (!navigator.onLine) {
      setSyncStatus("offline");
      return;
    }

    const toFlush = new Set<DirtyFlag>(dirtyRef.current);
    dirtyRef.current.clear();

    setSyncStatus("syncing");
    const result = await pushDirtyToServer(toFlush);

    if (result.success) {
      markSynced(getDeviceName());
    } else {
      toFlush.forEach((f) => dirtyRef.current.add(f));
      setHasPendingChanges(true);
      setSyncStatus("offline");
    }
  }, [markSynced]);

  const pullAndUpdate = useCallback(async () => {
    if (!navigator.onLine || dirtyRef.current.size > 0) return;
    const serverData = await pullFromServer();
    if (serverData) {
      setGroceryItems(serverData.groceryItems);
      setRegularItems(serverData.regularItems);
      setPrices(serverData.prices);
      markSynced(serverData.syncMeta?.lastSavedBy || undefined);
    }
  }, [markSynced]);

  // Load from IndexedDB on mount, then do initial server reconciliation
  useEffect(() => {
    async function init() {
      const [localGrocery, localRegular] = await Promise.all([
        localGetGroceryItems(),
        localGetRegularItems(),
      ]);

      setGroceryItems(localGrocery);
      setRegularItems(localRegular);

      if (!navigator.onLine) {
        setSyncStatus("offline");
        setIsOnline(false);
        return;
      }

      setSyncStatus("syncing");
      const serverData = await pullFromServer();

      if (serverData) {
        setGroceryItems(serverData.groceryItems);
        setRegularItems(serverData.regularItems);
        setPrices(serverData.prices);
        markSynced(serverData.syncMeta?.lastSavedBy || undefined);
      } else if (localGrocery.length > 0 || localRegular.length > 0) {
        const result = await syncAllToServer();
        if (result.success) {
          markSynced(getDeviceName());
        } else {
          setSyncStatus("offline");
        }
      } else {
        markSynced();
      }
    }

    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Poll for changes from other devices (read-only, free operations)
  useEffect(() => {
    const interval = setInterval(pullAndUpdate, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [pullAndUpdate]);

  // Auto-save when leaving (if enabled), pull when returning
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        if (getAutoSaveEnabled() && dirtyRef.current.size > 0 && navigator.onLine) {
          saveChanges();
        }
      } else if (document.visibilityState === "visible" && navigator.onLine) {
        if (dirtyRef.current.size === 0) {
          pullAndUpdate();
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [pullAndUpdate, saveChanges]);

  // Online/offline listeners
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => {
      setIsOnline(false);
      setSyncStatus("offline");
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // --- Mutations ---

  const addGroceryItem = useCallback(async (name: string, quantity: number, unit: string, category?: string) => {
    const existing = await localGetGroceryItems();
    if (existing.some((i) => i.name.toLowerCase() === name.toLowerCase())) {
      return;
    }

    const newItem: GroceryItem = {
      id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      name,
      category: category || "Other",
      quantity,
      unit,
      checked: false,
      prices: [],
      bestPrice: undefined,
      createdAt: new Date().toISOString(),
    };

    // Attempt to enrich item with existing prices client-side if available
    const normalizedName = name.toLowerCase().trim();
    const matchingPrices = (Object.values(prices) as PriceEntry[]).filter((p) => p.item_name.toLowerCase() === normalizedName);
    if (matchingPrices.length > 0) {
      newItem.prices = matchingPrices.map((p) => ({
        storeId: p.store_id,
        storeName: p.store_name,
        price: (p.is_on_sale && p.sale_price !== null) ? p.sale_price : (p.regular_price || 0),
        onSale: p.is_on_sale === 1,
      }));
      newItem.bestPrice = newItem.prices.reduce((best, curr) => curr.price < best.price ? curr : best, newItem.prices[0]);
    }

    await localAddGroceryItem(newItem);
    setGroceryItems((prev) => [...prev, newItem]);
    markDirty("grocery");
  }, [prices, markDirty]);

  const toggleGroceryItem = useCallback(async (id: string) => {
    setGroceryItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, checked: !i.checked } : i))
    );

    const items = await localGetGroceryItems();
    const item = items.find((i) => i.id === id);
    if (item) {
      await localUpdateGroceryItem({ ...item, checked: !item.checked });
    }

    markDirty("grocery");
  }, [markDirty]);

  const removeGroceryItem = useCallback(async (id: string) => {
    setGroceryItems((prev) => prev.filter((i) => i.id !== id));
    await localRemoveGroceryItem(id);
    markDirty("grocery");
  }, [markDirty]);

  const removeGroceryItemByName = useCallback(async (name: string) => {
    const items = await localGetGroceryItems();
    const item = items.find((i) => i.name.toLowerCase() === name.toLowerCase());
    if (item) {
      setGroceryItems((prev) => prev.filter((i) => i.id !== item.id));
      await localRemoveGroceryItem(item.id);
      markDirty("grocery");
    }
  }, [markDirty]);

  const clearCheckedGroceryItems = useCallback(async () => {
    setGroceryItems((prev) => prev.filter((i) => !i.checked));
    await localClearCheckedGroceryItems();
    markDirty("grocery");
  }, [markDirty]);

  const clearAllGroceryItems = useCallback(async () => {
    setGroceryItems([]);
    await localClearAllGroceryItems();
    markDirty("grocery");
  }, [markDirty]);

  const toggleRegularItem = useCallback(async (id: string) => {
    setRegularItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, selected: !i.selected } : i))
    );

    const items = await localGetRegularItems();
    const item = items.find((i) => i.id === id);
    if (item) {
      await localUpdateRegularItem({ ...item, selected: !item.selected });
    }

    markDirty("regular");
  }, [markDirty]);

  const uploadCsv = useCallback(async (file: File): Promise<{ count: number; errors: string[] }> => {
    const content = await file.text();
    const { items, errors } = parseCsv(content);

    if (items.length === 0) {
      return { count: 0, errors: errors.length > 0 ? errors : ["No valid items found"] };
    }

    await localSetRegularItems(items);
    setRegularItems(items);
    markDirty("regular");

    return { count: items.length, errors };
  }, [markDirty]);

  const clearRegularItems = useCallback(async () => {
    setRegularItems([]);
    await localClearRegularItems();
    markDirty("regular");
  }, [markDirty]);

  const addSelectedToGroceryList = useCallback(async (selected: RegularItem[]) => {
    const currentItems = await localGetGroceryItems();
    const currentNames = new Set(currentItems.map((i) => i.name.toLowerCase()));
    const newItems = selected.filter((s) => !currentNames.has(s.name.toLowerCase()));

    for (const ri of newItems) {
      await addGroceryItem(ri.name, 1, "unit", ri.category);
    }

    const allRegular = await localGetRegularItems();
    for (const item of allRegular) {
      if (item.selected) {
        await localUpdateRegularItem({ ...item, selected: false });
      }
    }
    setRegularItems((prev) => prev.map((i) => ({ ...i, selected: false })));
    markDirty("regular");
  }, [addGroceryItem, markDirty]);

  const addRegularItem = useCallback(async (name: string, category: string) => {
    const newItem: RegularItem = {
      id: `regular-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      category,
      name,
      selected: false,
    };
    await localUpdateRegularItem(newItem);
    setRegularItems((prev) => [...prev, newItem]);
    markDirty("regular");
  }, [markDirty]);

  const editRegularItem = useCallback(async (id: string, name: string) => {
    const items = await localGetRegularItems();
    const item = items.find((i) => i.id === id);
    if (!item) return;
    const updated = { ...item, name };
    await localUpdateRegularItem(updated);
    setRegularItems((prev) => prev.map((i) => (i.id === id ? updated : i)));
    markDirty("regular");
  }, [markDirty]);

  const deleteRegularItem = useCallback(async (id: string) => {
    await localRemoveRegularItem(id);
    setRegularItems((prev) => prev.filter((i) => i.id !== id));
    markDirty("regular");
  }, [markDirty]);

  return {
    groceryItems,
    regularItems,
    syncStatus,
    isOnline,
    lastSynced,
    lastSavedBy,
    hasPendingChanges,
    prices,
    saveChanges,
    addGroceryItem,
    toggleGroceryItem,
    removeGroceryItem,
    removeGroceryItemByName,
    clearCheckedGroceryItems,
    clearAllGroceryItems,
    toggleRegularItem,
    uploadCsv,
    clearRegularItems,
    addRegularItem,
    editRegularItem,
    deleteRegularItem,
    addSelectedToGroceryList,
    refreshFromServer: pullAndUpdate,
  };
}
