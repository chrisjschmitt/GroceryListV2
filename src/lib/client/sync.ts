import { GroceryItem, RegularItem, SyncMetadata, PriceData } from "../types";
import {
  localGetGroceryItems,
  localSetGroceryItems,
  localGetRegularItems,
  localSetRegularItems,
  setLastSyncTime,
} from "./local-db";
import { getDeviceName } from "./device-name";

export type SyncStatus = "synced" | "syncing" | "offline" | "error";
export type DirtyFlag = "grocery" | "regular";

const FETCH_TIMEOUT = 10000;

function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

  return fetch(input, { ...init, signal: controller.signal }).finally(() =>
    clearTimeout(timeout)
  );
}

export async function pushDirtyToServer(dirty: Set<DirtyFlag>): Promise<{ success: boolean }> {
  if (!navigator.onLine || dirty.size === 0) {
    return { success: dirty.size === 0 };
  }

  try {
    const payload: Record<string, unknown> = {
      deviceName: getDeviceName(),
    };

    if (dirty.has("grocery")) {
      payload.groceryItems = await localGetGroceryItems();
    }
    if (dirty.has("regular")) {
      payload.regularItems = await localGetRegularItems();
    }

    const res = await fetchWithTimeout("/api/sync", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) return { success: false };

    await setLastSyncTime(Date.now());
    return { success: true };
  } catch {
    return { success: false };
  }
}

export async function syncAllToServer(): Promise<{ success: boolean }> {
  return pushDirtyToServer(new Set(["grocery", "regular"]));
}

export interface PullResult {
  groceryItems: GroceryItem[];
  regularItems: RegularItem[];
  syncMeta: SyncMetadata | null;
  prices: PriceData;
}

export async function pullFromServer(): Promise<PullResult | null> {
  if (!navigator.onLine) return null;

  try {
    const res = await fetchWithTimeout("/api/sync");
    if (!res.ok) return null;

    const data = await res.json();
    const groceryItems: GroceryItem[] = data.groceryItems || [];
    const regularItems: RegularItem[] = data.regularItems || [];
    const syncMeta: SyncMetadata | null = data.syncMeta || null;
    const prices: PriceData = data.prices || {};

    await localSetGroceryItems(groceryItems);
    await localSetRegularItems(regularItems);
    await setLastSyncTime(Date.now());

    return { groceryItems, regularItems, syncMeta, prices };
  } catch {
    return null;
  }
}
