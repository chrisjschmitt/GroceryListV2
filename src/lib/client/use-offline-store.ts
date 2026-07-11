import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { GroceryItem, RegularItem, PriceData, PriceEntry, PurchaseLogEntry, PriceSnapshotEntry, Tombstone } from "../types";
import { normalizeStoreKey, getStoreActivePrice, getStoreDisplayName } from "../price-utils";
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
  getLastSyncTime,
  getLocalDirtyFlags,
  setLocalDirtyFlags,
  localGetGroceryTombstones,
  localSetGroceryTombstones,
  localGetRegularTombstones,
  localSetRegularTombstones,
  localDeleteGroceryTombstone,
  localDeleteRegularTombstone,
} from "./local-db";
import { pullFromServer, pushDirtyToServer, syncAllToServer, SyncStatus, DirtyFlag, fetchFromServer } from "./sync";
import { parseCsv } from "../csv-parser";
import { getDeviceName } from "./device-name";
import { getAutoSaveEnabled } from "./settings";
import { mergePurchaseLogs } from "../purchase-log-merge";
import { mergeLists } from "../list-merge";

export { mergePurchaseLogs, purchaseLogEnrichmentScore } from "../purchase-log-merge";

const POLL_INTERVAL = 60000;

export function areGroceryItemsEqual(local: GroceryItem[], server: GroceryItem[]): boolean {
  if (local.length !== server.length) return false;
  for (const item of local) {
    const sItem = server.find((s) => s.id === item.id);
    if (!sItem) return false;

    // Normalize potential undefined/null fields to prevent comparison mismatches
    const localUnits = item.units === null || item.units === undefined ? undefined : item.units;
    const serverUnits = sItem.units === null || sItem.units === undefined ? undefined : sItem.units;

    const localUnit = item.unit === null || item.unit === undefined ? "unit" : item.unit;
    const serverUnit = sItem.unit === null || sItem.unit === undefined ? "unit" : sItem.unit;

    const localCategory = item.category === null || item.category === undefined ? "Other" : item.category;
    const serverCategory = sItem.category === null || sItem.category === undefined ? "Other" : sItem.category;

    if (
      item.name !== sItem.name ||
      localCategory !== serverCategory ||
      item.quantity !== sItem.quantity ||
      localUnit !== serverUnit ||
      item.checked !== sItem.checked ||
      localUnits !== serverUnits
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

    const localCategory = item.category === null || item.category === undefined ? "Other" : item.category;
    const serverCategory = sItem.category === null || sItem.category === undefined ? "Other" : sItem.category;

    if (
      item.name !== sItem.name ||
      localCategory !== serverCategory ||
      item.selected !== sItem.selected
    ) {
      return false;
    }
  }
  return true;
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
  addGroceryItem: (name: string, quantity: number, unit: string, category?: string, units?: number) => Promise<GroceryItem>;
  toggleGroceryItem: (id: string) => Promise<void>;
  updateGroceryItemQuantity: (id: string, quantity: number) => Promise<void>;
  removeGroceryItem: (id: string) => Promise<void>;
  removeGroceryItemByName: (name: string) => Promise<void>;
  clearCheckedGroceryItems: (storeId: string, storeName: string) => Promise<void>;
  clearAllGroceryItems: () => Promise<void>;
  toggleRegularItem: (id: string) => Promise<void>;
  uploadCsv: (file: File) => Promise<{ count: number; errors: string[] }>;
  clearRegularItems: () => Promise<void>;
  addRegularItem: (name: string, category: string) => Promise<void>;
  editRegularItem: (id: string, name: string) => Promise<void>;
  deleteRegularItem: (id: string) => Promise<void>;
  addSelectedToGroceryList: (items: RegularItem[]) => Promise<void>;
  refreshFromServer: (force?: boolean) => Promise<void>;
  syncConflict: boolean;
  resolveConflict: (choice: "local" | "server") => Promise<void>;
  groceryAmbiguities: any[];
  regularAmbiguities: any[];
  resolveSingleAmbiguity: (listType: "grocery" | "regular", id: string, choice: "local" | "remote") => Promise<void>;
  resolveAllAmbiguities: (listType: "grocery" | "regular", choice: "local" | "remote") => Promise<void>;
}

export function useOfflineStoreState(): OfflineStore {
  const [groceryItems, setGroceryItems] = useState<GroceryItem[]>([]);
  const [regularItems, setRegularItems] = useState<RegularItem[]>([]);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("synced");
  const [isOnline, setIsOnline] = useState(true);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const [lastSavedBy, setLastSavedBy] = useState<string | null>(null);
  const [groceryDirty, setGroceryDirtyState] = useState(false);
  const [regularDirty, setRegularDirtyState] = useState(false);
  const [syncConflict, setSyncConflict] = useState(false);
  const [prices, setPrices] = useState<PriceData>({});
  const [groceryAmbiguities, setGroceryAmbiguities] = useState<any[]>([]);
  const [regularAmbiguities, setRegularAmbiguities] = useState<any[]>([]);

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

  const groceryItemsRef = useRef<GroceryItem[]>(groceryItems);
  const regularItemsRef = useRef<RegularItem[]>(regularItems);
  const serverGroceryItemsRef = useRef<GroceryItem[]>(serverGroceryItems);
  const serverRegularItemsRef = useRef<RegularItem[]>(serverRegularItems);

  useEffect(() => {
    groceryItemsRef.current = groceryItems;
  }, [groceryItems]);

  useEffect(() => {
    regularItemsRef.current = regularItems;
  }, [regularItems]);

  useEffect(() => {
    serverGroceryItemsRef.current = serverGroceryItems;
  }, [serverGroceryItems]);

  useEffect(() => {
    serverRegularItemsRef.current = serverRegularItems;
  }, [serverRegularItems]);

  const hasPendingChanges = useMemo(() => {
    return groceryDirty || regularDirty || dirtyRef.current.has("purchaseLogs");
  }, [groceryDirty, regularDirty, purchaseLogs]);

  const markSynced = useCallback((savedBy?: string) => {
    setSyncStatus("synced");
    setLastSynced(new Date());
    if (savedBy) setLastSavedBy(savedBy);
  }, []);

  const markDirty = useCallback(async (flag: DirtyFlag) => {
    if (flag === "grocery") {
      setGroceryDirtyState(true);
      await setLocalDirtyFlags({ grocery: true });
    } else if (flag === "regular") {
      setRegularDirtyState(true);
      await setLocalDirtyFlags({ regular: true });
    } else {
      dirtyRef.current.add(flag);
    }
  }, []);

  const saveChanges = useCallback(() => {
    const nextPromise = saveQueuePromiseRef.current.then(async () => {
      if (groceryAmbiguities.length > 0 || regularAmbiguities.length > 0) {
        return;
      }

      const reactGrocery = groceryItemsRef.current;
      const reactRegular = regularItemsRef.current;

      let currentGrocery = await localGetGroceryItems();
      let currentRegular = await localGetRegularItems();

      // If React state differs from IDB, write state to IDB
      if (!areGroceryItemsEqual(reactGrocery, currentGrocery)) {
        await localSetGroceryItems(reactGrocery);
        currentGrocery = reactGrocery;
      }
      if (!areRegularItemsEqual(reactRegular, currentRegular)) {
        await localSetRegularItems(reactRegular);
        currentRegular = reactRegular;
      }

      const flags = await getLocalDirtyFlags();
      const hasLogsDirty = dirtyRef.current.has("purchaseLogs");

      const toFlush = new Set<DirtyFlag>();
      if (flags.grocery) toFlush.add("grocery");
      if (flags.regular) toFlush.add("regular");
      if (hasLogsDirty) toFlush.add("purchaseLogs");

      if (toFlush.size === 0) return;

      if (!navigator.onLine) {
        setSyncStatus("offline");
        return;
      }

      setSyncStatus("syncing");
      const result = await pushDirtyToServer(toFlush);

      if (result.success) {
        if (result.groceryItems) {
          await localSetGroceryItems(result.groceryItems);
          setGroceryItems(result.groceryItems);
          setServerGroceryItems(JSON.parse(JSON.stringify(result.groceryItems)));
          serverGroceryItemsRef.current = result.groceryItems;
        }
        if (result.groceryTombstones) {
          await localSetGroceryTombstones(result.groceryTombstones);
        }
        if (result.groceryAmbiguities) {
          setGroceryAmbiguities(result.groceryAmbiguities);
        }

        if (result.regularItems) {
          await localSetRegularItems(result.regularItems);
          setRegularItems(result.regularItems);
          setServerRegularItems(JSON.parse(JSON.stringify(result.regularItems)));
          serverRegularItemsRef.current = result.regularItems;
        }
        if (result.regularTombstones) {
          await localSetRegularTombstones(result.regularTombstones);
        }
        if (result.regularAmbiguities) {
          setRegularAmbiguities(result.regularAmbiguities);
        }

        if (flags.grocery) await setLocalDirtyFlags({ grocery: false });
        if (flags.regular) await setLocalDirtyFlags({ regular: false });
        
        setGroceryDirtyState(false);
        setRegularDirtyState(false);
        dirtyRef.current.delete("purchaseLogs");

        if (result.syncMeta) {
          await setLastSyncTime(result.syncMeta.lastSavedTime);
          setLastSynced(new Date(result.syncMeta.lastSavedTime));
          setLastSavedBy(result.syncMeta.lastSavedBy || null);
          setSyncStatus("synced");
        } else {
          setSyncStatus("synced");
        }
        markSynced(result.syncMeta?.lastSavedBy || getDeviceName());
      } else {
        setSyncStatus("error");
      }
    }).catch((err) => {
      console.error("saveChanges error:", err);
      setSyncStatus("error");
    });

    saveQueuePromiseRef.current = nextPromise;
    return nextPromise;
  }, [markSynced, syncConflict, groceryDirty, regularDirty]);

  const pullAndUpdate = useCallback(async (force = false) => {
    if (!navigator.onLine) return;
    if (groceryAmbiguities.length > 0 || regularAmbiguities.length > 0) return;

    try {
      const serverData = await fetchFromServer();
      if (!serverData) return;

      const localGrocery = await localGetGroceryItems();
      const localGroceryTombstones = await localGetGroceryTombstones();
      const localRegular = await localGetRegularItems();
      const localRegularTombstones = await localGetRegularTombstones();

      const mergedGrocery = mergeLists(localGrocery, localGroceryTombstones, serverData.groceryItems, serverData.groceryTombstones);
      const mergedRegular = mergeLists(localRegular, localRegularTombstones, serverData.regularItems, serverData.regularTombstones, true);

      // Apply non-ambiguous updates locally
      await localSetGroceryItems(mergedGrocery.mergedItems);
      await localSetGroceryTombstones(mergedGrocery.mergedTombstones);
      setGroceryItems(mergedGrocery.mergedItems);
      setServerGroceryItems(JSON.parse(JSON.stringify(mergedGrocery.mergedItems)));
      serverGroceryItemsRef.current = mergedGrocery.mergedItems;
      setGroceryAmbiguities(mergedGrocery.ambiguities);

      await localSetRegularItems(mergedRegular.mergedItems);
      await localSetRegularTombstones(mergedRegular.mergedTombstones);
      setRegularItems(mergedRegular.mergedItems);
      setServerRegularItems(JSON.parse(JSON.stringify(mergedRegular.mergedItems)));
      serverRegularItemsRef.current = mergedRegular.mergedItems;
      setRegularAmbiguities(mergedRegular.ambiguities);

      const localLogs = await localGetPurchaseLogs().catch(() => [] as PurchaseLogEntry[]);
      const mergedLogs = mergePurchaseLogs(localLogs, serverData.purchaseLogs);
      await localSetPurchaseLogs(mergedLogs);
      setPurchaseLogs(mergedLogs);

      setPrices(serverData.prices);

      if (serverData.syncMeta) {
        await setLastSyncTime(serverData.syncMeta.lastSavedTime);
        setLastSynced(new Date(serverData.syncMeta.lastSavedTime));
        setLastSavedBy(serverData.syncMeta.lastSavedBy || null);
      }

      markSynced(serverData.syncMeta?.lastSavedBy || undefined);
    } catch (err) {
      console.error("Failed to pull from server:", err);
    }
  }, [markSynced, groceryAmbiguities, regularAmbiguities]);

  const resolveConflict = useCallback(async (choice: "local" | "server") => {
    if (choice === "server") {
      // Use server version (discard local)
      await pullAndUpdate(true);
    } else {
      // Keep local changes (push to server)
      setSyncConflict(false); // Clear temporarily to allow pushing
      setSyncStatus("syncing");

      const flags = await getLocalDirtyFlags();
      const toFlush = new Set<DirtyFlag>();
      if (flags.grocery) toFlush.add("grocery");
      if (flags.regular) toFlush.add("regular");

      const result = await pushDirtyToServer(toFlush, undefined, true);
      if (result.success) {
        await setLocalDirtyFlags({ grocery: false, regular: false });
        setGroceryDirtyState(false);
        setRegularDirtyState(false);

        const freshGrocery = await localGetGroceryItems();
        const freshRegular = await localGetRegularItems();
        setServerGroceryItems(freshGrocery);
        setServerRegularItems(freshRegular);
        serverGroceryItemsRef.current = freshGrocery;
        serverRegularItemsRef.current = freshRegular;

        // Fetch server to align metadata (lastSync)
        const serverData = await fetchFromServer();
        if (serverData && serverData.syncMeta) {
          await setLastSyncTime(serverData.syncMeta.lastSavedTime);
        } else {
          await setLastSyncTime(Date.now());
        }

        setSyncConflict(false);
        markSynced(getDeviceName());
      } else {
        setSyncConflict(true); // Restore conflict if push failed
        setSyncStatus("offline");
      }
    }
  }, [pullAndUpdate, markSynced]);

  const resolveSingleAmbiguity = useCallback(async (listType: "grocery" | "regular", id: string, choice: "local" | "remote") => {
    if (listType === "grocery") {
      const amb = groceryAmbiguities.find(a => a.id === id);
      if (!amb) return;
      
      const chosenItem = choice === "local" ? amb.local : amb.remote;
      const isDeleteChoice = (choice === "local" && !amb.local && amb.localTombstone) ||
                             (choice === "remote" && !amb.remote && amb.remoteTombstone);

      if (isDeleteChoice) {
        await localRemoveGroceryItem(id);
        setGroceryItems(prev => prev.filter(i => i.id !== id));
      } else if (chosenItem) {
        const resolved = {
          ...chosenItem,
          updatedAt: Date.now(),
          updatedBy: getDeviceName(),
        };
        await localUpdateGroceryItem(resolved);
        await localDeleteGroceryTombstone(id);

        setGroceryItems(prev => {
          const index = prev.findIndex(i => i.id === id);
          if (index !== -1) {
            const next = [...prev];
            next[index] = resolved;
            return next;
          }
          return [...prev, resolved];
        });
      }

      setGroceryAmbiguities(prev => prev.filter(a => a.id !== id));
      await setLocalDirtyFlags({ grocery: true });
      setGroceryDirtyState(true);
    } else {
      const amb = regularAmbiguities.find(a => a.id === id);
      if (!amb) return;

      const chosenItem = choice === "local" ? amb.local : amb.remote;
      const isDeleteChoice = (choice === "local" && !amb.local && amb.localTombstone) ||
                             (choice === "remote" && !amb.remote && amb.remoteTombstone);

      if (isDeleteChoice) {
        await localRemoveRegularItem(id);
        setRegularItems(prev => prev.filter(i => i.id !== id));
      } else if (chosenItem) {
        const resolved = {
          ...chosenItem,
          updatedAt: Date.now(),
          updatedBy: getDeviceName(),
        };
        await localUpdateRegularItem(resolved);
        await localDeleteRegularTombstone(id);

        setRegularItems(prev => {
          const index = prev.findIndex(i => i.id === id);
          if (index !== -1) {
            const next = [...prev];
            next[index] = resolved;
            return next;
          }
          return [...prev, resolved];
        });
      }

      setRegularAmbiguities(prev => prev.filter(a => a.id !== id));
      await setLocalDirtyFlags({ regular: true });
      setRegularDirtyState(true);
    }
  }, [groceryAmbiguities, regularAmbiguities]);

  const resolveAllAmbiguities = useCallback(async (listType: "grocery" | "regular", choice: "local" | "remote") => {
    const list = listType === "grocery" ? groceryAmbiguities : regularAmbiguities;
    for (const amb of list) {
      await resolveSingleAmbiguity(listType, amb.id, choice);
    }
  }, [groceryAmbiguities, regularAmbiguities, resolveSingleAmbiguity]);

  // Load from IndexedDB on mount, then do initial server reconciliation
  useEffect(() => {
    async function init() {
      let localGrocery: GroceryItem[] = [];
      let localRegular: RegularItem[] = [];
      let localLogs: PurchaseLogEntry[] = [];
      let localGroceryTombstones: Tombstone[] = [];
      let localRegularTombstones: Tombstone[] = [];
      let flags = { grocery: false, regular: false };

      try {
        localGrocery = await localGetGroceryItems();
        localRegular = await localGetRegularItems();
        localLogs = await localGetPurchaseLogs();
        localGroceryTombstones = await localGetGroceryTombstones();
        localRegularTombstones = await localGetRegularTombstones();
        flags = await getLocalDirtyFlags();
      } catch (err) {
        console.error("Failed to load local DB data on mount init:", err);
      }

      setGroceryItems(localGrocery);
      setRegularItems(localRegular);
      setPurchaseLogs(localLogs);
      setGroceryDirtyState(flags.grocery);
      setRegularDirtyState(flags.regular);
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

        // Always set prices on successful fetch
        setPrices(serverData.prices);

        const mergedGrocery = mergeLists(localGrocery, localGroceryTombstones, serverData.groceryItems, serverData.groceryTombstones);
        const mergedRegular = mergeLists(localRegular, localRegularTombstones, serverData.regularItems, serverData.regularTombstones, true);

        await localSetGroceryItems(mergedGrocery.mergedItems);
        await localSetGroceryTombstones(mergedGrocery.mergedTombstones);
        setGroceryItems(mergedGrocery.mergedItems);
        setServerGroceryItems(JSON.parse(JSON.stringify(mergedGrocery.mergedItems)));
        serverGroceryItemsRef.current = mergedGrocery.mergedItems;
        setGroceryAmbiguities(mergedGrocery.ambiguities);

        await localSetRegularItems(mergedRegular.mergedItems);
        await localSetRegularTombstones(mergedRegular.mergedTombstones);
        setRegularItems(mergedRegular.mergedItems);
        setServerRegularItems(JSON.parse(JSON.stringify(mergedRegular.mergedItems)));
        serverRegularItemsRef.current = mergedRegular.mergedItems;
        setRegularAmbiguities(mergedRegular.ambiguities);

        const mergedLogs = mergePurchaseLogs(localLogs, serverData.purchaseLogs);
        await localSetPurchaseLogs(mergedLogs);
        setPurchaseLogs(mergedLogs);

        if (serverData.syncMeta) {
          await setLastSyncTime(serverData.syncMeta.lastSavedTime);
          setLastSynced(new Date(serverData.syncMeta.lastSavedTime));
          setLastSavedBy(serverData.syncMeta.lastSavedBy || null);
          setSyncStatus("synced");
        } else {
          setSyncStatus("synced");
        }
        markSynced(serverData.syncMeta?.lastSavedBy || undefined);
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
      if (syncConflict) return;
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
  }, [pullAndUpdate, saveChanges, hasPendingChanges, syncConflict]);

  // Auto-save changes with a debounce of 1.5 seconds if auto-save is enabled
  useEffect(() => {
    if (!hasPendingChanges) return;
    if (!navigator.onLine) return;
    if (!getAutoSaveEnabled()) return;
    if (syncConflict) return;

    const timer = setTimeout(() => {
      console.log("Auto-saving pending changes to server...");
      saveChanges();
    }, 1500);

    return () => clearTimeout(timer);
  }, [hasPendingChanges, saveChanges, syncConflict]);

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

  const addGroceryItem = useCallback(async (name: string, quantity: number, unit: string, category?: string, units?: number): Promise<GroceryItem> => {
    const existing = await localGetGroceryItems();
    const normalizedName = name.toLowerCase().trim();
    const existingItem = existing.find((i) => i.name.toLowerCase().trim() === normalizedName);

    if (existingItem) {
      const newQty = (existingItem.quantity || 1) + quantity;
      await localUpdateGroceryItemQuantity(existingItem.id, newQty);
      const updatedItem = { ...existingItem, quantity: newQty };
      setGroceryItems((prev) => prev.map((i) => (i.id === existingItem.id ? updatedItem : i)));
      markDirty("grocery");
      return updatedItem;
    }

    const newItem: GroceryItem = {
      id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      name,
      category: category || "Pantry Staples",
      quantity,
      unit,
      units,
      checked: false,
      prices: [],
      bestPrice: undefined,
      createdAt: new Date().toISOString(),
    };

    // Attempt to enrich item with existing prices client-side if available
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
            
            const existingStore = mergedStorePricesMap.get(storeId);
            if (!existingStore || priceVal < existingStore.price) {
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
          const existingStore = mergedStorePricesMap.get(storeId);
          if (!existingStore || priceVal < existingStore.price) {
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
    return newItem;
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

  const clearCheckedGroceryItems = useCallback(async (storeId: string, storeName: string) => {
    const checked = groceryItems.filter((i) => i.checked);
    if (checked.length > 0) {
      const newLogs: PurchaseLogEntry[] = checked.map((item) => {
        const normalizedName = item.name.toLowerCase().trim();
        const priceInfo = prices[normalizedName] || (Object.values(prices) as PriceEntry[]).find((p) =>
          p && (
            (p.item_name && p.item_name.toLowerCase() === normalizedName) ||
            (p.config_name && p.config_name.toLowerCase() === normalizedName)
          )
        );

        let paidPrice: number | null = null;
        let regularPrice: number | null = null;
        let salePrice: number | null = null;
        let wasOnSale = false;
        let validUntil: string | null = null;
        const priceSnapshot: PriceSnapshotEntry[] = [];

        if (priceInfo) {
          // Resolve snapshot for all competitor stores
          if (priceInfo.stores && typeof priceInfo.stores === "object") {
            for (const [sId, sInfo] of Object.entries(priceInfo.stores) as [string, any][]) {
              const activeP = getStoreActivePrice(sInfo);
              const regP = sInfo.regular_price || activeP || null;
              priceSnapshot.push({
                storeId: sId,
                storeName: sInfo.store_name || getStoreDisplayName(sId),
                activePrice: activeP,
                regularPrice: regP,
              });
            }
          } else {
            const activeP = getStoreActivePrice(priceInfo);
            const regP = priceInfo.regular_price || activeP || null;
            const sId = priceInfo.store_id || "foodbasics";
            priceSnapshot.push({
              storeId: sId,
              storeName: priceInfo.store_name || getStoreDisplayName(sId),
              activePrice: activeP,
              regularPrice: regP,
            });
          }

          // Resolve Shopping At store prices
          const currentStoreKey = normalizeStoreKey(storeId);
          const currentStoreInfo = priceInfo.stores?.[currentStoreKey];
          if (currentStoreInfo) {
            paidPrice = getStoreActivePrice(currentStoreInfo);
            regularPrice = currentStoreInfo.regular_price || paidPrice;
            if (currentStoreInfo.is_on_sale) {
              salePrice = currentStoreInfo.sale_price || null;
              wasOnSale = true;
              validUntil = currentStoreInfo.valid_until || null;
            }
          }
        }

        return {
          id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          timestamp: new Date().toISOString(),
          itemId: item.id,
          name: item.name,
          category: item.category,
          quantity: item.quantity,
          unit: item.unit,
          units: item.units,
          storeId,
          storeName,
          price: paidPrice, // legacy field, matches paidPrice
          paidPrice,
          regularPrice,
          salePrice,
          wasOnSale,
          validUntil,
          priceSnapshot,
        };
      });

      await localAddPurchaseLogs(newLogs);
      setPurchaseLogs((prev) => [...prev, ...newLogs]);
      markDirty("purchaseLogs");
    }

    setGroceryItems((prev) => prev.filter((i) => !i.checked));
    await localClearCheckedGroceryItems();
    markDirty("grocery");
  }, [groceryItems, prices, markDirty]);

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
    syncConflict,
    resolveConflict,
    groceryAmbiguities,
    regularAmbiguities,
    resolveSingleAmbiguity,
    resolveAllAmbiguities,
  };
}
