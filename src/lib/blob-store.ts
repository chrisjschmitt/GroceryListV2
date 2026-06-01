import { put, list } from "@vercel/blob";
import { GroceryItem, RegularItem, SyncMetadata, PriceData, ScrapeConfig } from "./types.js";
import fs from "fs";
import path from "path";

const GROCERY_BLOB = "grocerylist/grocery-items.json";
const REGULAR_BLOB = "grocerylist/regular-items.json";
const SYNC_META_BLOB = "grocerylist/sync-meta.json";
const PRICES_BLOB = "grocerylist/prices.json";
const SCRAPE_CONFIG_BLOB = "grocerylist/scrape-config.json";

// We keep a local database file structure in case no BLOB_READ_WRITE_TOKEN is defined.
const isServerless = !!(process.env.VERCEL || process.env.NODE_ENV === "production");
const LOCAL_DIR = isServerless
  ? path.join("/tmp", "db-storage")
  : path.join(process.cwd(), "db-storage");

function getLocalPath(pathname: string): string {
  if (!fs.existsSync(LOCAL_DIR)) {
    fs.mkdirSync(LOCAL_DIR, { recursive: true });
  }
  // Sanitize name for filenames
  const safeName = pathname.replace(/\//g, "-");
  return path.join(LOCAL_DIR, safeName);
}

const hasVercelBlob = () => !!process.env.BLOB_READ_WRITE_TOKEN;

async function readBlob<T>(pathname: string, fallback: T): Promise<T> {
  if (hasVercelBlob()) {
    try {
      const { blobs } = await list();
      const normalize = (p: string) => p.replace(/^\//, "").toLowerCase();
      const targetPath = normalize(pathname);
      const blob = blobs.find((b) => normalize(b.pathname) === targetPath);
      if (!blob) return fallback;

      const response = await fetch(blob.url);
      if (!response.ok) return fallback;
      const text = await response.text();
      return JSON.parse(text) as T;
    } catch (err) {
      console.warn("Vercel Blob read error, using local fallback", err);
    }
  }

  // File system fallback
  try {
    const localPath = getLocalPath(pathname);
    if (!fs.existsSync(localPath)) {
      return fallback;
    }
    const data = fs.readFileSync(localPath, "utf8");
    return JSON.parse(data) as T;
  } catch (err) {
    console.error("Local file read error", err);
    return fallback;
  }
}

async function writeBlob<T>(pathname: string, data: T): Promise<void> {
  if (hasVercelBlob()) {
    try {
      await put(pathname, JSON.stringify(data), {
        access: "public",
        addRandomSuffix: false,
        contentType: "application/json",
      });
      return;
    } catch (err) {
      console.warn("Vercel Blob write error, writing locally instead. Details:", err);
    }
  }

  // File system fallback
  try {
    const localPath = getLocalPath(pathname);
    fs.writeFileSync(localPath, JSON.stringify(data, null, 2), "utf8");
  } catch (err) {
    console.error("Local file write error", err);
  }
}

export async function getBlobDiagnostics(): Promise<Record<string, any>> {
  const diagnostics: Record<string, any> = {
    hasTokenEnv: !!process.env.BLOB_READ_WRITE_TOKEN,
    tokenPrefix: process.env.BLOB_READ_WRITE_TOKEN 
      ? process.env.BLOB_READ_WRITE_TOKEN.substring(0, 10) + "..." 
      : "none",
    nodeEnv: process.env.NODE_ENV || "development",
  };

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      const listResult = await list();
      diagnostics.blobListSuccess = true;
      diagnostics.blobCount = listResult.blobs.length;
      diagnostics.blobs = listResult.blobs.map((b) => ({
        pathname: b.pathname,
        size: b.size,
        url: b.url,
      }));
    } catch (err: any) {
      diagnostics.blobListSuccess = false;
      diagnostics.blobListError = err?.message || String(err);
    }

    try {
      const testPathname = "grocerylist/diagnostics-test.json";
      await put(testPathname, JSON.stringify({ testedAt: Date.now() }), {
        access: "public",
        addRandomSuffix: false,
        contentType: "application/json",
      });
      diagnostics.blobWriteSuccess = true;
    } catch (err: any) {
      diagnostics.blobWriteSuccess = false;
      diagnostics.blobWriteError = err?.message || String(err);
    }
  } else {
    diagnostics.message = "BLOB_READ_WRITE_TOKEN is not defined in process.env. Falling back to local local-db.";
  }

  return diagnostics;
}

