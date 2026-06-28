import express from "express";
import multer from "multer";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { MongoClient, ObjectId } from "mongodb";
import { parseCsv } from "../src/lib/csv-parser.js";
import { evaluateGeminiMatch, runAllMatchingTests } from "../src/lib/gemini-match-service.js";
import { RegularItem, PurchaseLogEntry } from "../src/lib/types";
import {
  blobGetGroceryItems,
  blobSetGroceryItems,
  blobGetRegularItems,
  blobSetRegularItems,
  blobGetSyncMeta,
  blobUpdateSyncMeta,
  blobGetPrices,
  blobSetPrices,
  blobGetScrapeConfig,
  blobSetScrapeConfig,
  getBlobDiagnostics,
  blobGetTelemetry,
  blobSetTelemetry,
  blobAppendTelemetry,
  checkForLocalPricesJsonAndImport,
  blobGetCombinedCatalog,
  blobSetCombinedCatalog,
  blobGetPurchaseLogs,
  blobSetPurchaseLogs,
} from "../src/lib/blob-store.js";

const app = express();

// Global catalog write mutex to serialize concurrent append-grocery updates
let catalogWriteMutex = Promise.resolve();

// Track container-level initialization
let serverlessInitialized = false;
async function initializeServerless() {
  if (serverlessInitialized) return;
  serverlessInitialized = true;
  await checkForLocalPricesJsonAndImport().catch((err) => {
    console.error("Error running auto-import for local prices on serverless container initialization:", err);
  });
}

// Ensure local file detection is triggered on requests
app.use(async (req, res, next) => {
  await initializeServerless();
  next();
});

// JSON Body Parser for sync and scrape-config payloads
app.use(express.json({ limit: "15mb" }));

// Use standard memory storage for multer CSV upload
const upload = multer({ storage: multer.memoryStorage() });

// --- API Endpoints ---

// Connection pooling state variables for MongoDB Atlas
let cachedMongoClient: MongoClient | null = null;
let cachedMongoDb: any = null;

