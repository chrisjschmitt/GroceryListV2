import { GroceryItem, RegularItem, SyncMetadata, PriceData, PurchaseLogEntry, Tombstone } from "../types";
import {
  localGetGroceryItems,
  localSetGroceryItems,
  localGetRegularItems,
  localSetRegularItems,
  localGetPurchaseLogs,
  localSetPurchaseLogs,
  setLastSyncTime,
  localGetGroceryTombstones,
  localSetGroceryTombstones,
  localGetRegularTombstones,
  localSetRegularTombstones,
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

export interface PushResult {
  success: boolean;
  groceryItems?: GroceryItem[];
  groceryTombstones?: Tombstone[];
  groceryAmbiguities?: any[];
  regularItems?: RegularItem[];
  regularTombstones?: Tombstone[];
  regularAmbiguities?: any[];
  syncMeta?: SyncMetadata;
}

export async function pushDirtyToServer(
  dirty: Set<DirtyFlag>,
  lastSyncTime?: number,
  forceOverwrite?: boolean
): Promise<PushResult> {
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
      payload.groceryTombstones = await localGetGroceryTombstones();
    }
    if (dirty.has("regular")) {
      payload.regularItems = await localGetRegularItems();
      payload.regularTombstones = await localGetRegularTombstones();
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

    if (!res.ok) {
      try {
        const bodyText = await res.text();
        console.error(`PUT /api/sync failed: status = ${res.status}, body = ${bodyText}`);
      } catch (err) {
        console.error(`PUT /api/sync failed: status = ${res.status} (unable to read body: ${err})`);
      }
      return { success: false };
    }

    const data = await res.json();
    await setLastSyncTime(data.syncMeta?.lastSavedTime || Date.now());

    return {
      success: true,
      groceryItems: data.groceryItems,
      groceryTombstones: data.groceryTombstones,
      groceryAmbiguities: data.groceryAmbiguities,
      regularItems: data.regularItems,
      regularTombstones: data.regularTombstones,
      regularAmbiguities: data.regularAmbiguities,
      syncMeta: data.syncMeta,
    };
  } catch (err) {
    console.error("PUT /api/sync encountered an exception:", err);
    return { success: false };
  }
}

export async function syncAllToServer(): Promise<PushResult> {
  return pushDirtyToServer(new Set(["grocery", "regular", "purchaseLogs"]));
}

export interface PullResult {
  groceryItems: GroceryItem[];
  groceryTombstones: Tombstone[];
  regularItems: RegularItem[];
  regularTombstones: Tombstone[];
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
    const groceryTombstones: Tombstone[] = data.groceryTombstones || [];
    const regularItems: RegularItem[] = data.regularItems || [];
    const regularTombstones: Tombstone[] = data.regularTombstones || [];
    const syncMeta: SyncMetadata | null = data.syncMeta || null;
    const prices: PriceData = data.prices || {};
    const purchaseLogs: PurchaseLogEntry[] = data.purchaseLogs || [];

    return {
      groceryItems,
      groceryTombstones,
      regularItems,
      regularTombstones,
      syncMeta,
      prices,
      purchaseLogs,
    };
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
    await localSetGroceryTombstones(result.groceryTombstones);
  } catch (err) {
    console.warn("Failed to write groceryItems/tombstones to local IndexedDB:", err);
  }

  try {
    await localSetRegularItems(result.regularItems);
    await localSetRegularTombstones(result.regularTombstones);
  } catch (err) {
    console.warn("Failed to write regularItems/tombstones to local IndexedDB:", err);
  }

  try {
    await localSetPurchaseLogs(result.purchaseLogs);
  } catch (err) {
    console.warn("Failed to write purchaseLogs to local IndexedDB:", err);
  }

  try {
    await setLastSyncTime(result.syncMeta?.lastSavedTime || Date.now());
  } catch (err) {
    console.warn("Failed to update last sync time in local IndexedDB:", err);
  }

  return result;
}
