import { GroceryItem, RegularItem, SyncMetadata, PriceData, PurchaseLogEntry } from "../types";
import {
  localGetGroceryItems,
  localSetGroceryItems,
  localGetRegularItems,
  localSetRegularItems,
  localGetPurchaseLogs,
  localSetPurchaseLogs,
  setLastSyncTime,
} from "./local-db";
import { getDeviceName } from "./device-name";

export type SyncStatus = "synced" | "syncing" | "offline" | "error";
export type DirtyFlag = "grocery" | "regular" | "purchaseLogs";

const FETCH_TIMEOUT = 10000;

function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

  return fetch(input, { ...init, signal: controller.signal }).finally(() =>
    clearTimeout(timeout)
  );
}

export async function pushDirtyToServer(
  dirty: Set<DirtyFlag>,
  lastSyncTime?: number,
  forceOverwrite?: boolean
): Promise<{ success: boolean; conflict?: boolean }> {
  if (!navigator.onLine || dirty.size === 0) {
    return { success: dirty.size === 0 };
  }

  try {
    const payload: Record<string, unknown> = {
      deviceName: getDeviceName(),
    };

    const hasListItems = dirty.has("grocery") || dirty.has("regular");

    if (dirty.has("grocery")) {
      payload.groceryItems = await localGetGroceryItems();
    }
    if (dirty.has("regular")) {
      payload.regularItems = await localGetRegularItems();
    }
    if (dirty.has("purchaseLogs")) {
      payload.purchaseLogs = await localGetPurchaseLogs();
    }

    if (hasListItems) {
      if (lastSyncTime !== undefined) {
        payload.basedOnLastSavedTime = lastSyncTime;
      }
      if (forceOverwrite !== undefined) {
        payload.forceOverwrite = forceOverwrite;
      }
    }

    const res = await fetchWithTimeout("/api/sync", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.status === 409) {
      return { success: false, conflict: true };
    }

    if (!res.ok) {
      try {
        const bodyText = await res.text();
        console.error(`PUT /api/sync failed: status = ${res.status}, body = ${bodyText}`);
      } catch (err) {
        console.error(`PUT /api/sync failed: status = ${res.status} (unable to read body: ${err})`);
      }
      return { success: false };
    }

    await setLastSyncTime(Date.now());
    return { success: true };
  } catch (err) {
    console.error("PUT /api/sync encountered an exception:", err);
    return { success: false };
  }
}

export async function syncAllToServer(): Promise<{ success: boolean }> {
  return pushDirtyToServer(new Set(["grocery", "regular", "purchaseLogs"]));
}

export interface PullResult {
  groceryItems: GroceryItem[];
  regularItems: RegularItem[];
  syncMeta: SyncMetadata | null;
  prices: PriceData;
  purchaseLogs: PurchaseLogEntry[];
}

export async function fetchFromServer(): Promise<PullResult | null> {
  if (!navigator.onLine) return null;

  try {
    const res = await fetchWithTimeout("/api/sync");
    if (!res.ok) return null;

    const data = await res.json();
    const groceryItems: GroceryItem[] = data.groceryItems || [];
    const regularItems: RegularItem[] = data.regularItems || [];
    const syncMeta: SyncMetadata | null = data.syncMeta || null;
    const prices: PriceData = data.prices || {};
    const purchaseLogs: PurchaseLogEntry[] = data.purchaseLogs || [];

    return { groceryItems, regularItems, syncMeta, prices, purchaseLogs };
  } catch (err) {
    console.error("Failed to fetch from server:", err);
    return null;
  }
}

export async function pullFromServer(): Promise<PullResult | null> {
  const result = await fetchFromServer();
  if (!result) return null;

  try {
    await localSetGroceryItems(result.groceryItems);
  } catch (err) {
    console.warn("Failed to write groceryItems to local IndexedDB:", err);
  }

  try {
    await localSetRegularItems(result.regularItems);
  } catch (err) {
    console.warn("Failed to write regularItems to local IndexedDB:", err);
  }

  try {
    await localSetPurchaseLogs(result.purchaseLogs);
  } catch (err) {
    console.warn("Failed to write purchaseLogs to local IndexedDB:", err);
  }

  try {
    await setLastSyncTime(Date.now());
  } catch (err) {
    console.warn("Failed to update last sync time in local IndexedDB:", err);
  }

  return result;
}