async function getMongoDatabase() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI environment variable is missing or empty.");
  }
  const cleanUri = uri.trim().replace(/^["']|["']$/g, "").trim();
  if (!cleanUri || cleanUri === "mongodb+srv://..." || cleanUri === "MY_MONGODB_URI" || (!cleanUri.startsWith("mongodb://") && !cleanUri.startsWith("mongodb+srv://"))) {
    throw new Error("Invalid or default MONGODB_URI scheme (using fallback mode).");
  }
  if (cachedMongoClient && cachedMongoDb) {
    return { client: cachedMongoClient, db: cachedMongoDb };
  }
  
  const globalRef = global as any;
  if (!globalRef._mongoClientPromise) {
    const client = new MongoClient(cleanUri);
    globalRef._mongoClientPromise = client.connect();
  }
  const client = await globalRef._mongoClientPromise;
  const db = client.db("groceryscout");
  
  cachedMongoClient = client;
  cachedMongoDb = db;
  return { client, db };
}

function isSaleExpired(validUntil?: string | null): boolean {
  if (!validUntil) return false;
  const expiryDate = new Date(validUntil);
  if (isNaN(expiryDate.getTime())) return false;
  const now = new Date();
  if (/^\d{4}-\d{2}-\d{2}$/.test(validUntil.trim())) {
    const [y, m, d] = validUntil.trim().split("-").map(Number);
    const targetDate = new Date(y, m - 1, d, 23, 59, 59, 999);
    return now > targetDate;
  }
  return now > expiryDate;
}

async function mergeMongoPrices(prices: any, catalogIdToKey?: Record<string, string>, catalogIdToName?: Record<string, string>): Promise<any> {
  try {
    const { db } = await getMongoDatabase();
    const pricesCollection = db.collection("prices");
    const mongoDocs = await pricesCollection.find().toArray();
    
    for (const doc of mongoDocs) {
      const upc = doc._id || doc.upc;
      if (!upc) continue;
      
      const storeId = doc.store_id || "foodbasics";
      const storeName = doc.store_name || "Food Basics";
      
      // Map store normalized key (e.g. foodbasics, metro, loblaws, nofrills)
      let storeKey = "foodbasics";
      const lowerStoreId = String(storeId).toLowerCase();
      if (lowerStoreId.includes("metro")) storeKey = "metro";
      else if (lowerStoreId.includes("loblaws")) storeKey = "loblaws";
      else if (lowerStoreId.includes("nofrills")) storeKey = "nofrills";
      else if (lowerStoreId === "7923194" || lowerStoreId.includes("foodbasics")) storeKey = "foodbasics";
      else storeKey = storeId;
      
      // Resolve the target key in the prices object (defaulting to the item's UPC)
      let targetKey = upc;
      let isCatalogItem = false;
      let canonicalName = "";
      
      if (doc.matched_catalog_id && catalogIdToKey && catalogIdToKey[doc.matched_catalog_id]) {
        targetKey = catalogIdToKey[doc.matched_catalog_id];
        isCatalogItem = true;
        canonicalName = catalogIdToName?.[doc.matched_catalog_id] || "";
      }
      
      const existingEntry = prices[targetKey] || { stores: {} };
      
      // Build updated stores mapping
      const updatedStores = { ...(existingEntry.stores || {}) };
      
      // Extract specific pricing properties safely from MongoDB
      const regPrice = typeof doc.regular_price === "number" ? doc.regular_price : (doc.regular_price ? parseFloat(doc.regular_price) : null);
      const salePrice = typeof doc.sale_price === "number" ? doc.sale_price : (doc.sale_price ? parseFloat(doc.sale_price) : null);
      const isOnSale = doc.is_on_sale !== undefined ? (doc.is_on_sale ? 1 : 0) : (salePrice !== null ? 1 : 0);
      
      // Prioritize manual configurations from catalog over database scraped values
      const catalogStore = existingEntry.stores?.[storeKey];
      const catalogRegPrice = catalogStore?.regular_price;
      const catalogSalePrice = catalogStore?.sale_price;
      const catalogIsOnSale = catalogStore?.is_on_sale;
      const hasCatalogPrice = catalogRegPrice !== null && catalogRegPrice !== undefined;

      const finalRegPrice = hasCatalogPrice ? catalogRegPrice : (regPrice !== null && regPrice !== undefined ? regPrice : null);
      const finalSalePrice = hasCatalogPrice ? catalogSalePrice : (salePrice !== null && salePrice !== undefined ? salePrice : null);
      const finalIsOnSale = hasCatalogPrice ? catalogIsOnSale : (doc.is_on_sale !== undefined ? isOnSale : 0);
      const finalLookupUrl = catalogStore?.lookup_url || doc.url || doc.lookup_url || doc.lookupUrl || "";
      const finalValidUntil = hasCatalogPrice ? (catalogStore?.valid_until || "") : (doc.valid_until || catalogStore?.valid_until || "");
      const finalTrackPricing = catalogStore?.track_pricing !== undefined ? (catalogStore.track_pricing ? 1 : 0) : (doc.track_pricing === 1 || doc.track_pricing === true ? 1 : 0);
      const finalExternalName = catalogStore?.external_name || doc.external_name || doc.item_name || "";
      const finalLastUpdated = hasCatalogPrice 
        ? (catalogStore?.last_updated || existingEntry.last_updated || new Date().toISOString())
        : (doc.last_updated || (doc.synchronized_at instanceof Date ? doc.synchronized_at.toISOString() : (typeof doc.synchronized_at === 'string' ? doc.synchronized_at : null)) || catalogStore?.last_updated || new Date().toISOString());

      updatedStores[storeKey] = {
        store_name: storeName,
        postal_code: doc.postal_code || catalogStore?.postal_code || "K7H3C6",
        store_id: storeId,
        regular_price: finalRegPrice,
        sale_price: finalSalePrice,
        is_on_sale: finalIsOnSale,
        lookup_url: finalLookupUrl,
        valid_until: finalValidUntil,
        last_updated: finalLastUpdated,
        track_pricing: finalTrackPricing,
        external_name: finalExternalName,
      };
      
      // Determine the best price info from all available stores
      const storeKeys = Object.keys(updatedStores);
      let lowestStoreKey = storeKey;
      let lowestPrice = Infinity;
      for (const key of storeKeys) {
        const s = updatedStores[key];
        const p = (s.is_on_sale && s.sale_price !== null && s.sale_price !== undefined && !isSaleExpired(s.valid_until)) ? s.sale_price : (s.regular_price || 0);
        if (p < lowestPrice && p > 0) {
          lowestPrice = p;
          lowestStoreKey = key;
        }
      }
      
      const bestStore = updatedStores[lowestStoreKey];
      
      prices[targetKey] = {
        item_name: isCatalogItem ? (canonicalName || existingEntry.item_name || "") : (doc.item_name || existingEntry.item_name || ""),
        config_name: isCatalogItem ? (canonicalName || existingEntry.config_name || "") : (doc.config_name || existingEntry.config_name || ""),
        store_name: bestStore.store_name,
        postal_code: bestStore.postal_code,
        store_id: bestStore.store_id,
        regular_price: bestStore.regular_price,
        sale_price: bestStore.sale_price,
        is_on_sale: bestStore.is_on_sale,
        last_updated: bestStore.last_updated || new Date().toISOString(),
        lookup_url: bestStore.lookup_url || doc.url || doc.lookup_url || "",
        valid_until: bestStore.valid_until || "",
        track_pricing: bestStore.track_pricing !== undefined ? (bestStore.track_pricing ? 1 : 0) : 0,
        external_name: bestStore.external_name || "",
        stores: updatedStores
      };
    }
  } catch (err) {
    console.warn("MongoDB merge failed (will use blob store fallback only):", err);
  }
  return prices;
}

async function getMergedPrices(): Promise<any> {
  const catalog = await blobGetCombinedCatalog();
  const prices: any = {};
  
  // Create maps from catalog item ID to their primary price key and canonical name
  const catalogIdToKey: Record<string, string> = {};
  const catalogIdToName: Record<string, string> = {};

  function localEnsureHttps(url: string): string {
    if (!url) return "";
    let target = url.trim();
    if (target.startsWith("//")) {
      target = "https:" + target;
    } else if (target.startsWith("http://")) {
      target = "https://" + target.substring(7);
    } else if (!target.startsWith("https://")) {
      target = "https://" + target;
    }
    return target;
  }

  for (const item of catalog.items || []) {
    const stores: any = {};
    let bestStoreId = "";
    let lowestPrice = Infinity;

    for (const [storeId, link] of Object.entries(item.stores || {})) {
      if (!link) continue;

      // Skip store configs that do not have actual price info or lookup URL config
      const hasRegularPrice = link.regular_price !== null && link.regular_price !== undefined;
      if (!hasRegularPrice && !link.url) continue;

      const storeConfig = catalog.stores?.[storeId];
      const storeName = storeConfig?.store_name || storeId;
      const postalCode = storeConfig?.postal_code || "K7H3C6";

      stores[storeId] = {
        store_name: storeName,
        postal_code: postalCode,
        store_id: storeId,
        regular_price: link.regular_price,
        sale_price: link.sale_price,
        is_on_sale: link.is_on_sale,
        lookup_url: link.url,
        valid_until: link.valid_until || "",
        track_pricing: link.track_pricing ? 1 : 0,
        external_name: link.external_name || "",
      };

      const currentPrice = (link.is_on_sale && link.sale_price !== null && link.sale_price !== undefined)
        ? link.sale_price
        : (link.regular_price || 0);

      if (currentPrice > 0 && currentPrice < lowestPrice) {
        lowestPrice = currentPrice;
        bestStoreId = storeId;
      }
    }

    let mainUpc = "";
    for (const link of Object.values(item.stores || {})) {
      if (link && link.upc) {
        mainUpc = link.upc;
        break;
      }
    }
    const itemKey = mainUpc || item.id || `catalog-${item.name.replace(/\s+/g, "-").toLowerCase()}`;
    catalogIdToKey[item.id] = itemKey;
    catalogIdToName[item.id] = item.name;

    // Only return a pricing record if we found at least one store with a valid price
    if (bestStoreId) {
      const bestStore = stores[bestStoreId];

      prices[itemKey] = {
        item_name: item.name,
        config_name: item.name,
        store_name: bestStore.store_name,
        postal_code: bestStore.postal_code,
        store_id: bestStore.store_id,
        regular_price: bestStore.regular_price,
        sale_price: bestStore.sale_price,
        is_on_sale: bestStore.is_on_sale,
        last_updated: item.last_updated || new Date().toISOString(),
        lookup_url: bestStore.lookup_url || "",
        valid_until: bestStore.valid_until || "",
        track_pricing: bestStore.track_pricing || 0,
        external_name: bestStore.external_name || "",
        stores: stores,
      };
    }
  }

  return mergeMongoPrices(prices, catalogIdToKey, catalogIdToName);
}

function extractUpcFromUrl(url: string): string | null {
  if (!url) return null;
  // Match "/p/123456789" or "/p/064420055019" which represents the product UPC/SKU
  const pMatch = url.match(/\/p\/([a-zA-Z0-9_\-]+)/);
  if (pMatch && pMatch[1]) {
    return pMatch[1];
  }
  // Alternate match: look for sequences of digits between 8-15 characters at the end of path segments
  const digitMatch = url.match(/\/(\d{8,15})([?\/]|$)/);
  if (digitMatch && digitMatch[1]) {
    return digitMatch[1];
  }
  return null;
}

// Handle preflight for append-grocery
app.options("/api/append-grocery", (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-GroceryScout-Token");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.status(204).end();
});

// 0. APPEND-GROCERY POST Endpoint (Tampermonkey client uploads)
app.post("/api/append-grocery", async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-GroceryScout-Token");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");

  // Security Protocol: Match 'X-GroceryScout-Token' header in case-insensitive environmental variable
  const token = req.headers["x-groceryscout-token"];
  
  // Checking lowercase, uppercase and camelcase environmental variable names to avoid case mismatches
  const secretToken = process.env.GROCERY_SECRET_TOKEN || 
                      process.env.Grocery_SECRET_TOKEN || 
                      process.env.grocery_secret_token;

  if (!secretToken || token !== secretToken) {
    res.status(401).json({
      error: "Unauthorized: Missing or invalid secure authentication credentials"
    });
    return;
  }

  try {
    const { key, data } = req.body;

    if (!key || !data || typeof data !== "object") {
      res.status(400).json({
        error: 'Bad Request: "key" string and "data" object are required in post request payload.'
      });
      return;
    }

    // Read catalog registry directly from combined-catalog.json
    const catalog = await blobGetCombinedCatalog();
    const catalogItems: RegularItem[] = (catalog.items || []).map((item) => ({
      id: item.id,
      name: item.name,
      category: item.category,
      selected: false,
      unit: item.unit,
      units: item.units
    }));

    const ensureHttps = (url: string): string => {
      if (!url) return "";
      let trimmed = url.trim();
      trimmed = trimmed.replace(/["\\']/g, "");
      if (!trimmed) return "";
      if (/^https?:\/\//i.test(trimmed)) {
        return trimmed;
      }
      return `https://${trimmed}`;
    };

    const dbUrl = ensureHttps(data.lookup_url || data.url || data.raw_share_url || data.rawUrl || "");

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

    const normalizedDbUrl = normalizeUrl(dbUrl);
    const urlAlreadyExists = normalizedDbUrl ? (catalog.items || []).some((item: any) => 
      Object.values(item.stores || {}).some((s: any) => s && s.url && normalizeUrl(s.url) === normalizedDbUrl)
    ) : false;

    let catalogMatchResult = {
      matched: false,
      matchType: "created", // "exact" | "gemini" | "created"
      catalogItemName: "",
      urlAlreadyExists: urlAlreadyExists
    };

    let correctedData = { 
      ...data,
      track_pricing: true
    };

    // Clean and parse pricing fields if present
    if (data.regular_price !== undefined) {
      correctedData.regular_price = data.regular_price !== null && data.regular_price !== ""
        ? Number(String(data.regular_price).replace(/[^0-9.]/g, ""))
        : null;
    }
    if (data.sale_price !== undefined) {
      correctedData.sale_price = data.sale_price !== null && data.sale_price !== ""
        ? Number(String(data.sale_price).replace(/[^0-9.]/g, ""))
        : null;
    }
    if (data.is_on_sale !== undefined) {
      correctedData.is_on_sale = data.is_on_sale === true || data.is_on_sale === 1 || data.is_on_sale === "true";
    } else if (correctedData.sale_price !== undefined) {
      correctedData.is_on_sale = correctedData.sale_price !== null && correctedData.sale_price > 0;
    }
    if (data.valid_until !== undefined) {
      correctedData.valid_until = data.valid_until ? String(data.valid_until).trim() : null;
    }

    let isUnmatchedCreation = false;
    let proposedName = "";
    let proposedCategory = "";
    let proposedUnit = "";
    let proposedUnits: number | undefined = undefined;

    const configName = data.config_name || data.item_name || "";

    if (configName) {
      try {
        // Programmatic fast path for exact match
        const exactMatch = catalogItems.find(
          (item) => item.name.toLowerCase() === configName.toLowerCase()
        );

        if (exactMatch) {
          correctedData.config_name = exactMatch.name;
          correctedData.item_name = exactMatch.name;
          correctedData.matched_catalog_id = exactMatch.id;
          correctedData.match_confidence = 100;
          correctedData.match_reason = "Programmatic exact string match on ingestion";
          correctedData.original_config_name = configName;

          catalogMatchResult.matched = true;
          catalogMatchResult.matchType = "exact";
          catalogMatchResult.catalogItemName = exactMatch.name;
        } else {
          // Apply highly optimized Gemini matcher
          const matchResult = await evaluateGeminiMatch(configName, catalogItems);
          if (matchResult.matched_id) {
            const matchedItem = catalogItems.find((item) => item.id === matchResult.matched_id);
            if (matchedItem) {
              correctedData.config_name = matchedItem.name;
              correctedData.item_name = matchedItem.name;
              correctedData.matched_catalog_id = matchedItem.id;
              correctedData.match_confidence = matchResult.confidence;
              correctedData.match_reason = matchResult.reason;
              correctedData.original_config_name = configName;
              console.log(`Matched incoming "${configName}" -> corrected to catalog name "${matchedItem.name}" (${matchResult.confidence}% confidence)`);

              catalogMatchResult.matched = true;
              catalogMatchResult.matchType = "gemini";
              catalogMatchResult.catalogItemName = matchedItem.name;
            }
          } else {
            // Unmatched ingestion fallback: Automatically create a new catalog item as requested
            // to ensure pricing actually appears in the UI instead of silently disappearing
            proposedName = matchResult.proposed_new_item?.name || configName;
            proposedCategory = data.category || matchResult.proposed_new_item?.category || "Bakery";
            proposedUnit = data.unit || "unit";
            proposedUnits = data.units !== undefined && data.units !== null ? Number(data.units) : undefined;

            const newId = `regular-unmatched-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
            isUnmatchedCreation = true;

            catalogMatchResult.matched = false;
            catalogMatchResult.matchType = "created";
            catalogMatchResult.catalogItemName = proposedName;

            // Link pricing record to this newly-spawned item
            correctedData.config_name = proposedName;
            correctedData.item_name = proposedName;
            correctedData.matched_catalog_id = newId;
            correctedData.match_confidence = matchResult.confidence || 50;
            correctedData.match_reason = `Auto-created catalog item from unmatched scrape (Gemini suggested "${proposedName}")`;
            correctedData.original_config_name = configName;
          }
        }
      } catch (matchErr) {
        console.error("Gemini matching error in /api/append-grocery:", matchErr);
      }
    }

    let finalKey = key;
    let urlToSave = ensureHttps(data.url || data.lookup_url || data.lookupUrl || data.raw_share_url || "");

    const isUrl = (str: string) => {
      if (!str) return false;
      const s = str.trim().toLowerCase();
      return (
        s.startsWith("http://") || 
        s.startsWith("https://") || 
        s.startsWith("www.") || 
        s.includes("metro.ca") || 
        s.includes("foodbasics.ca") || 
        s.includes("loblaws.ca") || 
        s.includes("nofrills.ca") ||
        s.includes(".ca") ||
        s.includes(".com") ||
        s.includes("product")
      );
    };

    if (isUrl(key)) {
      urlToSave = ensureHttps(key);
      const extracted = extractUpcFromUrl(key);
      if (extracted) {
        finalKey = extracted;
      } else {
        const dUpc = data.upc || data.id;
        if (dUpc && !isUrl(String(dUpc))) {
          finalKey = String(dUpc);
        } else {
          finalKey = `manual-${Date.now()}`;
        }
      }
    }

    // Ensure correctedData contains correct structured values
    correctedData.upc = finalKey;
    correctedData.url = urlToSave;
    correctedData.lookup_url = urlToSave;
    correctedData.raw_share_url = data.raw_share_url || urlToSave;

    let priceDoc: any = null;
    let result = { matchedCount: 0, modifiedCount: 0, upsertedCount: 1, upsertedId: finalKey };

    try {
      const { db } = await getMongoDatabase();
      const pricesCollection = db.collection("prices");

      // Fetch existing pricing record from MongoDB if it exists to preserve its store_id and other stable fields
      const existingDoc = await pricesCollection.findOne({ _id: finalKey });
      const existingStoreId = existingDoc?.store_id || null;
      const existingStoreName = existingDoc?.store_name || null;

      const dbUrl = ensureHttps(data.lookup_url || data.url || data.raw_share_url || req.body.lookup_url || "");
      const lowerUrl = dbUrl.toLowerCase();

      let resolvedStoreId = data.store_id || req.body.store_id || existingStoreId;
      if (!resolvedStoreId) {
        if (lowerUrl.includes("metro.ca")) resolvedStoreId = "metro";
        else if (lowerUrl.includes("loblaws.ca")) resolvedStoreId = "loblaws";
        else if (lowerUrl.includes("nofrills.ca")) resolvedStoreId = "nofrills";
        else if (lowerUrl.includes("freshco")) resolvedStoreId = "freshco";
        else if (lowerUrl.includes("yourindependentgrocer")) resolvedStoreId = "yourindependentgrocer";
        else resolvedStoreId = "7923194"; // foodbasics
      }

      let resolvedStoreName = "Food Basics";
      const lowerStoreId = String(resolvedStoreId).toLowerCase();
      if (lowerStoreId === "7923194" || lowerStoreId === "foodbasics") {
        if (lowerUrl.includes("freshco")) {
          resolvedStoreId = "freshco";
          resolvedStoreName = "FreshCo";
        } else if (lowerUrl.includes("yourindependentgrocer")) {
          resolvedStoreId = "yourindependentgrocer";
          resolvedStoreName = "Your Independent Grocer";
        } else {
          resolvedStoreName = "Food Basics";
        }
      } else if (lowerStoreId === "metro") {
        resolvedStoreName = "Metro";
      } else if (lowerStoreId === "loblaws") {
        resolvedStoreName = "Loblaws";
      } else if (lowerStoreId === "nofrills") {
        resolvedStoreName = "No Frills";
      } else if (lowerStoreId === "freshco" || lowerStoreId.includes("freshco")) {
        resolvedStoreName = "FreshCo";
      } else if (lowerStoreId === "yourindependentgrocer" || lowerStoreId.includes("yourindependentgrocer")) {
        resolvedStoreName = "Your Independent Grocer";
      } else {
        resolvedStoreName = data.store_name || req.body.store_name || existingStoreName || "Food Basics";
      }

      correctedData.store_id = resolvedStoreId;
      correctedData.store_name = resolvedStoreName;

      // Upsert the record targeting the clean UPC as the _id identifier
      const updateRes = await pricesCollection.updateOne(
        { _id: finalKey },
        {
          $set: {
            _id: finalKey,
            ...correctedData,
            synchronized_at: new Date()
          }
        },
        { upsert: true }
      );
      if (updateRes) {
        result = {
          matchedCount: updateRes.matchedCount,
          modifiedCount: updateRes.modifiedCount,
          upsertedCount: updateRes.upsertedCount,
          upsertedId: updateRes.upsertedId ? (updateRes.upsertedId._id || updateRes.upsertedId) : finalKey
        };
      }

      // Read the logged entry directly from the MongoDB prices table to populate the combined catalog
      priceDoc = await pricesCollection.findOne({ _id: finalKey });
    } catch (dbErr: any) {
      console.warn("MongoDB write skipped in append-grocery (using local fallback emulation):", dbErr.message || dbErr);

      // Local fallback emulation: construct priceDoc directly from request/correctedData
      const dbUrl = ensureHttps(data.lookup_url || data.url || data.raw_share_url || req.body.lookup_url || "");
      const lowerUrl = dbUrl.toLowerCase();

      let resolvedStoreId = data.store_id || req.body.store_id || "7923194";
      if (resolvedStoreId === "7923194" || resolvedStoreId === "foodbasics") {
        if (lowerUrl.includes("metro.ca")) resolvedStoreId = "metro";
        else if (lowerUrl.includes("loblaws.ca")) resolvedStoreId = "loblaws";
        else if (lowerUrl.includes("nofrills.ca")) resolvedStoreId = "nofrills";
        else if (lowerUrl.includes("freshco")) resolvedStoreId = "freshco";
        else if (lowerUrl.includes("yourindependentgrocer")) resolvedStoreId = "yourindependentgrocer";
      }

      let resolvedStoreName = "Food Basics";
      const lowerStoreId = String(resolvedStoreId).toLowerCase();
      if (lowerStoreId === "7923194" || lowerStoreId === "foodbasics") {
        resolvedStoreName = "Food Basics";
      } else if (lowerStoreId === "metro") {
        resolvedStoreName = "Metro";
      } else if (lowerStoreId === "loblaws") {
        resolvedStoreName = "Loblaws";
      } else if (lowerStoreId === "nofrills") {
        resolvedStoreName = "No Frills";
      } else if (lowerStoreId === "freshco" || lowerStoreId.includes("freshco")) {
        resolvedStoreName = "FreshCo";
      } else if (lowerStoreId === "yourindependentgrocer" || lowerStoreId.includes("yourindependentgrocer")) {
        resolvedStoreName = "Your Independent Grocer";
      } else {
        resolvedStoreName = data.store_name || req.body.store_name || "Food Basics";
      }

      correctedData.store_id = resolvedStoreId;
      correctedData.store_name = resolvedStoreName;

      priceDoc = {
        _id: finalKey,
        ...correctedData,
        synchronized_at: new Date()
      };
    }

    if (priceDoc && priceDoc.matched_catalog_id) {
      // Serialize catalog updates to prevent race conditions
      catalogWriteMutex = catalogWriteMutex.then(async () => {
        try {
          const freshCatalog = await blobGetCombinedCatalog();
          let catalogItem: any = null;

          if (isUnmatchedCreation) {
            // Concurrent Duplicate Prevention: Check if another concurrent request already created an item with the proposedName
            const existingItem = (freshCatalog.items || []).find(
              (i: any) => i.name.toLowerCase() === proposedName.toLowerCase()
            );
            if (existingItem) {
              catalogItem = existingItem;
              priceDoc.matched_catalog_id = existingItem.id;
              console.log(`[Concurrent Duplicate Prevention] Reusing existing catalog item "${catalogItem.name}" (${catalogItem.id}) instead of creating duplicate.`);
            } else {
              catalogItem = {
                id: priceDoc.matched_catalog_id,
                name: proposedName,
                category: proposedCategory,
                unit: proposedUnit,
                units: proposedUnits,
                requires_scraping: true,
                stores: {}
              };
              if (!freshCatalog.items) {
                freshCatalog.items = [];
              }
              freshCatalog.items.push(catalogItem);
              console.log(`[Auto-Create] Auto-created catalog item "${proposedName}" (ID ${catalogItem.id}) under combined-catalog registry`);
            }
          } else {
            catalogItem = (freshCatalog.items || []).find((i: any) => i.id === priceDoc.matched_catalog_id);
          }

          if (catalogItem) {
            // Update attributes if provided
            if (data.category) catalogItem.category = data.category;
            if (data.unit) catalogItem.unit = data.unit;
            if (data.units !== undefined) catalogItem.units = data.units !== null ? Number(data.units) : undefined;

            const dbUrl = ensureHttps(priceDoc.lookup_url || priceDoc.url || priceDoc.raw_share_url || "");
            let fStoreKey = "foodbasics";
            const lowerUrl = dbUrl.toLowerCase();
            if (lowerUrl.includes("metro.ca")) {
              fStoreKey = "metro";
            } else if (lowerUrl.includes("loblaws.ca")) {
              fStoreKey = "loblaws";
            } else if (lowerUrl.includes("nofrills.ca")) {
              fStoreKey = "nofrills";
            } else if (lowerUrl.includes("freshco")) {
              fStoreKey = "freshco";
            } else if (lowerUrl.includes("yourindependentgrocer")) {
              fStoreKey = "yourindependentgrocer";
            } else if (lowerUrl.includes("foodbasics")) {
              fStoreKey = "foodbasics";
            } else {
              const lowerId = String(priceDoc.store_id || "").toLowerCase();
              if (lowerId === "metro") fStoreKey = "metro";
              else if (lowerId === "loblaws") fStoreKey = "loblaws";
              else if (lowerId === "nofrills") fStoreKey = "nofrills";
              else if (lowerId === "freshco" || lowerId.includes("freshco")) fStoreKey = "freshco";
              else if (lowerId === "yourindependentgrocer" || lowerId.includes("yourindependentgrocer")) fStoreKey = "yourindependentgrocer";
              else if (lowerId === "7923194" || lowerId === "foodbasics") fStoreKey = "foodbasics";
              else fStoreKey = lowerId || "foodbasics";
            }

            if (!catalogItem.stores) {
              catalogItem.stores = {};
            }
            const existingStoreLink = (catalogItem.stores[fStoreKey] || {}) as any;

            let regVal = typeof priceDoc.regular_price === "number" ? priceDoc.regular_price : (priceDoc.regular_price ? parseFloat(priceDoc.regular_price) : null);
            let saleVal = typeof priceDoc.sale_price === "number" ? priceDoc.sale_price : (priceDoc.sale_price ? parseFloat(priceDoc.sale_price) : null);
            let isOnSaleVal = priceDoc.is_on_sale !== undefined ? (priceDoc.is_on_sale ? 1 : 0) : (saleVal !== null ? 1 : 0);

            if (regVal === null && existingStoreLink.regular_price !== undefined) {
              regVal = existingStoreLink.regular_price;
            }
            if (saleVal === null && existingStoreLink.sale_price !== undefined) {
              saleVal = existingStoreLink.sale_price;
            }
            if (priceDoc.is_on_sale === undefined && existingStoreLink.is_on_sale !== undefined) {
              isOnSaleVal = existingStoreLink.is_on_sale;
            }

            catalogItem.requires_scraping = true;
            catalogItem.stores[fStoreKey] = {
              url: dbUrl,
              upc: priceDoc._id || finalKey,
              regular_price: regVal,
              sale_price: saleVal,
              is_on_sale: isOnSaleVal,
              external_name: priceDoc.item_name || priceDoc.config_name || existingStoreLink.external_name || "",
              track_pricing: true,
              valid_until: priceDoc.valid_until || existingStoreLink.valid_until || "",
              is_verified: true
            };

            await blobSetCombinedCatalog(freshCatalog);
            console.log(`Successfully synced matched item "${catalogItem.name}" to combined-catalog under store "${fStoreKey}" from MongoDB prices log entry.`);
          }
        } catch (catalogErr) {
          console.error("Error updating combined-catalog in /api/append-grocery:", catalogErr);
        }
      }).catch(() => {});
      await catalogWriteMutex;
    }

    res.json({
      success: true,
      message: `Successfully synchronized pricing record under target key: ${finalKey}`,
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount,
      upsertedCount: result.upsertedCount,
      upsertedId: result.upsertedId ? (result.upsertedId._id || result.upsertedId) : finalKey,
      catalogMatch: catalogMatchResult
    });
  } catch (error: any) {
    console.error("Error in POST /api/append-grocery:", error);
    res.status(500).json({
      error: "Internal Server Error",
      details: error?.message || String(error)
    });
  }
});

// GET /api/flipp/resolve
app.get("/api/flipp/resolve", async (req, res) => {
  try {
    const storeName = req.query.storeName as string;
    const itemName = req.query.itemName as string;
    const configName = req.query.configName as string;
    const scrapedName = req.query.scrapedName as string;
    const postalCode = req.query.postalCode as string || "K7H3C6";

    if (!storeName || !itemName) {
      return res.status(400).json({ error: "Missing required query parameters: storeName and itemName" });
    }

    let cleanStore = storeName.trim();
    const lowerStore = cleanStore.toLowerCase();
    if (lowerStore.includes("food basics") || lowerStore === "fb" || lowerStore === "foodbasics") cleanStore = "Food Basics";
    else if (lowerStore.includes("no frills") || lowerStore === "nofrills" || lowerStore === "nf") cleanStore = "No Frills";
    else if (lowerStore.includes("your independent grocer") || lowerStore === "yourindependentgrocer" || lowerStore === "yig") cleanStore = "Your Independent Grocer";
    else if (lowerStore.includes("loblaws") || lowerStore === "loblaws" || lowerStore === "lb") cleanStore = "Loblaws";
    else if (lowerStore.includes("metro") || lowerStore === "metro" || lowerStore === "mt") cleanStore = "Metro";
    else if (lowerStore.includes("freshco") || lowerStore === "freshco" || lowerStore === "fc") cleanStore = "FreshCo";
    else if (lowerStore.includes("walmart") || lowerStore === "walmart") cleanStore = "Walmart";

    let cleanItem = scrapedName || configName || itemName;
    cleanItem = cleanItem
      .replace(/\s*\(\d+[^)]*\)/gi, "") 
      .replace(/\s*-\s*\d+$/gi, "") 
      .replace(/\s*-\s*\w+$/gi, "") 
      .replace(/\s*\b\d+g\b/gi, "")    
      .replace(/\s*\b\d+-pack\b/gi, "") 
      .trim();

    const searchTerms = `${cleanStore} ${cleanItem}`.trim();
    const flippApiUrl = `https://backflipp.wishabi.com/flipp/items/search?locale=en-ca&postal_code=${encodeURIComponent(postalCode.trim())}&q=${encodeURIComponent(searchTerms)}`;
    
    const fetchResponse = await fetch(flippApiUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      }
    });

    let targetUrl = `https://flipp.com/search?q=${encodeURIComponent(searchTerms)}&postal_code=${encodeURIComponent(postalCode)}`;

    if (fetchResponse.ok) {
      const data: any = await fetchResponse.json();
      const items = data.items || [];
      const merchantItems = items.filter((it: any) => {
        const itMerchant = (it.merchant_name || "").toLowerCase();
        const targetMerchant = cleanStore.toLowerCase();
        return itMerchant.includes(targetMerchant) || targetMerchant.includes(itMerchant);
      });

      if (merchantItems.length > 0) {
        const bestItem = merchantItems[0];
        if (bestItem.id) {
          return res.json({ url: `https://flipp.com/item/${bestItem.id}?postal_code=${encodeURIComponent(postalCode)}`, isMatch: true });
        } else if (bestItem.flyer_id) {
          return res.json({ url: `https://flipp.com/flyer/${bestItem.flyer_id}?postal_code=${encodeURIComponent(postalCode)}`, isMatch: false });
        }
      }
    }

    // SECONDARY STAGE: Try simplified query by stripping flavor/descriptive terms (e.g. unsalted, salted, organic)
    const simplifiedItem = cleanItem
      .replace(/\b(unsalted|salted|salted\/unsalted|organic|original|sweet|fresh|frozen|large|small|sliced|whole)\b/gi, "")
      .replace(/\s+/g, " ")
      .trim();

    if (simplifiedItem && simplifiedItem !== cleanItem) {
      const secondaryTerms = `${cleanStore} ${simplifiedItem}`.trim();
      try {
        const secondaryApiUrl = `https://backflipp.wishabi.com/flipp/items/search?locale=en-ca&postal_code=${encodeURIComponent(postalCode.trim())}&q=${encodeURIComponent(secondaryTerms)}`;
        const secondaryResponse = await fetch(secondaryApiUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
          }
        });
        if (secondaryResponse.ok) {
          const secData: any = await secondaryResponse.json();
          const secItems = secData.items || [];
          const secMerchantItems = secItems.filter((it: any) => {
            const itMerchant = (it.merchant_name || "").toLowerCase();
            const targetMerchant = cleanStore.toLowerCase();
            return itMerchant.includes(targetMerchant) || targetMerchant.includes(itMerchant);
          });

          if (secMerchantItems.length > 0) {
            const bestSecItem = secMerchantItems[0];
            if (bestSecItem.id) {
              return res.json({ url: `https://flipp.com/item/${bestSecItem.id}?postal_code=${encodeURIComponent(postalCode)}`, isMatch: true });
            } else if (bestSecItem.flyer_id) {
              return res.json({ url: `https://flipp.com/flyer/${bestSecItem.flyer_id}?postal_code=${encodeURIComponent(postalCode)}`, isMatch: false });
            }
          }
        }
      } catch (secErr) {
        console.error("Error in secondary simplified search:", secErr);
      }
    }

    // TERTIARY STAGE: If specific item search returned 0 items, query for the store flyer itself
    try {
      const storeApiUrl = `https://backflipp.wishabi.com/flipp/items/search?locale=en-ca&postal_code=${encodeURIComponent(postalCode.trim())}&q=${encodeURIComponent(cleanStore)}`;
      const storeResponse = await fetch(storeApiUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
      });
      if (storeResponse.ok) {
        const storeData: any = await storeResponse.json();
        const storeItems = storeData.items || [];
        const matchedStoreItem = storeItems.find((it: any) => {
          const itMerchant = (it.merchant_name || "").toLowerCase();
          const targetMerchant = cleanStore.toLowerCase();
          return itMerchant.includes(targetMerchant) || targetMerchant.includes(itMerchant);
        });
        if (matchedStoreItem && matchedStoreItem.flyer_id) {
          return res.json({ url: `https://flipp.com/flyer/${matchedStoreItem.flyer_id}?postal_code=${encodeURIComponent(postalCode)}`, isMatch: false });
        }
      }
    } catch (storeErr) {
      console.error("Error in fallback store flyer resolution:", storeErr);
    }

    return res.json({ url: targetUrl, isMatch: false });
  } catch (error: any) {
    console.error("Error in /api/flipp/resolve:", error);
    const storeName = req.query.storeName as string || "";
    const itemName = req.query.itemName as string || "";
    const postalCode = req.query.postalCode as string || "K7H3C6";
    const fallbackUrl = `https://flipp.com/search?q=${encodeURIComponent(storeName + " " + itemName)}&postal_code=${encodeURIComponent(postalCode)}`;
    return res.json({ url: fallbackUrl });
  }
});

