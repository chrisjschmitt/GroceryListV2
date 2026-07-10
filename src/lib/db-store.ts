import { MongoClient } from "mongodb";
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
  ScrapeStoreItemLink,
  ScrapeStoreConfig,
  PurchaseLogEntry
} from "./types.js";
import { standardizeCategory } from "./categories.js";
import fs from "fs";
import path from "path";

// Keep a local filesystem fallback in case no MONGODB_URI is defined
const isServerless = !!(process.env.VERCEL || process.env.NODE_ENV === "production");
const LOCAL_DIR = isServerless
  ? path.join("/tmp", "db-storage")
  : path.join(process.cwd(), "db-storage");

function getLocalPath(pathname: string): string {
  if (!fs.existsSync(LOCAL_DIR)) {
    fs.mkdirSync(LOCAL_DIR, { recursive: true });
  }
  const safeName = pathname.replace(/\//g, "-");
  return path.join(LOCAL_DIR, safeName);
}

const hasMongo = () => !!process.env.MONGODB_URI;

// Cached MongoClient connection
let cachedClient: MongoClient | null = null;
let cachedDb: any = null;

export async function getMongoDb() {
  if (cachedDb) return cachedDb;
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error("MONGODB_URI is not defined in environment variables.");
  }
  const cleanUri = mongoUri.trim().replace(/^["']|["']$/g, "");
  const client = new MongoClient(cleanUri);
  await client.connect();
  cachedClient = client;
  cachedDb = client.db("groceryscout");
  return cachedDb;
}

// Helper to validate catalog uniqueness constraints
export function validateUniqueUrls(catalog: CombinedCatalog): void {
  const seenUrls = new Map<string, string>(); // url -> product name
  
  const normalizeUrl = (url: string): string => {
    if (!url) return "";
    let u = url.trim().toLowerCase();
    u = u.replace(/["\\']/g, "");
    u = u.replace(/^https?:\/\//, "");
    u = u.replace(/^www\./, "");
    if (u.endsWith("/")) u = u.slice(0, -1);
    const qIdx = u.indexOf("?");
    if (qIdx !== -1) u = u.substring(0, qIdx);
    return u;
  };

  if (catalog && Array.isArray(catalog.items)) {
    for (const item of catalog.items) {
      if (item.stores && typeof item.stores === "object") {
        for (const [storeKey, link] of Object.entries(item.stores)) {
          if (link && link.url) {
            const normUrl = normalizeUrl(link.url);
            if (normUrl) {
              // Flipp flyer URLs are shared by conjoined/multi-product deals. Don't enforce uniqueness on them.
              if (normUrl.includes("flipp.com") || normUrl.includes("flipp.ca")) {
                continue;
              }
              const duplicateOwner = seenUrls.get(normUrl);
              if (duplicateOwner && duplicateOwner !== item.name) {
                throw new Error(`Duplicate URL detected: URL for "${item.name}" (${storeKey}) is already registered on product "${duplicateOwner}".`);
              }
              seenUrls.set(normUrl, item.name);
            }
          }
        }
      }
    }
  }
}

// ----------------------------------------------------
// DB Store Core Implementations
// ----------------------------------------------------

export async function getBlobDiagnostics(): Promise<Record<string, any>> {
  if (hasMongo()) {
    try {
      const db = await getMongoDb();
      const [itemsCount, storesCount, listCount, logsCount] = await Promise.all([
        db.collection("catalog_items").countDocuments(),
        db.collection("catalog_stores").countDocuments(),
        db.collection("grocery_list").countDocuments(),
        db.collection("purchase_logs").countDocuments(),
      ]);
      return {
        storageType: "MongoDB",
        connected: true,
        collections: {
          catalog_items: itemsCount,
          catalog_stores: storesCount,
          grocery_list: listCount,
          purchase_logs: logsCount,
        }
      };
    } catch (err: any) {
      return { storageType: "MongoDB", connected: false, error: err?.message || err };
    }
  }
  return { storageType: "Local Filesystem", directory: LOCAL_DIR };
}

// --- Active Shopping List ---
export async function blobGetGroceryItems(): Promise<GroceryItem[]> {
  if (hasMongo()) {
    try {
      const db = await getMongoDb();
      const docs = await db.collection("grocery_list").find().toArray();
      return docs.map(d => ({
        id: d._id,
        name: d.name,
        category: d.category,
        quantity: d.quantity,
        unit: d.unit,
        checked: d.checked,
        units: d.units || undefined,
      }));
    } catch (err) {
      console.error("MongoDB grocery items read error, using local fallback", err);
    }
  }

  // Local filesystem fallback
  const localPath = getLocalPath("grocerylist/grocery-items.json");
  if (fs.existsSync(localPath)) {
    return JSON.parse(fs.readFileSync(localPath, "utf8"));
  }
  return [];
}

export async function blobSetGroceryItems(items: GroceryItem[]): Promise<void> {
  if (hasMongo()) {
    try {
      const db = await getMongoDb();
      await db.collection("grocery_list").deleteMany({});
      if (items.length > 0) {
        const docs = items.map(item => ({
          _id: item.id,
          name: item.name,
          category: item.category,
          quantity: item.quantity,
          unit: item.unit,
          checked: item.checked,
          units: item.units !== undefined ? item.units : null,
        }));
        await db.collection("grocery_list").insertMany(docs);
      }
      return;
    } catch (err) {
      console.error("MongoDB grocery items write error, using local fallback", err);
    }
  }

  // Local filesystem write
  const localPath = getLocalPath("grocerylist/grocery-items.json");
  fs.writeFileSync(localPath, JSON.stringify(items, null, 2), "utf8");
}

// --- Purchase History Logs ---
export async function blobGetPurchaseLogs(): Promise<PurchaseLogEntry[]> {
  if (hasMongo()) {
    try {
      const db = await getMongoDb();
      const docs = await db.collection("purchase_logs").find().sort({ timestamp: -1 }).toArray();
      return docs.map(d => ({
        id: d._id,
        timestamp: d.timestamp,
        itemId: d.itemId,
        name: d.name,
        category: d.category,
        quantity: d.quantity,
        unit: d.unit || undefined,
        units: d.units || undefined,
        storeId: d.storeId || undefined,
        storeName: d.storeName || undefined,
        price: d.price !== undefined ? d.price : undefined,
        paidPrice: d.paidPrice !== undefined ? d.paidPrice : undefined,
        regularPrice: d.regularPrice !== undefined ? d.regularPrice : undefined,
        salePrice: d.salePrice !== undefined ? d.salePrice : undefined,
        wasOnSale: d.wasOnSale !== undefined ? d.wasOnSale : undefined,
        validUntil: d.validUntil !== undefined ? d.validUntil : undefined,
        priceSnapshot: d.priceSnapshot || undefined,
      }));
    } catch (err) {
      console.error("MongoDB purchase logs read error, using local fallback", err);
    }
  }

  const localPath = getLocalPath("grocerylist/purchase-logs.json");
  if (fs.existsSync(localPath)) {
    return JSON.parse(fs.readFileSync(localPath, "utf8"));
  }
  return [];
}

export async function blobSetPurchaseLogs(logs: PurchaseLogEntry[]): Promise<void> {
  if (hasMongo()) {
    try {
      const db = await getMongoDb();
      await db.collection("purchase_logs").deleteMany({});
      if (logs.length > 0) {
        const docs = logs.map(log => ({
          _id: log.id,
          timestamp: log.timestamp,
          itemId: log.itemId,
          name: log.name,
          category: log.category,
          quantity: log.quantity,
          unit: log.unit !== undefined ? log.unit : null,
          units: log.units !== undefined ? log.units : null,
          storeId: log.storeId || null,
          storeName: log.storeName || null,
          price: log.price !== undefined ? log.price : null,
          paidPrice: log.paidPrice !== undefined ? log.paidPrice : null,
          regularPrice: log.regularPrice !== undefined ? log.regularPrice : null,
          salePrice: log.salePrice !== undefined ? log.salePrice : null,
          wasOnSale: log.wasOnSale !== undefined ? log.wasOnSale : null,
          validUntil: log.validUntil !== undefined ? log.validUntil : null,
          priceSnapshot: log.priceSnapshot !== undefined ? log.priceSnapshot : null,
        }));
        await db.collection("purchase_logs").insertMany(docs);
      }
      return;
    } catch (err) {
      console.error("MongoDB purchase logs write error, using local fallback", err);
    }
  }

  const localPath = getLocalPath("grocerylist/purchase-logs.json");
  fs.writeFileSync(localPath, JSON.stringify(logs, null, 2), "utf8");
}

// --- Regular/Pantry Items (Consolidated Catalog Proxy) ---
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
  await blobSetCombinedCatalog(catalog);
}

// --- Sync Metadata ---
export async function blobGetSyncMeta(): Promise<SyncMetadata | null> {
  if (hasMongo()) {
    try {
      const db = await getMongoDb();
      const doc = await db.collection("sync_metadata").findOne({ _id: "global" });
      if (doc) {
        return {
          lastSavedTime: doc.lastSavedTime,
          lastSavedBy: doc.lastSavedBy,
        };
      }
      return null;
    } catch (err) {
      console.error("MongoDB sync meta read error, using local fallback", err);
    }
  }

  const localPath = getLocalPath("grocerylist/sync-meta.json");
  if (fs.existsSync(localPath)) {
    return JSON.parse(fs.readFileSync(localPath, "utf8"));
  }
  return null;
}

export async function blobSetSyncMeta(meta: SyncMetadata): Promise<void> {
  if (hasMongo()) {
    try {
      const db = await getMongoDb();
      await db.collection("sync_metadata").updateOne(
        { _id: "global" },
        { $set: { lastSavedTime: meta.lastSavedTime, lastSavedBy: meta.lastSavedBy } },
        { upsert: true }
      );
      return;
    } catch (err) {
      console.error("MongoDB sync meta write error, using local fallback", err);
    }
  }

  const localPath = getLocalPath("grocerylist/sync-meta.json");
  fs.writeFileSync(localPath, JSON.stringify(meta, null, 2), "utf8");
}

export async function blobUpdateSyncMeta(deviceName: string): Promise<SyncMetadata> {
  const meta: SyncMetadata = {
    lastSavedTime: Date.now(),
    lastSavedBy: deviceName,
  };
  await blobSetSyncMeta(meta);
  return meta;
}

// --- Combined Catalog ---
export async function blobGetCombinedCatalog(): Promise<CombinedCatalog> {
  if (hasMongo()) {
    try {
      const db = await getMongoDb();
      const [items, storesList] = await Promise.all([
        db.collection("catalog_items").find().toArray(),
        db.collection("catalog_stores").find().toArray()
      ]);
      
      const stores: Record<string, ScrapeStoreConfig> = {};
      for (const s of storesList) {
        stores[s._id] = {
          enabled: s.enabled,
          store_name: s.store_name,
          base_url: s.base_url,
          postal_code: s.postal_code,
          store_id: s.store_id || s._id,
        };
      }
      
      const mappedItems: CombinedCatalogItem[] = items.map((i: any) => ({
        id: i._id,
        name: i.name,
        category: standardizeCategory(i.category || "Pantry Staples"),
        unit: i.unit || "unit",
        units: typeof i.units === "number" ? i.units : undefined,
        requires_scraping: typeof i.requires_scraping === "boolean" ? i.requires_scraping : false,
        stores: i.stores || {},
        parent_id: i.parent_id,
      }));

      return { stores, items: mappedItems };
    } catch (err) {
      console.error("MongoDB combined catalog read error, using local fallback", err);
    }
  }

  // Local fallback
  const localPath = getLocalPath("grocerylist/combined-catalog.json");
  if (fs.existsSync(localPath)) {
    const raw = JSON.parse(fs.readFileSync(localPath, "utf8"));
    if (raw && Array.isArray(raw.items)) {
      raw.items.forEach((item: any) => {
        item.category = standardizeCategory(item.category || "Pantry Staples");
      });
    }
    return raw;
  }
  return { stores: {}, items: [] };
}

export async function blobSetCombinedCatalog(catalog: CombinedCatalog): Promise<void> {
  validateUniqueUrls(catalog);
  
  if (hasMongo()) {
    try {
      const db = await getMongoDb();
      
      // 1. Update Stores
      await db.collection("catalog_stores").deleteMany({});
      if (catalog.stores && Object.keys(catalog.stores).length > 0) {
        const storeDocs = Object.entries(catalog.stores).map(([key, s]: [string, any]) => ({
          _id: key,
          store_id: s.store_id || key,
          store_name: s.store_name,
          base_url: s.base_url || "",
          postal_code: s.postal_code || "",
          enabled: typeof s.enabled === "boolean" ? s.enabled : true,
        }));
        await db.collection("catalog_stores").insertMany(storeDocs);
      }

      // 2. Update Catalog Items
      await db.collection("catalog_items").deleteMany({});
      if (catalog.items && catalog.items.length > 0) {
        const itemDocs = catalog.items.map(item => ({
          _id: item.id,
          name: item.name,
          category: standardizeCategory(item.category || "Pantry Staples"),
          unit: item.unit || "unit",
          units: item.units !== undefined ? item.units : null,
          requires_scraping: typeof item.requires_scraping === "boolean" ? item.requires_scraping : false,
          stores: item.stores || {},
          parent_id: item.parent_id || null,
        }));
        await db.collection("catalog_items").insertMany(itemDocs);
      }
      return;
    } catch (err) {
      console.error("MongoDB combined catalog write error, using local fallback", err);
    }
  }

  // Local fallback
  const localPath = getLocalPath("grocerylist/combined-catalog.json");
  fs.writeFileSync(localPath, JSON.stringify(catalog, null, 2), "utf8");
}

// --- Scrape Config Proxy ---
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
    catalog.stores = config.stores;
  }

  const newItemsMap = new Map<string, ScrapeItemConfig>();
  if (config.items) {
    for (const configItem of config.items) {
      newItemsMap.set(configItem.name.toLowerCase().trim(), configItem);
    }
  }

  for (const catalogItem of catalog.items) {
    const matchedConfig = newItemsMap.get(catalogItem.name.toLowerCase().trim());
    if (matchedConfig) {
      catalogItem.requires_scraping = true;
      for (const [storeKey, configStoreLink] of Object.entries(matchedConfig.stores)) {
        if (!catalogItem.stores[storeKey]) {
          catalogItem.stores[storeKey] = {
            url: configStoreLink.url || "",
            upc: configStoreLink.upc || "",
            regular_price: null,
            sale_price: null,
            is_on_sale: 0,
            valid_until: "",
            track_pricing: configStoreLink.track_pricing !== false,
            external_name: configStoreLink.external_name || "",
            is_verified: false,
          };
        } else {
          catalogItem.stores[storeKey].url = configStoreLink.url || "";
          catalogItem.stores[storeKey].upc = configStoreLink.upc || "";
          catalogItem.stores[storeKey].track_pricing = configStoreLink.track_pricing !== false;
          if (configStoreLink.external_name) {
            catalogItem.stores[storeKey].external_name = configStoreLink.external_name;
          }
        }
      }
    }
  }

  await blobSetCombinedCatalog(catalog);
}

// --- Prices Proxy ---
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
    
    let item = catalog.items.find(i => {
      return Object.values(i.stores).some(link => link.upc === upc);
    });

    if (!item) {
      const matchName = (priceEntry.config_name || priceEntry.item_name || "").trim().toLowerCase();
      if (matchName) {
        item = catalog.items.find(i => i.name.trim().toLowerCase() === matchName);
      }
    }

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
            external_name: extName,
            is_verified: false,
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
          external_name: extName,
          is_verified: false,
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

// --- Telemetry ---
export async function blobGetTelemetry(): Promise<TelemetryEntry[]> {
  if (hasMongo()) {
    try {
      const db = await getMongoDb();
      const docs = await db.collection("telemetry").find().sort({ timestamp: -1 }).limit(100).toArray();
      return docs.map(d => ({
        timestamp: d.timestamp,
        store_key: d.store_key || undefined,
        success: d.success,
        duration_ms: d.duration_ms,
        items_count: d.items_count,
        error_message: d.error_message || undefined,
      }));
    } catch (err) {
      console.error("MongoDB telemetry read error, using local fallback", err);
    }
  }

  const localPath = getLocalPath("grocerylist/telemetry.json");
  if (fs.existsSync(localPath)) {
    return JSON.parse(fs.readFileSync(localPath, "utf8"));
  }
  return [];
}

export async function blobSetTelemetry(telemetry: TelemetryEntry[]): Promise<void> {
  if (hasMongo()) {
    try {
      const db = await getMongoDb();
      await db.collection("telemetry").deleteMany({});
      if (telemetry.length > 0) {
        await db.collection("telemetry").insertMany(telemetry);
      }
      return;
    } catch (err) {
      console.error("MongoDB telemetry write error, using local fallback", err);
    }
  }

  const localPath = getLocalPath("grocerylist/telemetry.json");
  fs.writeFileSync(localPath, JSON.stringify(telemetry, null, 2), "utf8");
}

export async function blobAppendTelemetry(entry: TelemetryEntry): Promise<void> {
  if (hasMongo()) {
    try {
      const db = await getMongoDb();
      await db.collection("telemetry").insertOne(entry);
      return;
    } catch (err) {
      console.error("MongoDB telemetry append error, using local fallback", err);
    }
  }

  const current = await blobGetTelemetry();
  current.push(entry);
  if (current.length > 100) {
    current.shift();
  }
  await blobSetTelemetry(current);
}

// Legacy import function
export async function checkForLocalPricesJsonAndImport(): Promise<void> {
  // No-op for MongoDB migration
}
