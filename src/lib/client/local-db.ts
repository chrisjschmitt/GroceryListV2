import { openDB, IDBPDatabase } from "idb";
import { GroceryItem, RegularItem, PurchaseLogEntry, Tombstone } from "../types";
import { getDeviceName } from "./device-name";

const DB_NAME = "grocerylist";
const DB_VERSION = 3;

export interface LocalDB {
  groceryItems: GroceryItem[];
  regularItems: RegularItem[];
  purchaseLogs: PurchaseLogEntry[];
  groceryTombstones: Tombstone[];
  regularTombstones: Tombstone[];
}

let dbPromise: Promise<IDBPDatabase> | null = null;

function getLocalDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("groceryItems")) {
          db.createObjectStore("groceryItems", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("regularItems")) {
          db.createObjectStore("regularItems", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("meta")) {
          db.createObjectStore("meta", { keyPath: "key" });
        }
        if (!db.objectStoreNames.contains("purchaseLogs")) {
          db.createObjectStore("purchaseLogs", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("groceryTombstones")) {
          db.createObjectStore("groceryTombstones", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("regularTombstones")) {
          db.createObjectStore("regularTombstones", { keyPath: "id" });
        }
      },
    }).then((db) => {
      db.addEventListener("versionchange", () => {
        db.close();
        dbPromise = null;
      });
      return db;
    });
  }
  return dbPromise;
}

// Grocery Items
export async function localGetGroceryItems(): Promise<GroceryItem[]> {
  const db = await getLocalDb();
  return db.getAll("groceryItems");
}

export async function localSetGroceryItems(items: GroceryItem[]): Promise<void> {
  const db = await getLocalDb();
  const tx = db.transaction("groceryItems", "readwrite");
  await tx.store.clear();
  for (const item of items) {
    await tx.store.put(item);
  }
  await tx.done;
}

export async function localAddGroceryItem(item: GroceryItem): Promise<void> {
  const db = await getLocalDb();
  item.updatedAt = item.updatedAt || Date.now();
  item.updatedBy = item.updatedBy || getDeviceName();
  await db.put("groceryItems", item);
}

export async function localUpdateGroceryItem(item: GroceryItem): Promise<void> {
  const db = await getLocalDb();
  item.updatedAt = item.updatedAt || Date.now();
  item.updatedBy = item.updatedBy || getDeviceName();
  await db.put("groceryItems", item);
}

export async function localRemoveGroceryItem(id: string): Promise<void> {
  const db = await getLocalDb();
  await db.delete("groceryItems", id);
  await db.put("groceryTombstones", { id, deletedAt: Date.now(), deletedBy: getDeviceName() });
}

export async function localClearCheckedGroceryItems(): Promise<void> {
  const db = await getLocalDb();
  const items = await db.getAll("groceryItems");
  const tx = db.transaction(["groceryItems", "groceryTombstones"], "readwrite");
  const groceryStore = tx.objectStore("groceryItems");
  const tombstoneStore = tx.objectStore("groceryTombstones");
  const now = Date.now();
  const device = getDeviceName();
  for (const item of items) {
    if (item.checked) {
      await groceryStore.delete(item.id);
      await tombstoneStore.put({ id: item.id, deletedAt: now, deletedBy: device });
    }
  }
  await tx.done;
}

export async function localClearAllGroceryItems(): Promise<void> {
  const db = await getLocalDb();
  const items = await db.getAll("groceryItems");
  const tx = db.transaction(["groceryItems", "groceryTombstones"], "readwrite");
  const groceryStore = tx.objectStore("groceryItems");
  const tombstoneStore = tx.objectStore("groceryTombstones");
  const now = Date.now();
  const device = getDeviceName();
  for (const item of items) {
    await tombstoneStore.put({ id: item.id, deletedAt: now, deletedBy: device });
  }
  await groceryStore.clear();
  await tx.done;
}

// Regular Items
export async function localGetRegularItems(): Promise<RegularItem[]> {
  const db = await getLocalDb();
  return db.getAll("regularItems");
}

export async function localSetRegularItems(items: RegularItem[]): Promise<void> {
  const db = await getLocalDb();
  const tx = db.transaction("regularItems", "readwrite");
  await tx.store.clear();
  for (const item of items) {
    await tx.store.put(item);
  }
  await tx.done;
}

export async function localUpdateRegularItem(item: RegularItem): Promise<void> {
  const db = await getLocalDb();
  item.updatedAt = item.updatedAt || Date.now();
  item.updatedBy = item.updatedBy || getDeviceName();
  await db.put("regularItems", item);
}

export async function localRemoveRegularItem(id: string): Promise<void> {
  const db = await getLocalDb();
  await db.delete("regularItems", id);
  await db.put("regularTombstones", { id, deletedAt: Date.now(), deletedBy: getDeviceName() });
}