// 1. GET /api/sync
app.get("/api/sync", async (req, res) => {
  try {
    const [groceryItems, regularItems, syncMeta, prices, purchaseLogs] = await Promise.all([
      blobGetGroceryItems(),
      blobGetRegularItems(),
      blobGetSyncMeta(),
      getMergedPrices(),
      blobGetPurchaseLogs(),
    ]);
    res.json({ groceryItems, regularItems, syncMeta, prices, purchaseLogs });
  } catch (error) {
    console.error("GET /api/sync error:", error);
    res.status(500).json({ error: "Failed to fetch sync data", details: String(error) });
  }
});

// 2. PUT /api/sync
app.put("/api/sync", async (req, res) => {
  try {
    const { groceryItems, regularItems, purchaseLogs, deviceName } = req.body;

    if (groceryItems) {
      await blobSetGroceryItems(groceryItems);
    }
    if (regularItems) {
      await blobSetRegularItems(regularItems);
    }
    if (purchaseLogs && Array.isArray(purchaseLogs)) {
      const existingLogs = await blobGetPurchaseLogs();
      const mergedLogsMap = new Map<string, PurchaseLogEntry>();
      for (const log of existingLogs) {
        mergedLogsMap.set(log.id, log);
      }
      for (const log of purchaseLogs) {
        mergedLogsMap.set(log.id, log);
      }
      await blobSetPurchaseLogs(Array.from(mergedLogsMap.values()));
    }

    const syncMeta = await blobUpdateSyncMeta(deviceName || "Unknown");
    res.json({ success: true, syncMeta });
  } catch (error) {
    console.error("PUT /api/sync error:", error);
    res.status(500).json({ error: "Failed to update sync data", details: String(error) });
  }
});

