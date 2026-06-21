import { put, list } from "@vercel/blob";
import {
  GroceryItem,
  RegularItem,
  SyncMetadata,
  PriceData,
  ScrapeConfig,
  TelemetryEntry,
  CombinedCatalog,
  CombinedCatalogItem,
  CombinedStoreLink,
  StoreInfo,
  ScrapeItemConfig,
  ScrapeStoreItemLink
} from "./types.js";
import { standardizeCategory } from "./categories.js";
import fs from "fs";
import path from "path";

const COMBINED_CATALOG_BLOB = "grocerylist/combined-catalog.json";
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

// In-memory caching for list() calls to prevent multiple Vercel Blob network roundtrips,
// and promise deduplication to prevent concurrent calls from launching duplicate requests.
let cachedBlobs: any[] | null = null;
let lastBlobsFetchTime = 0;
let activeListPromise: Promise<any[]> | null = null;
const CACHE_TTL_MS = 10000; // Cache blobs list for 10 seconds

async function getBlobsList(): Promise<any[]> {
  const now = Date.now();
  if (cachedBlobs && (now - lastBlobsFetchTime < CACHE_TTL_MS)) {
    return cachedBlobs;
  }
  if (activeListPromise) {
    return activeListPromise;
  }

  activeListPromise = list()
    .then((res) => {
      cachedBlobs = res.blobs || [];
      lastBlobsFetchTime = Date.now();
      activeListPromise = null;
      return cachedBlobs;
    })
    .catch((err) => {
      activeListPromise = null;
      throw err;
    });

  return activeListPromise;
}

function invalidateBlobsCache(): void {
  cachedBlobs = null;
  lastBlobsFetchTime = 0;
  activeListPromise = null;
}

