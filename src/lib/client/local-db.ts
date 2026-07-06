import { openDB, IDBPDatabase } from "idb";
import { GroceryItem, RegularItem, PurchaseLogEntry } from "../types";

const DB_NAME = "grocerylist";
const DB_VERSION = 2;

export interface LocalDB {
  groceryItems: GroceryItem[];
  regularItems: RegularItem[];
  purchaseLogs: PurchaseLogEntry[];
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
  await db.put("groceryItems", item);
}

export async function localUpdateGroceryItem(item: GroceryItem): Promise<void> {
  const db = await getLocalDb();
  await db.put("groceryItems", item);
}

export async function localRemoveGroceryItem(id: string): Promise<void> {
  const db = await getLocalDb();
  await db.delete("groceryItems", id);
}

export async function localClearCheckedGroceryItems(): Promise<void> {
  const db = await getLocalDb();
  const items = await db.getAll("groceryItems");
  const tx = db.transaction("groceryItems", "readwrite");
  for (const item of items) {
    if (item.checked) {
      await tx.store.delete(item.id);
    }
  }
  await tx.done;
}

export async function localClearAllGroceryItems(): Promise<void> {
  const db = await getLocalDb();
  const tx = db.transaction("groceryItems", "readwrite");
  await tx.store.clear();
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
  await db.put("regularItems", item);
}

export async function localRemoveRegularItem(id: string): Promise<void> {
  const db = await getLocalDb();
  await db.delete("regularItems", id);
}

export async function localClearRegularItems(): Promise<void> {
  const db = await getLocalDb();
  const tx = db.transaction("regularItems", "readwrite");
  await tx.store.clear();
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
    await tx.store.put(item);
  }
  await tx.done;
}