// 3. GET /api/prices
app.get("/api/prices", async (req, res) => {
  try {
    const mongodbOnly = req.query.mongodbOnly === "true";
    if (mongodbOnly) {
      const { db } = await getMongoDatabase();
      const pricesCollection = db.collection("prices");
      const docs = await pricesCollection.find().toArray();
      const prices: any = {};
      for (const doc of docs) {
        const upc = doc._id || doc.upc;
        if (!upc) continue;
        
        const lastUpdated = doc.synchronized_at 
          ? (doc.synchronized_at instanceof Date ? doc.synchronized_at.toISOString() : String(doc.synchronized_at)) 
          : (doc.last_updated || new Date().toISOString());

        prices[upc] = {
          item_name: doc.item_name,
          config_name: doc.config_name,
          store_name: doc.store_name,
          postal_code: doc.postal_code,
          store_id: doc.store_id,
          regular_price: doc.regular_price,
          sale_price: doc.sale_price,
          is_on_sale: doc.is_on_sale ? 1 : 0,
          last_updated: lastUpdated,
          lookup_url: doc.lookup_url || doc.url || "",
          valid_until: doc.valid_until || "",
          track_pricing: doc.track_pricing ? 1 : 0,
          external_name: doc.external_name || "",
          match_confidence: doc.match_confidence,
          match_reason: doc.match_reason,
          matched_catalog_id: doc.matched_catalog_id
        };
      }
      res.json({ prices });
      return;
    }
    const prices = await getMergedPrices();
    res.json({ prices });
  } catch (error) {
    console.error("GET /api/prices error:", error);
    res.status(500).json({ error: "Failed to fetch prices data", details: String(error) });
  }
});