async function readBlob<T>(pathname: string, fallback: T): Promise<T> {
  if (hasVercelBlob()) {
    try {
      const blobs = await getBlobsList();
      const normalize = (p: string) => p.replace(/^\//, "").toLowerCase();
      const targetPath = normalize(pathname);
      const blob = blobs.find((b) => normalize(b.pathname) === targetPath);
      if (!blob) return fallback;

      // Append cache-buster query parameter to bypass CDN/edge caching on the static URL
      const url = blob.url.includes("?") 
        ? `${blob.url}&t=${Date.now()}` 
        : `${blob.url}?t=${Date.now()}`;

      let response = await fetch(url);
      if (!response.ok && process.env.BLOB_READ_WRITE_TOKEN) {
        response = await fetch(url, {
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
          cacheControlMaxAge: 0, // Force cache expiration immediately (bypass edge cache)
        });
        invalidateBlobsCache();
        return;
      } catch (err: any) {
        const errMsg = String(err?.message || err || "").toLowerCase();
        if (errMsg.includes("private store") || errMsg.includes("private access") || errMsg.includes("private")) {
          await put(pathname, JSON.stringify(data), {
            access: "private",
            addRandomSuffix: false,
            allowOverwrite: true,
            contentType: "application/json",
            cacheControlMaxAge: 0, // Force cache expiration immediately (bypass edge cache)
          });
          invalidateBlobsCache();
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

  try {
    const suiteResult = runCombinedCatalogSelfTests();
    diagnostics.combinedCatalogTestsPassed = suiteResult.success;
    diagnostics.combinedCatalogTestSummary = suiteResult.summary;
  } catch (err: any) {
    diagnostics.combinedCatalogTestsPassed = false;
    diagnostics.combinedCatalogTestSummary = err?.message || String(err);
  }

  return diagnostics;
}

export async function blobGetGroceryItems(): Promise<GroceryItem[]> {
  const items = await readBlob<GroceryItem[]>(GROCERY_BLOB, []);
  return items.map(item => ({
    ...item,
    category: standardizeCategory(item.category)
  }));
}

export async function blobSetGroceryItems(items: GroceryItem[]): Promise<void> {
  await writeBlob(GROCERY_BLOB, items);
}

export async function blobGetRegularItems(): Promise<RegularItem[]> {
  const catalog = await blobGetCombinedCatalog();
  return catalog.items as any;
}

export async function blobSetRegularItems(items: RegularItem[]): Promise<void> {
  const catalog = await blobGetCombinedCatalog();
  
  const existingMap = new Map<string, any>();
  for (const item of catalog.items) {
    existingMap.set(item.id, item);
  }
  
  const updatedItems = items.map((updatedItem) => {
    const existing = existingMap.get(updatedItem.id) || catalog.items.find(i => i.name.toLowerCase() === updatedItem.name.toLowerCase());
    if (existing) {
      return {
        ...existing,
        name: updatedItem.name,
        category: updatedItem.category || existing.category || "grocery",
        unit: (updatedItem as any).unit || existing.unit || "unit",
      };
    } else {
      return {
        id: updatedItem.id || `catalog-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        name: updatedItem.name,
        category: updatedItem.category || "grocery",
        unit: (updatedItem as any).unit || "unit",
        requires_scraping: false,
        stores: {},
      };
    }
  });

  catalog.items = updatedItems;
  await writeBlob(COMBINED_CATALOG_BLOB, catalog);
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
  const catalog = await blobGetCombinedCatalog();
  const prices: PriceData = {};

  for (const item of catalog.items) {
    const storesRecord: Record<string, StoreInfo> = {};
    let firstStoreKey = "";
    let hasPricing = false;

    for (const [storeKey, storeLink] of Object.entries(item.stores)) {
      if (storeLink.regular_price !== null && storeLink.regular_price !== undefined) {
        hasPricing = true;
      }
      if (storeLink.sale_price !== null && storeLink.sale_price !== undefined) {
        hasPricing = true;
      }
      if (storeLink.url) {
        hasPricing = true;
      }

      if (!firstStoreKey) firstStoreKey = storeKey;
      const storeConfig = catalog.stores[storeKey];
      storesRecord[storeKey] = {
        store_name: storeConfig?.store_name || storeKey,
        postal_code: storeConfig?.postal_code || "",
        store_id: storeConfig?.store_id || "",
        regular_price: storeLink.regular_price,
        sale_price: storeLink.sale_price,
        is_on_sale: storeLink.is_on_sale,
        lookup_url: storeLink.url,
        valid_until: storeLink.valid_until,
      };
    }

    if (!hasPricing) {
      // Skip this item in prices to prevent polluting the UI of unconfigured/empty products
      continue;
    }

    const firstStoreLink = firstStoreKey ? item.stores[firstStoreKey] : null;
    const firstStoreConfig = firstStoreKey ? catalog.stores[firstStoreKey] : null;

    let upcKey = item.id;
    for (const storeLink of Object.values(item.stores)) {
      if (storeLink.upc) {
        upcKey = storeLink.upc;
        break;
      }
    }

    prices[upcKey] = {
      item_name: item.name,
      config_name: item.name,
      store_name: firstStoreConfig?.store_name || firstStoreKey || "Food Basics",
      postal_code: firstStoreConfig?.postal_code || "",
      store_id: firstStoreConfig?.store_id || "",
      regular_price: firstStoreLink ? firstStoreLink.regular_price : null,
      sale_price: firstStoreLink ? firstStoreLink.sale_price : null,
      is_on_sale: firstStoreLink ? firstStoreLink.is_on_sale : 0,
      last_updated: item.last_updated || new Date().toISOString(),
      lookup_url: firstStoreLink?.url,
      valid_until: firstStoreLink?.valid_until,
      stores: storesRecord,
    };
  }

  return prices;
}

export async function blobSetPrices(prices: PriceData): Promise<void> {
  const catalog = await blobGetCombinedCatalog();

  for (const [upc, priceEntry] of Object.entries(prices)) {
    if (!priceEntry) continue;
    
    // Find catalog item matching this UPC
    let item = catalog.items.find(i => {
      return Object.values(i.stores).some(link => link.upc === upc);
    });

    // Fallback to name match
    if (!item) {
      const matchName = (priceEntry.config_name || priceEntry.item_name || "").trim().toLowerCase();
      if (matchName) {
        item = catalog.items.find(i => i.name.trim().toLowerCase() === matchName);
      }
    }

    // Create if not found
    if (!item) {
      item = {
        id: "prod-" + Math.random().toString(36).substr(2, 9),
        name: priceEntry.config_name || priceEntry.item_name || "New Item",
        category: "grocery",
        unit: "unit",
        requires_scraping: false,
        stores: {},
        last_updated: priceEntry.last_updated || new Date().toISOString(),
      };
      catalog.items.push(item);
    }

    item.last_updated = priceEntry.last_updated || new Date().toISOString();

    // Update stores in item.stores
    if (priceEntry.stores && typeof priceEntry.stores === "object") {
      for (const [storeKey, storeInfo] of Object.entries(priceEntry.stores)) {
        const sInfo = storeInfo as any;
        const trackVal = sInfo.track_pricing === 1 || sInfo.track_pricing === true;
        const extName = sInfo.external_name || "";
        if (!item.stores[storeKey]) {
          item.stores[storeKey] = {
            url: sInfo.lookup_url || "",
            upc: sInfo.store_id || upc,
            regular_price: sInfo.regular_price,
            sale_price: sInfo.sale_price,
            is_on_sale: sInfo.is_on_sale !== undefined ? (sInfo.is_on_sale ? 1 : 0) : (sInfo.sale_price ? 1 : 0),
            valid_until: sInfo.valid_until,
            track_pricing: trackVal,
            external_name: extName
          };
        } else {
          item.stores[storeKey].regular_price = sInfo.regular_price;
          item.stores[storeKey].sale_price = sInfo.sale_price;
          item.stores[storeKey].is_on_sale = sInfo.is_on_sale !== undefined ? (sInfo.is_on_sale ? 1 : 0) : (sInfo.sale_price ? 1 : 0);
          item.stores[storeKey].valid_until = sInfo.valid_until;
          item.stores[storeKey].track_pricing = trackVal;
          if (extName) {
            item.stores[storeKey].external_name = extName;
          }
        }
      }
    } else {
      // Flat structure
      const storeKey = priceEntry.store_id || "foodbasics";
      const trackVal = priceEntry.track_pricing === 1 || priceEntry.track_pricing === true;
      const extName = priceEntry.external_name || "";
      if (!item.stores[storeKey]) {
        item.stores[storeKey] = {
          url: priceEntry.lookup_url || "",
          upc: upc,
          regular_price: priceEntry.regular_price,
          sale_price: priceEntry.sale_price,
          is_on_sale: priceEntry.is_on_sale !== undefined ? (priceEntry.is_on_sale ? 1 : 0) : (priceEntry.sale_price ? 1 : 0),
          valid_until: priceEntry.valid_until,
          track_pricing: trackVal,
          external_name: extName
        };
      } else {
        item.stores[storeKey].regular_price = priceEntry.regular_price;
        item.stores[storeKey].sale_price = priceEntry.sale_price;
        item.stores[storeKey].is_on_sale = priceEntry.is_on_sale !== undefined ? (priceEntry.is_on_sale ? 1 : 0) : (priceEntry.sale_price ? 1 : 0);
        item.stores[storeKey].valid_until = priceEntry.valid_until;
        item.stores[storeKey].track_pricing = trackVal;
        if (extName) {
          item.stores[storeKey].external_name = extName;
        }
      }
    }
  }

  await blobSetCombinedCatalog(catalog);
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

  // Ensure metro exists as a store
  if (!migrated.stores.metro) {
    migrated.stores.metro = {
      enabled: true,
      store_name: "Metro",
      base_url: "https://www.metro.ca",
      postal_code: "K7H3C6",
      store_id: "metro",
    };
  }

  // Ensure loblaws exists as a store
  if (!migrated.stores.loblaws) {
    migrated.stores.loblaws = {
      enabled: true,
      store_name: "Loblaws",
      base_url: "https://www.loblaws.ca",
      postal_code: "K7H3C6",
      store_id: "loblaws",
    };
  }

  // Ensure nofrills exists as a store
  if (!migrated.stores.nofrills) {
    migrated.stores.nofrills = {
      enabled: true,
      store_name: "No Frills",
      base_url: "https://www.nofrills.ca",
      postal_code: "K7H3C6",
      store_id: "nofrills",
    };
  }

  // Ensure freshco exists as a store
  if (!migrated.stores.freshco) {
    migrated.stores.freshco = {
      enabled: true,
      store_name: "FreshCo",
      base_url: "https://freshco.com",
      postal_code: "K7H3C6",
      store_id: "freshco",
    };
  }

  // Ensure yourindependentgrocer exists as a store
  if (!migrated.stores.yourindependentgrocer) {
    migrated.stores.yourindependentgrocer = {
      enabled: true,
      store_name: "Your Independent Grocer",
      base_url: "https://www.yourindependentgrocer.ca",
      postal_code: "K7H3C6",
      store_id: "yourindependentgrocer",
    };
  }

  return migrated;
}

export function validateUniqueUrls(catalog: CombinedCatalog): void {
  const urlToProduct = new Map<string, string>();
  for (const item of catalog.items) {
    for (const [storeKey, link] of Object.entries(item.stores)) {
      if (link.url) {
        const normalizedUrl = link.url.trim().toLowerCase();
        if (urlToProduct.has(normalizedUrl)) {
          const originalProdName = urlToProduct.get(normalizedUrl);
          if (originalProdName?.toLowerCase() !== item.name.toLowerCase()) {
            throw new Error(`Duplicate URL detected: URL for "${item.name}" (${storeKey}) is already registered on product "${originalProdName}".`);
          }
        }
        urlToProduct.set(normalizedUrl, item.name);
      }
    }
  }
}

export function migrateCombinedCatalog(catalog: any): CombinedCatalog {
  const migrated: CombinedCatalog = {
    stores: {},
    items: [],
  };

  if (!catalog) return migrated;

  if (catalog.stores && typeof catalog.stores === "object") {
    for (const [key, storeVal] of Object.entries(catalog.stores)) {
      if (storeVal && typeof storeVal === "object") {
        const s = storeVal as any;
        migrated.stores[key] = {
          enabled: typeof s.enabled === "boolean" ? s.enabled : true,
          store_name: s.store_name || key,
          base_url: s.base_url || "",
          postal_code: s.postal_code || "",
          store_id: s.store_id || "",
        };
      }
    }
  }

  if (Array.isArray(catalog.items)) {
    catalog.items.forEach((item: any) => {
      if (!item || typeof item !== "object" || !item.name) return;
      const storesRecord: Record<string, CombinedStoreLink> = {};
      if (item.stores && typeof item.stores === "object") {
        for (const [storeKey, linkVal] of Object.entries(item.stores)) {
          if (linkVal && typeof linkVal === "object") {
            const lv = linkVal as any;
            storesRecord[storeKey] = {
              url: lv.url || "",
              upc: lv.upc || "",
              regular_price: lv.regular_price !== undefined ? lv.regular_price : null,
              sale_price: lv.sale_price !== undefined ? lv.sale_price : null,
              is_on_sale: lv.is_on_sale !== undefined ? lv.is_on_sale : 0,
              valid_until: lv.valid_until,
              track_pricing: lv.track_pricing !== undefined ? !!lv.track_pricing : true,
              external_name: lv.external_name || "",
              is_verified: lv.is_verified !== undefined ? (lv.is_verified === true || lv.is_verified === 1 || String(lv.is_verified) === "true") : false,
            };
          }
        }
      }

      migrated.items.push({
        id: item.id || "prod-" + Math.random().toString(36).substr(2, 9),
        name: item.name,
        category: standardizeCategory(item.category || "Pantry Staples"),
        unit: item.unit || "unit",
        requires_scraping: typeof item.requires_scraping === "boolean" ? item.requires_scraping : false,
        stores: storesRecord,
        last_updated: item.last_updated,
      });
    });
  }

  return migrated;
}

export function runCombinedCatalogSelfTests(): { success: boolean; summary: string; errors: string[] } {
  const errors: string[] = [];
  try {
    const badCatalog: CombinedCatalog = {
      stores: {},
      items: [
        {
          id: "1",
          name: "Item A",
          category: "grocery",
          unit: "unit",
          requires_scraping: true,
          stores: {
            foodbasics: { url: "https://foo.com/item1", upc: "123", regular_price: null, sale_price: null, is_on_sale: 0 }
          }
        },
        {
          id: "2",
          name: "Item B",
          category: "grocery",
          unit: "unit",
          requires_scraping: true,
          stores: {
            metro: { url: "https://foo.com/item1", upc: "456", regular_price: null, sale_price: null, is_on_sale: 0 }
          }
        }
      ]
    };

    let caughtDup = false;
    try {
      validateUniqueUrls(badCatalog);
    } catch {
      caughtDup = true;
    }

    if (!caughtDup) {
      errors.push("Self-test failed: validateUniqueUrls did not throw on duplicate URLs for different items.");
    }

    const rawCatalog = {
      stores: {},
      items: [
        {
          name: "Apple",
          stores: {
            foodbasics: { url: "https://basics.com/apple" }
          }
        }
      ]
    };
    const migrated = migrateCombinedCatalog(rawCatalog);
    if (migrated.items.length !== 1) {
      errors.push("Self-test failed: migrateCombinedCatalog did not migrate correct number of items.");
    } else {
      const apple = migrated.items[0];
      if (apple.unit !== "unit") {
        errors.push("Self-test failed: default item unit was not set to 'unit'.");
      }
      if (apple.requires_scraping !== false) {
        errors.push("Self-test failed: default requires_scraping was not false.");
      }
      if (!apple.id) {
        errors.push("Self-test failed: autogenerated ID was missing.");
      }
    }

    return {
      success: errors.length === 0,
      summary: errors.length === 0 ? "All CombinedCatalog self-tests passed successfully (Url Uniqueness, Default Units initialization, Auto-migration structure integrity)." : "Self-tests failed.",
      errors,
    };
  } catch (err: any) {
    return {
      success: false,
      summary: `Self-test threw an error: ${err?.message || String(err)}`,
      errors: [err?.message || String(err)],
    };
  }
}

export async function blobGetCombinedCatalog(): Promise<CombinedCatalog> {
  const hasCatalog = await readBlob<any>(COMBINED_CATALOG_BLOB, null);
  if (hasCatalog) {
    return migrateCombinedCatalog(hasCatalog);
  }

  console.log("No combined catalog found. Triggering automated migration from existing scrape-config and prices...");
  const oldConfig = await readBlob<any>(SCRAPE_CONFIG_BLOB, null);
  const oldPrices = await readBlob<any>(PRICES_BLOB, {});

  const catalog: CombinedCatalog = {
    stores: {},
    items: [],
  };

  catalog.stores.foodbasics = {
    enabled: true,
    store_name: "Food Basics",
    base_url: "https://www.foodbasics.ca",
    postal_code: "K7H3C6",
    store_id: "7923194",
  };
  catalog.stores.metro = {
    enabled: true,
    store_name: "Metro",
    base_url: "https://www.metro.ca",
    postal_code: "K7H3C6",
    store_id: "metro",
  };
  catalog.stores.loblaws = {
    enabled: true,
    store_name: "Loblaws",
    base_url: "https://www.loblaws.ca",
    postal_code: "K7H3C6",
    store_id: "loblaws",
  };
  catalog.stores.nofrills = {
    enabled: true,
    store_name: "No Frills",
    base_url: "https://www.nofrills.ca",
    postal_code: "K7H3C6",
    store_id: "nofrills",
  };
  catalog.stores.freshco = {
    enabled: true,
    store_name: "FreshCo",
    base_url: "https://freshco.com",
    postal_code: "K7H3C6",
    store_id: "freshco",
  };
  catalog.stores.yourindependentgrocer = {
    enabled: true,
    store_name: "Your Independent Grocer",
    base_url: "https://www.yourindependentgrocer.ca",
    postal_code: "K7H3C6",
    store_id: "yourindependentgrocer",
  };

  if (oldConfig && oldConfig.stores && typeof oldConfig.stores === "object") {
    for (const [key, storeVal] of Object.entries(oldConfig.stores)) {
      if (storeVal && typeof storeVal === "object") {
        const s = storeVal as any;
        catalog.stores[key] = {
          enabled: typeof s.enabled === "boolean" ? s.enabled : true,
          store_name: s.store_name || key,
          base_url: s.base_url || "",
          postal_code: s.postal_code || "",
          store_id: s.store_id || "",
        };
      }
    }
  }

  const migratedConfig = migrateScrapeConfig(oldConfig);
  const regularItems = await blobGetRegularItems();
  const getCleanName = (n: string) => n.trim().toLowerCase();

  for (const rItem of regularItems) {
    const matchedScrapeItem = migratedConfig.items.find(si => getCleanName(si.name) === getCleanName(rItem.name));
    const itemStores: Record<string, CombinedStoreLink> = {};
    let requiresScraping = false;
    let upc = "";

    if (matchedScrapeItem) {
      requiresScraping = true;
      for (const [storeKey, storeLink] of Object.entries(matchedScrapeItem.stores)) {
        itemStores[storeKey] = {
          url: storeLink.url,
          upc: storeLink.upc,
          regular_price: null,
          sale_price: null,
          is_on_sale: 0,
        };
        if (storeLink.upc) upc = storeLink.upc;
      }
    }

    for (const [pricingKey, p] of Object.entries(oldPrices)) {
      const isMatch = p && (getCleanName((p as any).item_name) === getCleanName(rItem.name) || getCleanName((p as any).config_name) === getCleanName(rItem.name) || pricingKey === upc);
      if (isMatch) {
        const anyP = p as any;
        if (anyP.stores && typeof anyP.stores === "object") {
          for (const [storeKey, details] of Object.entries(anyP.stores)) {
            const d = details as any;
            if (!itemStores[storeKey]) {
              itemStores[storeKey] = {
                url: d.lookup_url || d.url || "",
                upc: d.store_id || "",
                regular_price: d.regular_price,
                sale_price: d.sale_price,
                is_on_sale: d.is_on_sale !== undefined ? (d.is_on_sale ? 1 : 0) : (d.sale_price ? 1 : 0),
                valid_until: d.valid_until,
              };
            } else {
              itemStores[storeKey].regular_price = d.regular_price;
              itemStores[storeKey].sale_price = d.sale_price;
              itemStores[storeKey].is_on_sale = d.is_on_sale !== undefined ? (d.is_on_sale ? 1 : 0) : (d.sale_price ? 1 : 0);
              itemStores[storeKey].valid_until = d.valid_until;
            }
          }
        } else {
          const storeKey = anyP.store_id || "foodbasics";
          if (!itemStores[storeKey]) {
            itemStores[storeKey] = {
              url: anyP.lookup_url || "",
              upc: pricingKey,
              regular_price: anyP.regular_price,
              sale_price: anyP.sale_price,
              is_on_sale: anyP.is_on_sale !== undefined ? (anyP.is_on_sale ? 1 : 0) : (anyP.sale_price ? 1 : 0),
              valid_until: anyP.valid_until,
            };
          } else {
            itemStores[storeKey].regular_price = anyP.regular_price;
            itemStores[storeKey].sale_price = anyP.sale_price;
            itemStores[storeKey].is_on_sale = anyP.is_on_sale !== undefined ? (anyP.is_on_sale ? 1 : 0) : (anyP.sale_price ? 1 : 0);
            itemStores[storeKey].valid_until = anyP.valid_until;
          }
        }
      }
    }

    catalog.items.push({
      id: rItem.id,
      name: rItem.name,
      category: rItem.category || "grocery",
      unit: "unit",
      requires_scraping: requiresScraping,
      stores: itemStores,
    });
  }

  for (const scItem of migratedConfig.items) {
    const alreadyAdded = catalog.items.some(i => getCleanName(i.name) === getCleanName(scItem.name));
    if (alreadyAdded) continue;

    const itemStores: Record<string, CombinedStoreLink> = {};
    let upc = "";
    for (const [storeKey, storeLink] of Object.entries(scItem.stores)) {
      itemStores[storeKey] = {
        url: storeLink.url,
        upc: storeLink.upc,
        regular_price: null,
        sale_price: null,
        is_on_sale: 0,
      };
      if (storeLink.upc) upc = storeLink.upc;
    }

    for (const [pricingKey, p] of Object.entries(oldPrices)) {
      const isMatch = p && (getCleanName((p as any).item_name) === getCleanName(scItem.name) || getCleanName((p as any).config_name) === getCleanName(scItem.name) || pricingKey === upc);
      if (isMatch) {
        const anyP = p as any;
        if (anyP.stores && typeof anyP.stores === "object") {
          for (const [storeKey, details] of Object.entries(anyP.stores)) {
            const d = details as any;
            if (!itemStores[storeKey]) {
              itemStores[storeKey] = {
                url: d.lookup_url || d.url || "",
                upc: d.store_id || "",
                regular_price: d.regular_price,
                sale_price: d.sale_price,
                is_on_sale: d.is_on_sale !== undefined ? (d.is_on_sale ? 1 : 0) : (d.sale_price ? 1 : 0),
                valid_until: d.valid_until,
              };
            } else {
              itemStores[storeKey].regular_price = d.regular_price;
              itemStores[storeKey].sale_price = d.sale_price;
              itemStores[storeKey].is_on_sale = d.is_on_sale !== undefined ? (d.is_on_sale ? 1 : 0) : (d.sale_price ? 1 : 0);
              itemStores[storeKey].valid_until = d.valid_until;
            }
          }
        }
      }
    }

    catalog.items.push({
      id: "prod-" + Math.random().toString(36).substr(2, 9),
      name: scItem.name,
      category: "grocery",
      unit: "unit",
      requires_scraping: true,
      stores: itemStores,
    });
  }

  try {
    validateUniqueUrls(catalog);
  } catch (err) {
    console.warn("Migration had duplicate URLs, resolving duplicates automatically:", err);
    const seenUrls = new Set<string>();
    for (const item of catalog.items) {
      for (const [storeKey, link] of Object.entries(item.stores)) {
        if (link.url) {
          const normUrl = link.url.trim().toLowerCase();
          if (seenUrls.has(normUrl)) {
            link.url = "";
          } else {
            seenUrls.add(normUrl);
          }
        }
      }
    }
  }

  await writeBlob(COMBINED_CATALOG_BLOB, catalog);
  return catalog;
}

export async function blobSetCombinedCatalog(catalog: CombinedCatalog): Promise<void> {
  validateUniqueUrls(catalog);
  if (catalog && Array.isArray(catalog.items)) {
    catalog.items.forEach(item => {
      item.category = standardizeCategory(item.category);
    });
  }
  await writeBlob(COMBINED_CATALOG_BLOB, catalog);
}

export async function blobGetScrapeConfig(): Promise<ScrapeConfig> {
  const catalog = await blobGetCombinedCatalog();
  const configItems: ScrapeItemConfig[] = [];

  for (const item of catalog.items) {
    if (item.requires_scraping) {
      const storesRecord: Record<string, ScrapeStoreItemLink> = {};
      for (const [storeKey, storeVal] of Object.entries(item.stores)) {
        storesRecord[storeKey] = {
          url: storeVal.url,
          upc: storeVal.upc,
          track_pricing: storeVal.track_pricing,
          external_name: storeVal.external_name,
        };
      }
      configItems.push({
        name: item.name,
        stores: storesRecord,
      });
    }
  }

  return {
    stores: catalog.stores,
    items: configItems,
  };
}

export async function blobSetScrapeConfig(config: ScrapeConfig): Promise<void> {
  const catalog = await blobGetCombinedCatalog();

  if (config.stores) {
    catalog.stores = { ...catalog.stores, ...config.stores };
  }

  const activeNames = new Set((config.items || []).map(i => i.name.toLowerCase()));

  for (const item of catalog.items) {
    if (activeNames.has(item.name.toLowerCase())) {
      item.requires_scraping = true;
    } else {
      item.requires_scraping = false;
    }
  }

  for (const scItem of config.items || []) {
    let existing = catalog.items.find(i => i.name.toLowerCase() === scItem.name.toLowerCase());
    if (!existing) {
      existing = {
        id: "prod-" + Math.random().toString(36).substr(2, 9),
        name: scItem.name,
        category: "grocery",
        unit: "unit",
        requires_scraping: true,
        stores: {}
      };
      catalog.items.push(existing);
    }

    existing.requires_scraping = true;

    for (const [storeKey, link] of Object.entries(scItem.stores)) {
      if (!existing.stores[storeKey]) {
        existing.stores[storeKey] = {
          url: link.url,
          upc: link.upc,
          regular_price: null,
          sale_price: null,
          is_on_sale: 0
        };
      } else {
        existing.stores[storeKey].url = link.url;
        existing.stores[storeKey].upc = link.upc;
      }
    }
  }

  await blobSetCombinedCatalog(catalog);
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
      const mergedPrices = { ...existingPrices };

      const getMatchKey = (item: any) => {
        return (item.config_name || item.item_name || item.name || "").trim().toLowerCase();
      };
      const getStoreId = (item: any) => {
        return (item.store_id || "").trim().toString().toLowerCase();
      };

      const processItem = (item: any, fallbackKey: string) => {
        const matchKey = getMatchKey(item);
        if (!matchKey) return;

        const stores = item.stores || null;
        let finalStoreName = item.store_name || "Food Basics";
        let finalPostalCode = item.postal_code || "K7H3C6";
        let finalStoreId = item.store_id || "7923194";
        let finalRegular = item.regular_price;
        let finalSale = item.sale_price;
        let finalIsOnSale = item.is_on_sale;
        let finalLookupUrl = item.lookup_url || item.url || "";

        if (stores && typeof stores === "object") {
          const storeKeys = Object.keys(stores);
          if (storeKeys.length > 0) {
            let lowestStoreKey = storeKeys[0];
            let lowestPrice = Infinity;
            for (const key of storeKeys) {
              const s = stores[key];
              const p = (s.is_on_sale && s.sale_price !== null && s.sale_price !== undefined) ? s.sale_price : (s.regular_price || 0);
              if (p < lowestPrice) {
                lowestPrice = p;
                lowestStoreKey = key;
              }
            }
            const firstStore = stores[lowestStoreKey];
            finalStoreName = firstStore.store_name || lowestStoreKey;
            finalPostalCode = firstStore.postal_code || "";
            finalStoreId = firstStore.store_id || "";
            finalRegular = typeof firstStore.regular_price === "number" ? firstStore.regular_price : parseFloat(firstStore.regular_price) || null;
            finalSale = typeof firstStore.sale_price === "number" ? firstStore.sale_price : parseFloat(firstStore.sale_price) || null;
            finalIsOnSale = firstStore.is_on_sale !== undefined ? (firstStore.is_on_sale ? 1 : 0) : (firstStore.sale_price ? 1 : 0);
            finalLookupUrl = firstStore.lookup_url || firstStore.url || "";
          }
        }

        const storeId = finalStoreId ? finalStoreId.trim().toLowerCase() : "7923194";

        // Keep it unique: find an active key in mergedPrices with same Match Key & Store
        let targetKey = item.upc || item.sku || item.id || fallbackKey;
        const matchingKey = Object.keys(mergedPrices).find(k => {
          const p = mergedPrices[k];
          return p && getMatchKey(p) === matchKey && getStoreId(p) === storeId;
        });

        if (matchingKey) {
          targetKey = matchingKey;
        }

        mergedPrices[targetKey] = {
          item_name: item.item_name || item.name || (matchingKey ? mergedPrices[matchingKey].item_name : ""),
          config_name: item.config_name || item.name || (matchingKey ? mergedPrices[matchingKey].config_name : ""),
          store_name: finalStoreName,
          postal_code: finalPostalCode,
          store_id: finalStoreId,
          regular_price: typeof finalRegular === "number" ? finalRegular : parseFloat(finalRegular || "0") || null,
          sale_price: typeof finalSale === "number" ? finalSale : parseFloat(finalSale) || null,
          is_on_sale: finalIsOnSale !== undefined ? (finalIsOnSale ? 1 : 0) : (finalSale ? 1 : 0),
          last_updated: item.last_updated || new Date().toISOString(),
          lookup_url: finalLookupUrl,
          stores: stores
        };
        count++;
      };

      if (Array.isArray(parsedData)) {
        parsedData.forEach((item: any, idx: number) => {
          const generatedKey = `manual-${Date.now()}-${idx}`;
          processItem(item, generatedKey);
        });
      } else {
        for (const [key, item] of Object.entries(parsedData)) {
          if (item && typeof item === "object") {
            processItem(item, key);
          }
        }
      }

      if (count > 0) {
        await blobSetPrices(mergedPrices);
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