export async function localClearRegularItems(): Promise<void> {
  const db = await getLocalDb();
  const items = await db.getAll("regularItems");
  const tx = db.transaction(["regularItems", "regularTombstones"], "readwrite");
  const regularStore = tx.objectStore("regularItems");
  const tombstoneStore = tx.objectStore("regularTombstones");
  const now = Date.now();
  const device = getDeviceName();
  for (const item of items) {
    await tombstoneStore.put({ id: item.id, deletedAt: now, deletedBy: device });
  }
  await regularStore.clear();
  await tx.done;
}

// Sync metadata
export async function getLastSyncTime(): Promise<number> {
  const db = await getLocalDb();
  const meta = await db.get("meta", "lastSync");
  return meta?.value || 0;
}

export async function setLastSyncTime(time: number): Promise<void> {
  const db = await getLocalDb();
  await db.put("meta", { key: "lastSync", value: time });
}

export async function getLocalDirtyFlags(): Promise<{ grocery: boolean; regular: boolean }> {
  const db = await getLocalDb();
  const grocery = await db.get("meta", "groceryDirty");
  const regular = await db.get("meta", "regularDirty");
  return {
    grocery: !!grocery?.value,
    regular: !!regular?.value,
  };
}

export async function setLocalDirtyFlags(flags: { grocery?: boolean; regular?: boolean }): Promise<void> {
  const db = await getLocalDb();
  const tx = db.transaction("meta", "readwrite");
  if (flags.grocery !== undefined) {
    await tx.store.put({ key: "groceryDirty", value: flags.grocery });
  }
  if (flags.regular !== undefined) {
    await tx.store.put({ key: "regularDirty", value: flags.regular });
  }
  await tx.done;
}

// Purchase Logs
export async function localGetPurchaseLogs(): Promise<PurchaseLogEntry[]> {
  const db = await getLocalDb();
  return db.getAll("purchaseLogs");
}

export async function localSetPurchaseLogs(logs: PurchaseLogEntry[]): Promise<void> {
  const db = await getLocalDb();
  const tx = db.transaction("purchaseLogs", "readwrite");
  await tx.store.clear();
  for (const log of logs) {
    await tx.store.put(log);
  }
  await tx.done;
}

export async function localAddPurchaseLogs(newLogs: PurchaseLogEntry[]): Promise<void> {
  const db = await getLocalDb();
  const tx = db.transaction("purchaseLogs", "readwrite");
  for (const log of newLogs) {
    await tx.store.put(log);
  }
  await tx.done;
}

export async function localToggleGroceryItem(id: string, targetChecked: boolean): Promise<void> {
  const db = await getLocalDb();
  const tx = db.transaction("groceryItems", "readwrite");
  const item = await tx.store.get(id);
  if (item) {
    item.checked = targetChecked;
    item.updatedAt = Date.now();
    item.updatedBy = getDeviceName();
    await tx.store.put(item);
  }
  await tx.done;
}

export async function localUpdateGroceryItemQuantity(id: string, targetQuantity: number): Promise<void> {
  const db = await getLocalDb();
  const tx = db.transaction("groceryItems", "readwrite");
  const item = await tx.store.get(id);
  if (item) {
    item.quantity = targetQuantity;
    item.updatedAt = Date.now();
    item.updatedBy = getDeviceName();
    await tx.store.put(item);
  }
  await tx.done;
}

export async function localToggleRegularItem(id: string, targetSelected: boolean): Promise<void> {
  const db = await getLocalDb();
  const tx = db.transaction("regularItems", "readwrite");
  const item = await tx.store.get(id);
  if (item) {
    item.selected = targetSelected;
    item.updatedAt = Date.now();
    item.updatedBy = getDeviceName();
    await tx.store.put(item);
  }
  await tx.done;
}

// Tombstone Local Accessors
export async function localGetGroceryTombstones(): Promise<Tombstone[]> {
  const db = await getLocalDb();
  return db.getAll("groceryTombstones");
}

export async function localSetGroceryTombstones(tombstones: Tombstone[]): Promise<void> {
  const db = await getLocalDb();
  const tx = db.transaction("groceryTombstones", "readwrite");
  await tx.store.clear();
  for (const t of tombstones) {
    await tx.store.put(t);
  }
  await tx.done;
}

export async function localAddGroceryTombstone(tombstone: Tombstone): Promise<void> {
  const db = await getLocalDb();
  await db.put("groceryTombstones", tombstone);
}

export async function localGetRegularTombstones(): Promise<Tombstone[]> {
  const db = await getLocalDb();
  return db.getAll("regularTombstones");
}

export async function localSetRegularTombstones(tombstones: Tombstone[]): Promise<void> {
  const db = await getLocalDb();
  const tx = db.transaction("regularTombstones", "readwrite");
  await tx.store.clear();
  for (const t of tombstones) {
    await tx.store.put(t);
  }
  await tx.done;
}

export async function localAddRegularTombstone(tombstone: Tombstone): Promise<void> {
  const db = await getLocalDb();
  await db.put("regularTombstones", tombstone);
}

export async function localDeleteGroceryTombstone(id: string): Promise<void> {
  const db = await getLocalDb();
  await db.delete("groceryTombstones", id);
}

export async function localDeleteRegularTombstone(id: string): Promise<void> {
  const db = await getLocalDb();
  await db.delete("regularTombstones", id);
}