// 3.5. PUT /api/prices (Secure scraper update)
app.put("/api/prices", async (req, res) => {
  try {
    const prices = req.body;
    if (!prices || typeof prices !== "object") {
      res.status(400).json({ error: "Invalid prices payload structure" });
      return;
    }

    // Simple Bearer authentication guard
    const authHeader = req.headers.authorization;
    const expectedApiKey = process.env.SCRAPER_API_KEY || "dev-secret-key";
    if (process.env.SCRAPER_API_KEY && authHeader !== `Bearer ${expectedApiKey}`) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const existingPrices = await blobGetPrices();
    const updatedPrices = { ...existingPrices, ...prices };
    await blobSetPrices(updatedPrices);
    res.json({ success: true, count: Object.keys(prices).length });
  } catch (error) {
    console.error("PUT /api/prices error:", error);
    res.status(500).json({ error: "Failed to update prices", details: String(error) });
  }
});

// 3.6. DELETE /api/prices (Clear MongoDB Ingestion Logs)
app.delete("/api/prices", async (req, res) => {
  try {
    const { db } = await getMongoDatabase();
    const pricesCollection = db.collection("prices");
    await pricesCollection.deleteMany({});
    res.json({ success: true, message: "MongoDB prices ingestion logs cleared successfully" });
  } catch (error: any) {
    console.error("DELETE /api/prices error:", error);
    res.status(500).json({ error: "Failed to clear prices ingestion logs", details: String(error) });
  }
});

