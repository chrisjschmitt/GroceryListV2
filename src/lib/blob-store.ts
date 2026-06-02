import { put, list } from "@vercel/blob";
import { GroceryItem, RegularItem, SyncMetadata, PriceData, ScrapeConfig, TelemetryEntry } from "./types.js";
import fs from "fs";
import path from "path";

const GROCERY_BLOB = "grocerylist/grocery-items.json";
const REGULAR_BLOB = "grocerylist/regular-items.json";
const SYNC_META_BLOB = "grocerylist/sync-meta.json";
const PRICES_BLOB = "grocerylist/prices.json";
const SCRAPE_CONFIG_BLOB = "grocerylist/scrape-config.json";
const TELEMETRY_BLOB = "grocerylist/telemetry.json";

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

      let response = await fetch(blob.url);
      if (!response.ok && process.env.BLOB_READ_WRITE_TOKEN) {
        response = await fetch(blob.url, {
          headers: {
            Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}`,
          },
        });
      }
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
      try {
        await put(pathname, JSON.stringify(data), {
          access: "public",
          addRandomSuffix: false,
          allowOverwrite: true,
          contentType: "application/json",
        });
        return;
      } catch (err: any) {
        const errMsg = String(err?.message || err || "").toLowerCase();
        if (errMsg.includes("private store") || errMsg.includes("private access") || errMsg.includes("private")) {
          await put(pathname, JSON.stringify(data), {
            access: "private",
            addRandomSuffix: false,
            allowOverwrite: true,
            contentType: "application/json",
          });
          return;
        }
        throw err;
      }
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
      try {
        await put(testPathname, JSON.stringify({ testedAt: Date.now() }), {
          access: "public",
          addRandomSuffix: false,
          allowOverwrite: true,
          contentType: "application/json",
        });
      } catch (err: any) {
        const errMsg = String(err?.message || err || "").toLowerCase();
        if (errMsg.includes("private store") || errMsg.includes("private access") || errMsg.includes("private")) {
          await put(testPathname, JSON.stringify({ testedAt: Date.now() }), {
            access: "private",
            addRandomSuffix: false,
            allowOverwrite: true,
            contentType: "application/json",
          });
        } else {
          throw err;
        }
      }
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

export async function blobSetPrices(prices: PriceData): Promise<void> {
  await writeBlob(PRICES_BLOB, prices);
}

export async function blobGetTelemetry(): Promise<TelemetryEntry[]> {
  return readBlob<TelemetryEntry[]>(TELEMETRY_BLOB, []);
}

export async function blobSetTelemetry(telemetry: TelemetryEntry[]): Promise<void> {
  await writeBlob(TELEMETRY_BLOB, telemetry);
}

export async function blobAppendTelemetry(entry: TelemetryEntry): Promise<void> {
  const telemetry = await blobGetTelemetry();
  telemetry.push(entry);
  // Keep the telemetry log size bounded to a maximum of 1000 items
  const sliced = telemetry.slice(-1000);
  await blobSetTelemetry(sliced);
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
  let config = await readBlob<any>(SCRAPE_CONFIG_BLOB, null);
  if (!config || !config.items || config.items.length === 0) {
    // Attempt to seed from local cached prices to prevent empty config states on restart
    console.log("Empty scrape configuration detected. Attempting to seed from grocerylist-prices.json...");
    try {
      const prices = await readBlob<Record<string, any>>(PRICES_BLOB, {});
      const itemsList: any[] = [];
      for (const [upc, p] of Object.entries(prices)) {
        if (p && typeof p === "object" && (p as any).lookup_url && (p as any).config_name) {
          itemsList.push({
            name: (p as any).config_name,
            stores: {
              foodbasics: {
                url: (p as any).lookup_url,
                upc: upc
              }
            }
          });
        }
      }
      if (itemsList.length > 0) {
        config = {
          stores: {
            foodbasics: {
              enabled: true,
              store_name: "Food Basics",
              base_url: "https://www.foodbasics.ca",
              postal_code: "K7H3C6",
              store_id: "7923194",
            }
          },
          items: itemsList
        };
        // Save back so it persists on subsequent re-runs and API gets
        await writeBlob(SCRAPE_CONFIG_BLOB, config);
        console.log(`Seeded ${itemsList.length} items to scrape-config from history cache!`);
      }
    } catch (err) {
      console.error("Failed to seed scrape config from prices cache:", err);
    }
  }
  
  if (!config) {
    config = { stores: {} };
  }
  return migrateScrapeConfig(config);
}

export async function blobSetScrapeConfig(config: ScrapeConfig): Promise<void> {
  await writeBlob(SCRAPE_CONFIG_BLOB, config);
}

export async function checkForLocalPricesJsonAndImport(): Promise<void> {
  const rootPricesPath = path.join(process.cwd(), "prices.json");
  const rootGroceryPricesPath = path.join(process.cwd(), "grocery_prices.json");

  let parsedData: any = null;
  let sourceFile = "";

  // 1. Check prices.json first
  if (fs.existsSync(rootPricesPath)) {
    try {
      const content = fs.readFileSync(rootPricesPath, "utf8").trim();
      if (content && content !== "{}" && content !== "[]") {
        parsedData = JSON.parse(content);
        sourceFile = "prices.json";
      }
    } catch (err) {
      console.error("Failed to read/parse root prices.json:", err);
    }
  }

  // 2. Check grocery_prices.json if prices.json is empty/missing
  if (!parsedData && fs.existsSync(rootGroceryPricesPath)) {
    try {
      const content = fs.readFileSync(rootGroceryPricesPath, "utf8").trim();
      if (content && content !== "{}" && content !== "[]") {
        parsedData = JSON.parse(content);
        sourceFile = "grocery_prices.json";
      }
    } catch (err) {
      console.error("Failed to read/parse root grocery_prices.json:", err);
    }
  }

  if (parsedData && typeof parsedData === "object") {
    console.log(`▶ Detected non-empty root ${sourceFile}! Preloading/merging pricing registry into live database...`);
    try {
      const existingPrices = await blobGetPrices();
      let count = 0;
      const standardized: Record<string, any> = {};

      if (Array.isArray(parsedData)) {
        parsedData.forEach((item: any) => {
          const upc = item.upc || item.sku || item.id || `manual-${Date.now()}-${count}`;
          standardized[upc] = {
            item_name: item.item_name || item.name || "",
            config_name: item.config_name || item.name || "",
            store_name: item.store_name || "Food Basics",
            postal_code: item.postal_code || "K7H3C6",
            store_id: item.store_id || "7923194",
            regular_price: typeof item.regular_price === "number" ? item.regular_price : parseFloat(item.regular_price || item.regularPrice || "0") || null,
            sale_price: typeof item.sale_price === "number" ? item.sale_price : parseFloat(item.sale_price || item.salePrice) || null,
            is_on_sale: item.is_on_sale !== undefined ? (item.is_on_sale ? 1 : 0) : (item.sale_price ? 1 : 0),
            last_updated: item.last_updated || new Date().toISOString(),
            lookup_url: item.lookup_url || item.url || "",
          };
          count++;
        });
      } else {
        for (const [key, item] of Object.entries(parsedData)) {
          if (item && typeof item === "object") {
            const rawItem = item as any;
            standardized[key] = {
              item_name: rawItem.item_name || rawItem.name || "",
              config_name: rawItem.config_name || rawItem.name || "",
              store_name: rawItem.store_name || "Food Basics",
              postal_code: rawItem.postal_code || "K7H3C6",
              store_id: rawItem.store_id || "7923194",
              regular_price: typeof rawItem.regular_price === "number" ? rawItem.regular_price : parseFloat(rawItem.regular_price || rawItem.regularPrice || "0") || null,
              sale_price: typeof rawItem.sale_price === "number" ? rawItem.sale_price : parseFloat(rawItem.sale_price || rawItem.salePrice) || null,
              is_on_sale: rawItem.is_on_sale !== undefined ? (rawItem.is_on_sale ? 1 : 0) : (rawItem.sale_price ? 1 : 0),
              last_updated: rawItem.last_updated || new Date().toISOString(),
              lookup_url: rawItem.lookup_url || rawItem.url || "",
            };
            count++;
          }
        }
      }

      if (count > 0) {
        const merged = { ...existingPrices, ...standardized };
        await blobSetPrices(merged);
        console.log(`▶ Merged successfully ${count} entries from ${sourceFile} into the active storage.`);

        // Empty file content on disk so startup import does not continuously re-evaluate unchanged state
        try {
          fs.writeFileSync(rootPricesPath, "{}", "utf8");
          fs.writeFileSync(rootGroceryPricesPath, "{}", "utf8");
          console.log(`▶ Cleaned root ${sourceFile} and grocery_prices.json to '{}' successfully.`);
        } catch (fErr) {
          console.warn("Failed to reset root prices file cleanups:", fErr);
        }
      }
    } catch (err) {
      console.error("Failed to load and merge static prices data:", err);
    }
  }
}

