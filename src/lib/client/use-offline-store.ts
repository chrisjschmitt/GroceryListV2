import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { GroceryItem, RegularItem, PriceData, PriceEntry, PurchaseLogEntry } from "../types";
import {
  localGetGroceryItems,
  localSetGroceryItems,
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
  localGetPurchaseLogs,
  localSetPurchaseLogs,
  localAddPurchaseLogs,
  localToggleGroceryItem,
  localUpdateGroceryItemQuantity,
  localToggleRegularItem,
  setLastSyncTime,
} from "./local-db";
import { pullFromServer, pushDirtyToServer, syncAllToServer, SyncStatus, DirtyFlag, fetchFromServer } from "./sync";
import { parseCsv } from "../csv-parser";
import { getDeviceName } from "./device-name";
import { getAutoSaveEnabled } from "./settings";

const POLL_INTERVAL = 60000;

export function areGroceryItemsEqual(local: GroceryItem[], server: GroceryItem[]): boolean {
  if (local.length !== server.length) return false;
  for (const item of local) {
    const sItem = server.find((s) => s.id === item.id);
    if (!sItem) return false;
    if (
      item.name !== sItem.name ||
      item.category !== sItem.category ||
      item.quantity !== sItem.quantity ||
      item.unit !== sItem.unit ||
      item.checked !== sItem.checked ||
      item.units !== sItem.units
    ) {
      return false;
    }
  }
  return true;
}

export function areRegularItemsEqual(local: RegularItem[], server: RegularItem[]): boolean {
  if (local.length !== server.length) return false;
  for (const item of local) {
    const sItem = server.find((s) => s.id === item.id);
    if (!sItem) return false;
    if (
      item.name !== sItem.name ||
      item.category !== sItem.category ||
      item.selected !== sItem.selected
    ) {
      return false;
    }
  }
  return true;
}

export function mergePurchaseLogs(localLogs: PurchaseLogEntry[], serverLogs: PurchaseLogEntry[]): PurchaseLogEntry[] {
  const merged = [...localLogs];
  for (const sLog of serverLogs) {
    if (!merged.some(l => l.id === sLog.id)) {
      merged.push(sLog);
    }
  }
  return merged.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
}