// Telemetry GET /api/ScapeLogging
app.get(["/api/ScapeLogging", "/api/scrape-logging"], async (req, res) => {
  try {
    const logs = await blobGetTelemetry();
    res.json(logs);
  } catch (error) {
    console.error("GET telemetry error:", error);
    res.status(500).json({ error: "Failed to fetch telemetry logs" });
  }
});

// Telemetry PUT /api/ScapeLogging (appends log entries)
app.put(["/api/ScapeLogging", "/api/scrape-logging"], async (req, res) => {
  try {
    const payload = req.body;
    if (!payload || typeof payload !== "object") {
      res.status(400).json({ error: "Invalid log payload structure" });
      return;
    }

    const authHeader = req.headers.authorization;
    const expectedApiKey = process.env.SCRAPER_API_KEY || "dev-secret-key";
    if (process.env.SCRAPER_API_KEY && authHeader !== `Bearer ${expectedApiKey}`) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    if (Array.isArray(payload)) {
      const telemetry = await blobGetTelemetry();
      const combined = [...telemetry, ...payload].slice(-1000);
      await blobSetTelemetry(combined);
    } else {
      await blobAppendTelemetry(payload);
    }
    res.json({ success: true });
  } catch (error) {
    console.error("PUT telemetry error:", error);
    res.status(500).json({ error: "Failed to save telemetry logs" });
  }
});