export async function blobGetGroceryItems(): Promise<GroceryItem[]> {
  return readBlob<GroceryItem[]>(GROCERY_BLOB, []);
}

export async function blobSetGroceryItems(items: GroceryItem[]): Promise<void> {
  await writeBlob(GROCERY_BLOB, items);
}

export async function blobGetRegularItems(): Promise<RegularItem[]> {
  return readBlob<RegularItem[]>(REGULAR_BLOB, []);
}

export async function blobSetRegularItems(items: RegularItem[]): Promise<void> {
  await writeBlob(REGULAR_BLOB, items);
}

export async function blobGetSyncMeta(): Promise<SyncMetadata | null> {
  return readBlob<SyncMetadata | null>(SYNC_META_BLOB, null);
}

export async function blobSetSyncMeta(meta: SyncMetadata): Promise<void> {
  await writeBlob(SYNC_META_BLOB, meta);
}

export async function blobUpdateSyncMeta(deviceName: string): Promise<SyncMetadata> {
  const meta: SyncMetadata = {
    lastSavedBy: deviceName,
    lastSavedTime: Date.now(),
  };
  await blobSetSyncMeta(meta);
  return meta;
}

export async function blobGetPrices(): Promise<PriceData> {
  return readBlob<PriceData>(PRICES_BLOB, {});
}

export function migrateScrapeConfig(config: any): ScrapeConfig {
  const migrated: ScrapeConfig = {
    stores: {},
    items: [],
  };

  if (!config) return migrated;

  // 1. Migrate stores
  if (config.stores && typeof config.stores === "object") {
    for (const [storeKey, storeVal] of Object.entries(config.stores)) {
      if (!storeVal || typeof storeVal !== "object") continue;
      const s = storeVal as any;
      migrated.stores[storeKey] = {
        enabled: typeof s.enabled === "boolean" ? s.enabled : true,
        store_name: s.store_name || storeKey,
        base_url: s.base_url || "",
        postal_code: s.postal_code || "",
        store_id: s.store_id || "",
      };

      // Extract legacy nested store items
      if (Array.isArray(s.items)) {
        s.items.forEach((item: any) => {
          if (!item || typeof item !== "object") return;
          const canonicalName = item.name;
          if (!canonicalName) return;
          const upc = item.upc || item.sku || "";
          const url = item.url || "";

          let existing = migrated.items.find((i) => i.name.toLowerCase() === canonicalName.toLowerCase());
          if (!existing) {
            existing = {
              name: canonicalName,
              stores: {},
            };
            migrated.items.push(existing);
          }
          existing.stores[storeKey] = {
            url,
            upc,
          };
        });
      }
    }
  }

  // 2. Load already unified items
  if (Array.isArray(config.items)) {
    config.items.forEach((item: any) => {
      if (!item || typeof item !== "object" || !item.name) return;
      let existing = migrated.items.find((i) => i.name.toLowerCase() === item.name.toLowerCase());
      if (!existing) {
        existing = {
          name: item.name,
          stores: {},
        };
        migrated.items.push(existing);
      }
      if (item.stores && typeof item.stores === "object") {
        for (const [storeKey, linkVal] of Object.entries(item.stores)) {
          if (!linkVal || typeof linkVal !== "object") continue;
          const lv = linkVal as any;
          existing.stores[storeKey] = {
            url: lv.url || "",
            upc: lv.upc || "",
          };
        }
      }
    });
  }

  // Ensure foodbasics exists as a store
  if (!migrated.stores.foodbasics) {
    migrated.stores.foodbasics = {
      enabled: true,
      store_name: "Food Basics",
      base_url: "https://www.foodbasics.ca",
      postal_code: "K7H3C6",
      store_id: "7923194",
    };
  }

  return migrated;
}

export async function blobGetScrapeConfig(): Promise<ScrapeConfig> {
  const config = await readBlob<any>(SCRAPE_CONFIG_BLOB, { stores: {} });
  return migrateScrapeConfig(config);
}

export async function blobSetScrapeConfig(config: ScrapeConfig): Promise<void> {
  await writeBlob(SCRAPE_CONFIG_BLOB, config);
}