export interface OfflineStore {
  groceryItems: GroceryItem[];
  regularItems: RegularItem[];
  purchaseLogs: PurchaseLogEntry[];
  syncStatus: SyncStatus;
  isOnline: boolean;
  lastSynced: Date | null;
  lastSavedBy: string | null;
  hasPendingChanges: boolean;
  prices: PriceData;
  saveChanges: () => Promise<void>;
  addGroceryItem: (name: string, quantity: number, unit: string, category?: string, units?: number) => Promise<void>;
  toggleGroceryItem: (id: string) => Promise<void>;
  updateGroceryItemQuantity: (id: string, quantity: number) => Promise<void>;
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

export function useOfflineStoreState(): OfflineStore {
  const [groceryItems, setGroceryItems] = useState<GroceryItem[]>([]);
  const [regularItems, setRegularItems] = useState<RegularItem[]>([]);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("synced");
  const [isOnline, setIsOnline] = useState(true);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const [lastSavedBy, setLastSavedBy] = useState<string | null>(null);
  const [prices, setPrices] = useState<PriceData>({});

  const [purchaseLogs, setPurchaseLogs] = useState<PurchaseLogEntry[]>([]);

  const [serverGroceryItems, setServerGroceryItems] = useState<GroceryItem[]>([]);
  const [serverRegularItems, setServerRegularItems] = useState<RegularItem[]>([]);

  const isGroceryItemsDifferent = useMemo(() => {
    return !areGroceryItemsEqual(groceryItems, serverGroceryItems);
  }, [groceryItems, serverGroceryItems]);

  const isRegularItemsDifferent = useMemo(() => {
    return !areRegularItemsEqual(regularItems, serverRegularItems);
  }, [regularItems, serverRegularItems]);

  const dirtyRef = useRef<Set<DirtyFlag>>(new Set());
  const saveQueuePromiseRef = useRef<Promise<void>>(Promise.resolve());

  // We check dirtyRef instead of comparing with server logs because logs only append
  const hasPendingChanges = useMemo(() => {
    return isGroceryItemsDifferent || isRegularItemsDifferent || dirtyRef.current.has("purchaseLogs");
  }, [isGroceryItemsDifferent, isRegularItemsDifferent, purchaseLogs]);

  const markSynced = useCallback((savedBy?: string) => {
    setSyncStatus("synced");
    setLastSynced(new Date());
    if (savedBy) setLastSavedBy(savedBy);
  }, []);

  const markDirty = useCallback((flag: DirtyFlag) => {
    dirtyRef.current.add(flag);
  }, []);

  const saveChanges = useCallback(() => {
    const nextPromise = saveQueuePromiseRef.current.then(async () => {
      const currentGrocery = await localGetGroceryItems();
      const currentRegular = await localGetRegularItems();

      const isGroceryDiff = !areGroceryItemsEqual(currentGrocery, serverGroceryItems);
      const isRegularDiff = !areRegularItemsEqual(currentRegular, serverRegularItems);

      const toFlush = new Set<DirtyFlag>();
      if (isGroceryDiff) toFlush.add("grocery");
      if (isRegularDiff) toFlush.add("regular");
      if (dirtyRef.current.has("purchaseLogs")) toFlush.add("purchaseLogs");

      if (toFlush.size === 0) return;

      if (!navigator.onLine) {
        setSyncStatus("offline");
        return;
      }

      setSyncStatus("syncing");
      const result = await pushDirtyToServer(toFlush);

      if (result.success) {
        const freshGrocery = await localGetGroceryItems();
        const freshRegular = await localGetRegularItems();
        setServerGroceryItems(freshGrocery);
        setServerRegularItems(freshRegular);
        dirtyRef.current.clear();
        markSynced(getDeviceName());
      } else {
        setSyncStatus("offline");
      }
    }).catch((err) => {
      console.error("Error during saveChanges execution:", err);
      setSyncStatus("offline");
    });

    saveQueuePromiseRef.current = nextPromise;
    return nextPromise;
  }, [serverGroceryItems, serverRegularItems, markSynced]);

  const pullAndUpdate = useCallback(async () => {
    if (!navigator.onLine || hasPendingChanges) return;
    const serverData = await pullFromServer();
    if (serverData) {
      setGroceryItems(serverData.groceryItems);
      setRegularItems(serverData.regularItems);
      setPrices(serverData.prices);
      setPurchaseLogs(serverData.purchaseLogs);
      setServerGroceryItems(JSON.parse(JSON.stringify(serverData.groceryItems)));
      setServerRegularItems(JSON.parse(JSON.stringify(serverData.regularItems)));
      markSynced(serverData.syncMeta?.lastSavedBy || undefined);
    }
  }, [markSynced, hasPendingChanges]);

  // Load from IndexedDB on mount, then do initial server reconciliation
  useEffect(() => {
    async function init() {
      let localGrocery: GroceryItem[] = [];
      let localRegular: RegularItem[] = [];
      let localLogs: PurchaseLogEntry[] = [];

      try {
        localGrocery = await localGetGroceryItems();
      } catch (err) {
        console.error("Failed to load local grocery items from IndexedDB:", err);
      }

      try {
        localRegular = await localGetRegularItems();
      } catch (err) {
        console.error("Failed to load local regular items from IndexedDB:", err);
      }

      try {
        localLogs = await localGetPurchaseLogs();
      } catch (err) {
        console.error("Failed to load local purchase logs from IndexedDB:", err);
      }

      setGroceryItems(localGrocery);
      setRegularItems(localRegular);
      setPurchaseLogs(localLogs);
      setServerGroceryItems(JSON.parse(JSON.stringify(localGrocery)));
      setServerRegularItems(JSON.parse(JSON.stringify(localRegular)));

      if (!navigator.onLine) {
        setSyncStatus("offline");
        setIsOnline(false);
        return;
      }

      setSyncStatus("syncing");
      try {
        const serverData = await fetchFromServer();

        if (serverData === null) {
          setSyncStatus("offline");
          return;
        }

        // Always set prices on successful fetch regardless of push/pull path
        setPrices(serverData.prices);

        const hasLocalData = localGrocery.length > 0 || localRegular.length > 0;
        const groceryDiffer = !areGroceryItemsEqual(localGrocery, serverData.groceryItems);
        const regularDiffer = !areRegularItemsEqual(localRegular, serverData.regularItems);

        if (hasLocalData && (groceryDiffer || regularDiffer)) {
          // Push local state via syncAllToServer, do NOT overwrite local items
          const result = await syncAllToServer();
          if (result.success) {
            setServerGroceryItems(JSON.parse(JSON.stringify(localGrocery)));
            setServerRegularItems(JSON.parse(JSON.stringify(localRegular)));
            
            // Merge server purchaseLogs into local DB and state so we don't lose server-only logs
            const mergedLogs = mergePurchaseLogs(localLogs, serverData.purchaseLogs);
            await localSetPurchaseLogs(mergedLogs);
            setPurchaseLogs(mergedLogs);
            
            markSynced(getDeviceName());
          } else {
            setSyncStatus("offline");
          }
        } else {
          // Write server items/logs to IndexedDB and update React state from server
          await localSetGroceryItems(serverData.groceryItems);
          await localSetRegularItems(serverData.regularItems);
          await localSetPurchaseLogs(serverData.purchaseLogs);
          await setLastSyncTime(Date.now());

          setGroceryItems(serverData.groceryItems);
          setRegularItems(serverData.regularItems);
          setPurchaseLogs(serverData.purchaseLogs);
          setServerGroceryItems(JSON.parse(JSON.stringify(serverData.groceryItems)));
          setServerRegularItems(JSON.parse(JSON.stringify(serverData.regularItems)));
          markSynced(serverData.syncMeta?.lastSavedBy || undefined);
        }
      } catch (syncErr) {
        console.error("Failed server reconciliation on mount:", syncErr);
        setSyncStatus("error");
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
        if (getAutoSaveEnabled() && hasPendingChanges && navigator.onLine) {
          saveChanges();
        }
      } else if (document.visibilityState === "visible" && navigator.onLine) {
        if (!hasPendingChanges) {
          pullAndUpdate();
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [pullAndUpdate, saveChanges, hasPendingChanges]);

  // Auto-save changes with a debounce of 1.5 seconds if auto-save is enabled
  useEffect(() => {
    if (!hasPendingChanges) return;
    if (!navigator.onLine) return;
    if (!getAutoSaveEnabled()) return;

    const timer = setTimeout(() => {
      console.log("Auto-saving pending changes to server...");
      saveChanges();
    }, 1500);

    return () => clearTimeout(timer);
  }, [hasPendingChanges, saveChanges]);

  // Warn user before leaving if there are unsaved pending changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasPendingChanges) {
        e.preventDefault();
        e.returnValue = "You have unsaved changes. Are you sure you want to leave?";
        return e.returnValue;
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasPendingChanges]);

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

  const addGroceryItem = useCallback(async (name: string, quantity: number, unit: string, category?: string, units?: number) => {
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
      units,
      checked: false,
      prices: [],
      bestPrice: undefined,
      createdAt: new Date().toISOString(),
    };

    // Attempt to enrich item with existing prices client-side if available
    const normalizedName = name.toLowerCase().trim();
    const matchingPrices = (Object.values(prices) as PriceEntry[]).filter((p) => 
      p && (
        (p.item_name && p.item_name.toLowerCase() === normalizedName) ||
        (p.config_name && p.config_name.toLowerCase() === normalizedName)
      )
    );
    if (matchingPrices.length > 0) {
      const mergedStorePricesMap = new Map<string, any>();
      for (const p of matchingPrices) {
        if (p.stores && typeof p.stores === "object") {
          for (const [storeId, storeInfo] of Object.entries(p.stores)) {
            const priceVal = (storeInfo.is_on_sale && storeInfo.sale_price !== null && storeInfo.sale_price !== undefined) 
              ? storeInfo.sale_price 
              : (storeInfo.regular_price || 0);
            
            const existing = mergedStorePricesMap.get(storeId);
            if (!existing || priceVal < existing.price) {
              mergedStorePricesMap.set(storeId, {
                storeId: storeId,
                storeName: storeInfo.store_name || storeId,
                price: priceVal,
                onSale: storeInfo.is_on_sale === 1 || !!storeInfo.is_on_sale,
                lookup_url: storeInfo.lookup_url || "",
                valid_until: storeInfo.valid_until || p.valid_until || "",
              });
            }
          }
        } else {
          const priceVal = (p.is_on_sale && p.sale_price !== null && p.sale_price !== undefined) 
            ? p.sale_price 
            : (p.regular_price || 0);
          const storeId = p.store_id || "foodbasics";
          const existing = mergedStorePricesMap.get(storeId);
          if (!existing || priceVal < existing.price) {
            mergedStorePricesMap.set(storeId, {
              storeId: storeId,
              storeName: p.store_name || "Food Basics",
              price: priceVal,
              onSale: p.is_on_sale === 1 || !!p.is_on_sale,
              lookup_url: p.lookup_url || "",
              valid_until: p.valid_until || "",
            });
          }
        }
      }
      const storePrices = Array.from(mergedStorePricesMap.values());
      newItem.prices = storePrices;
      newItem.bestPrice = storePrices.length > 0 
        ? storePrices.reduce((best, curr) => curr.price < best.price ? curr : best, storePrices[0])
        : undefined;
    }

    await localAddGroceryItem(newItem);
    setGroceryItems((prev) => [...prev, newItem]);
    markDirty("grocery");
  }, [prices, markDirty]);

  const toggleGroceryItem = useCallback(async (id: string) => {
    setGroceryItems((prev) => {
      const item = prev.find((i) => i.id === id);
      const targetChecked = item ? !item.checked : false;
      localToggleGroceryItem(id, targetChecked).catch(console.error);
      return prev.map((i) => (i.id === id ? { ...i, checked: targetChecked } : i));
    });
    markDirty("grocery");
  }, [markDirty]);

  const updateGroceryItemQuantity = useCallback(async (id: string, quantity: number) => {
    const targetQuantity = Math.max(1, quantity);
    setGroceryItems((prev) => {
      localUpdateGroceryItemQuantity(id, targetQuantity).catch(console.error);
      return prev.map((i) => (i.id === id ? { ...i, quantity: targetQuantity } : i));
    });
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
    const checked = groceryItems.filter((i) => i.checked);
    if (checked.length > 0) {
      const newLogs: PurchaseLogEntry[] = checked.map((item) => ({
        id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        timestamp: new Date().toISOString(),
        itemId: item.id,
        name: item.name,
        category: item.category,
        quantity: item.quantity,
        unit: item.unit,
        units: item.units,
        storeId: item.bestPrice?.storeId,
        storeName: item.bestPrice?.storeName,
        price: item.bestPrice?.price,
      }));

      await localAddPurchaseLogs(newLogs);
      setPurchaseLogs((prev) => [...prev, ...newLogs]);
      markDirty("purchaseLogs");
    }

    setGroceryItems((prev) => prev.filter((i) => !i.checked));
    await localClearCheckedGroceryItems();
    markDirty("grocery");
  }, [groceryItems, markDirty]);

  const clearAllGroceryItems = useCallback(async () => {
    setGroceryItems([]);
    await localClearAllGroceryItems();
    markDirty("grocery");
  }, [markDirty]);

  const toggleRegularItem = useCallback(async (id: string) => {
    setRegularItems((prev) => {
      const item = prev.find((i) => i.id === id);
      const targetSelected = item ? !item.selected : false;
      localToggleRegularItem(id, targetSelected).catch(console.error);
      return prev.map((i) => (i.id === id ? { ...i, selected: targetSelected } : i));
    });
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
      await addGroceryItem(ri.name, 1, ri.unit || "unit", ri.category, ri.units);
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
    purchaseLogs,
    syncStatus,
    isOnline,
    lastSynced,
    lastSavedBy,
    hasPendingChanges,
    prices,
    saveChanges,
    addGroceryItem,
    toggleGroceryItem,
    updateGroceryItemQuantity,
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