// --- Gemini Flash Matching and Test Runner Endpoints ---
app.post("/api/match/evaluate", async (req, res) => {
  try {
    const { scrapedName } = req.body;
    if (!scrapedName) {
      res.status(400).json({ error: "scrapedName is required in body" });
      return;
    }
    const catalogItems = await blobGetRegularItems();
    const matchResult = await evaluateGeminiMatch(scrapedName, catalogItems);
    res.json(matchResult);
  } catch (error: any) {
    console.error("POST /api/match/evaluate error:", error);
    res.status(500).json({ error: "Failed to evaluate item match", details: String(error) });
  }
});

app.post("/api/match/run-tests", async (req, res) => {
  try {
    const testResults = await runAllMatchingTests();
    res.json(testResults);
  } catch (error: any) {
    console.error("POST /api/match/run-tests error:", error);
    res.status(500).json({ error: "Failed to execute match tests", details: String(error) });
  }
});

// 4. GET /api/regular-items
app.get("/api/regular-items", async (req, res) => {
  try {
    const items = await blobGetRegularItems();
    res.json({ items });
  } catch (error) {
    console.error("GET /api/regular-items error:", error);
    res.status(500).json({ error: "Failed to fetch regular items", details: String(error) });
  }
});

// 5. POST /api/regular-items (CSV upload)
app.post("/api/regular-items", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: "No file uploaded" });
      return;
    }

    const csvContent = req.file.buffer.toString("utf-8");
    const { items, errors } = parseCsv(csvContent);

    if (items.length > 0) {
      await blobSetRegularItems(items);
    }

    res.json({ items, errors });
  } catch (error) {
    console.error("POST /api/regular-items error:", error);
    res.status(500).json({ error: "Failed to upload and parse CSV", details: String(error) });
  }
});

// 5.5. POST /api/prices/import-json (JSON prices upload and deduplication)
app.post("/api/prices/import-json", upload.single("file"), async (req, res) => {
  try {
    let parsedData: any = null;

    if (req.file) {
      const jsonContent = req.file.buffer.toString("utf-8");
      parsedData = JSON.parse(jsonContent);
    } else if (req.body && typeof req.body === "object") {
      parsedData = req.body;
    }

    if (!parsedData || typeof parsedData !== "object") {
      res.status(400).json({ error: "No valid JSON file or object provided" });
      return;
    }

    const existingPrices = await blobGetPrices();
    let count = 0;
    const mergedPrices = { ...existingPrices };

    // Unique match helper (Match Key + Store)
    const getMatchKey = (item: any) => {
      return (item.config_name || item.item_name || item.name || "").trim().toLowerCase();
    };
    const getStoreId = (item: any) => {
      return (item.store_id || "").trim().toString().toLowerCase();
    };

    const processItem = (item: any, fallbackKey: string) => {
      const matchKey = getMatchKey(item);
      if (!matchKey) return; // Skip invalid records without a match identity

      const storeId = getStoreId(item) || "7923194"; // Default to Food Basics if missing

      // Search all keys to see if one has the identical Match Key and Store ID combination
      let targetKey = item.upc || item.sku || item.id || fallbackKey;
      const matchingKey = Object.keys(mergedPrices).find(k => {
        const p = mergedPrices[k];
        return p && getMatchKey(p) === matchKey && getStoreId(p) === storeId;
      });

      if (matchingKey) {
        // Overwrite the existing unique record at its current slot key to prevent record duplication
        targetKey = matchingKey;
      }

      mergedPrices[targetKey] = {
        item_name: item.item_name || item.name || (matchingKey ? mergedPrices[matchingKey].item_name : ""),
        config_name: item.config_name || item.name || (matchingKey ? mergedPrices[matchingKey].config_name : ""),
        store_name: item.store_name || (matchingKey ? mergedPrices[matchingKey].store_name : "Food Basics"),
        postal_code: item.postal_code || (matchingKey ? mergedPrices[matchingKey].postal_code : "K7H3C6"),
        store_id: item.store_id || (matchingKey ? mergedPrices[matchingKey].store_id : "7923194"),
        regular_price: typeof item.regular_price === "number" ? item.regular_price : parseFloat(item.regular_price || item.regularPrice || "0") || null,
        sale_price: typeof item.sale_price === "number" ? item.sale_price : parseFloat(item.sale_price || item.salePrice) || null,
        is_on_sale: item.is_on_sale !== undefined ? (item.is_on_sale ? 1 : 0) : (item.sale_price ? 1 : 0),
        last_updated: item.last_updated || new Date().toISOString(),
        lookup_url: item.lookup_url || item.url || (matchingKey ? mergedPrices[matchingKey].lookup_url : ""),
        valid_until: item.valid_until || (matchingKey ? mergedPrices[matchingKey].valid_until : ""),
      };
      count++;
    };

    if (Array.isArray(parsedData)) {
      parsedData.forEach((item: any, index: number) => {
        const generatedKey = `manual-${Date.now()}-${index}`;
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
      res.json({ success: true, count });
    } else {
      res.status(400).json({ error: "No valid price records found to import" });
    }
  } catch (error: any) {
    console.error("POST /api/prices/import-json error:", error);
    res.status(500).json({ error: "Failed to parse and import JSON prices", details: error?.message || String(error) });
  }
});



// 6. DELETE /api/regular-items
app.delete("/api/regular-items", async (req, res) => {
  try {
    await blobSetRegularItems([]);
    res.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/regular-items error:", error);
    res.status(500).json({ error: "Failed to clear regular items", details: String(error) });
  }
});

// 6.5. PUT /api/regular-items
app.put("/api/regular-items", async (req, res) => {
  try {
    const items = req.body;
    if (!Array.isArray(items)) {
      res.status(400).json({ error: "Invalid regular items payload" });
      return;
    }
    await blobSetRegularItems(items);
    res.json({ success: true, items });
  } catch (error) {
    console.error("PUT /api/regular-items error:", error);
    res.status(500).json({ error: "Failed to update regular items", details: String(error) });
  }
});

// 6.5. GET /api/catalog
app.get("/api/catalog", async (req, res) => {
  try {
    const catalog = await blobGetCombinedCatalog();
    res.json(catalog);
  } catch (error) {
    console.error("GET /api/catalog error:", error);
    res.status(500).json({ error: "Failed to fetch combined catalog data" });
  }
});

// 6.6. PUT /api/catalog
app.put("/api/catalog", async (req, res) => {
  try {
    const catalog = req.body;
    if (!catalog || typeof catalog !== "object" || !Array.isArray(catalog.items)) {
      res.status(400).json({ error: "Invalid catalog payload structure" });
      return;
    }

    // Merge client stores maps with latest server catalog stores to avoid stale overwrites
    try {
      const currentCatalog = await blobGetCombinedCatalog();
      for (const incomingItem of catalog.items) {
        const currentItem = (currentCatalog.items || []).find((i: any) => i.id === incomingItem.id);
        if (currentItem && currentItem.stores) {
          if (!incomingItem.stores) {
            incomingItem.stores = {};
          }
          for (const [storeKey, currentStoreDetails] of Object.entries(currentItem.stores)) {
            if (!(storeKey in incomingItem.stores)) {
              // Key not sent: stale client state didn't know about it. Restore.
              incomingItem.stores[storeKey] = currentStoreDetails;
            } else {
              // Key sent: check if user cleared/deleted it in UI.
              const incomingStore = incomingItem.stores[storeKey];
              if (!incomingStore || (!incomingStore.url && !incomingStore.is_verified)) {
                delete incomingItem.stores[storeKey];
              }
            }
          }
        }
      }
    } catch (mergeErr) {
      console.warn("Failed to merge client catalog with server Vercel Blob catalog:", mergeErr);
    }

    await blobSetCombinedCatalog(catalog);
    res.json({ success: true, catalog });
  } catch (error: any) {
    console.error("PUT /api/catalog error:", error);
    res.status(500).json({ error: "Failed to update combined catalog data", details: String(error) });
  }
});

// 7. GET /api/scrape-config
app.get("/api/scrape-config", async (req, res) => {
  try {
    const config = await blobGetScrapeConfig();
    res.json(config);
  } catch (error) {
    console.error("GET /api/scrape-config error:", error);
    res.status(500).json({ error: "Failed to fetch scrape configuration", details: String(error) });
  }
});

// 8. PUT /api/scrape-config
app.put("/api/scrape-config", async (req, res) => {
  try {
    const config = req.body;
    if (!config || typeof config !== "object") {
      res.status(400).json({ error: "Invalid scrape config payload" });
      return;
    }
    await blobSetScrapeConfig(config);
    res.json({ success: true });
  } catch (error) {
    console.error("PUT /api/scrape-config error:", error);
    res.status(500).json({ error: "Failed to update scrape configuration", details: String(error) });
  }
});

// 9. GET /api/diagnose
app.get("/api/diagnose", async (req, res) => {
  try {
    const report = await getBlobDiagnostics();
    res.json(report);
  } catch (error: any) {
    console.error("GET /api/diagnose handler error:", error);
    res.status(500).json({
      error: "Diagnostics handler threw an exception",
      details: error?.message || String(error),
    });
  }
});

// 10. POST /api/report-pricing-issue
const LOCAL_DIR = !!(process.env.VERCEL || process.env.NODE_ENV === "production")
  ? path.join("/tmp", "db-storage")
  : path.join(process.cwd(), "db-storage");

app.post("/api/report-pricing-issue", async (req, res) => {
  try {
    const { itemName, storeId, reportedPrice, lookupUrl } = req.body;
    if (!itemName || !storeId || reportedPrice === undefined) {
      res.status(400).json({ error: "Missing required fields" });
      return;
    }

    const timestamp = new Date();
    const report = {
      id: Math.random().toString(36).substring(2, 9),
      itemName,
      storeId,
      reportedPrice: parseFloat(reportedPrice),
      lookupUrl: lookupUrl || "",
      timestamp,
    };

    try {
      const { db } = await getMongoDatabase();
      await db.collection("price_reports").insertOne({
        ...report,
        timestamp
      });
    } catch (dbErr) {
      // Fallback local file save
      if (!fs.existsSync(LOCAL_DIR)) {
        fs.mkdirSync(LOCAL_DIR, { recursive: true });
      }
      const filepath = path.join(LOCAL_DIR, "pricing-issues.json");
      let list = [];
      if (fs.existsSync(filepath)) {
        const content = fs.readFileSync(filepath, "utf8");
        list = JSON.parse(content || "[]");
      }
      list.push(report);
      fs.writeFileSync(filepath, JSON.stringify(list, null, 2), "utf8");
    }

    res.json({ success: true });
  } catch (error) {
    console.error("POST /api/report-pricing-issue error:", error);
    res.status(500).json({ error: "Failed to report pricing issue" });
  }
});

// 11. GET /api/pricing-issues
app.get("/api/pricing-issues", async (req, res) => {
  try {
    let issues = [];
    try {
      const { db } = await getMongoDatabase();
      issues = await db.collection("price_reports").find().sort({ timestamp: -1 }).toArray();
    } catch (dbErr) {
      // Fallback local file read
      const filepath = path.join(LOCAL_DIR, "pricing-issues.json");
      if (fs.existsSync(filepath)) {
        const content = fs.readFileSync(filepath, "utf8");
        issues = JSON.parse(content || "[]");
        issues.sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      }
    }
    res.json({ success: true, issues });
  } catch (error) {
    console.error("GET /api/pricing-issues error:", error);
    res.status(500).json({ error: "Failed to fetch pricing issues" });
  }
});

// 12. DELETE /api/pricing-issues/:id
app.delete("/api/pricing-issues/:id", async (req, res) => {
  try {
    const { id } = req.params;
    try {
      const { db } = await getMongoDatabase();
      let deleteQuery = {};
      if (ObjectId.isValid(id)) {
        deleteQuery = { _id: new ObjectId(id) };
      } else {
        deleteQuery = { id: id };
      }
      await db.collection("price_reports").deleteOne(deleteQuery);
    } catch (dbErr) {
      // Fallback local file delete
      const filepath = path.join(LOCAL_DIR, "pricing-issues.json");
      if (fs.existsSync(filepath)) {
        const content = fs.readFileSync(filepath, "utf8");
        const list = JSON.parse(content || "[]");
        const filtered = list.filter((item: any) => item.id !== id && item._id !== id);
        fs.writeFileSync(filepath, JSON.stringify(filtered, null, 2), "utf8");
      }
    }
    res.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/pricing-issues error:", error);
    res.status(500).json({ error: "Failed to resolve pricing issue" });
  }
});

export default app;
