import express from "express";
import path from "path";
import multer from "multer";
import { spawn } from "child_process";
import fs from "fs";
import { MongoClient } from "mongodb";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";

// Load Environment Variables from .env.local
const envPath = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config();
}

import { parseCsv } from "./src/lib/csv-parser";
import { evaluateGeminiMatch, runAllMatchingTests } from "./src/lib/gemini-match-service";
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
} from "./src/lib/blob-store";
import { RegularItem } from "./src/lib/types";

// Use standard memory storage for multer CSV upload
const upload = multer({ storage: multer.memoryStorage() });

async function startServer() {
  // Check and auto-import local prices from project root if present
  await checkForLocalPricesJsonAndImport().catch((err) => {
    console.error("Error running auto-import for local prices on startup:", err);
  });

  const app = express();
  const PORT = 3000;

  // JSON Body Parser for sync and scrape-config payloads
  app.use(express.json({ limit: "15mb" }));

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

  async function mergeMongoPrices(prices: any): Promise<any> {
    try {
      const { db } = await getMongoDatabase();
      const pricesCollection = db.collection("prices");
      const mongoDocs = await pricesCollection.find().toArray();
      
      for (const doc of mongoDocs) {
        const upc = doc._id || doc.upc;
        if (!upc) continue;
        
        const existingEntry = prices[upc] || { stores: {} };
        
        const storeId = doc.store_id || "foodbasics";
        const storeName = doc.store_name || "Food Basics";
        
        // Build updated stores mapping
        const updatedStores = { ...(existingEntry.stores || {}) };
        
        // Extract specific pricing properties safely
        const regPrice = typeof doc.regular_price === "number" ? doc.regular_price : (doc.regular_price ? parseFloat(doc.regular_price) : null);
        const salePrice = typeof doc.sale_price === "number" ? doc.sale_price : (doc.sale_price ? parseFloat(doc.sale_price) : null);
        const isOnSale = doc.is_on_sale !== undefined ? (doc.is_on_sale ? 1 : 0) : (salePrice !== null ? 1 : 0);
        
        // Map store normalized key (e.g. foodbasics, metro, loblaws, nofrills)
        let storeKey = "foodbasics";
        const lowerStoreId = String(storeId).toLowerCase();
        if (lowerStoreId.includes("metro")) storeKey = "metro";
        else if (lowerStoreId.includes("loblaws")) storeKey = "loblaws";
        else if (lowerStoreId.includes("nofrills")) storeKey = "nofrills";
        else if (lowerStoreId === "7923194" || lowerStoreId.includes("foodbasics")) storeKey = "foodbasics";
        else storeKey = storeId;
        
        updatedStores[storeKey] = {
          store_name: storeName,
          postal_code: doc.postal_code || existingEntry.stores?.[storeKey]?.postal_code || "K7H3C6",
          store_id: storeId,
          regular_price: regPrice !== null && regPrice !== undefined ? regPrice : (existingEntry.stores?.[storeKey]?.regular_price ?? null),
          sale_price: salePrice !== null && salePrice !== undefined ? salePrice : (existingEntry.stores?.[storeKey]?.sale_price ?? null),
          is_on_sale: doc.is_on_sale !== undefined ? isOnSale : (existingEntry.stores?.[storeKey]?.is_on_sale ?? 0),
          lookup_url: doc.url || doc.lookup_url || doc.lookupUrl || existingEntry.stores?.[storeKey]?.lookup_url || "",
          valid_until: doc.valid_until || existingEntry.stores?.[storeKey]?.valid_until || "",
          last_updated: doc.last_updated || (doc.synchronized_at instanceof Date ? doc.synchronized_at.toISOString() : (typeof doc.synchronized_at === 'string' ? doc.synchronized_at : null)) || existingEntry.stores?.[storeKey]?.last_updated || new Date().toISOString(),
          track_pricing: doc.track_pricing === 1 || doc.track_pricing === true || existingEntry.stores?.[storeKey]?.track_pricing ? 1 : 0,
          external_name: doc.external_name || doc.item_name || existingEntry.stores?.[storeKey]?.external_name || "",
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
        
        prices[upc] = {
          item_name: doc.item_name || existingEntry.item_name || "",
          config_name: doc.config_name || existingEntry.config_name || doc.item_name || "",
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

      // Only return a pricing record if we found at least one store with a valid price
      if (bestStoreId) {
        let mainUpc = "";
        for (const link of Object.values(item.stores || {})) {
          if (link && link.upc) {
            mainUpc = link.upc;
            break;
          }
        }
        const itemKey = mainUpc || item.id || `catalog-${item.name.replace(/\s+/g, "-").toLowerCase()}`;
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

    return mergeMongoPrices(prices);
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
        unit: item.unit
      }));
      let correctedData = { ...data };

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
              }
            } else {
              // Unmatched ingestion fallback: Automatically create a new catalog item as requested
              // to ensure pricing actually appears in the UI instead of silently disappearing
              const proposedName = matchResult.proposed_new_item?.name || configName;
              const proposedCategory = matchResult.proposed_new_item?.category || "Bakery";

              const newId = `regular-unmatched-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
              
              // Create and save new combined-catalog item directly
              const newCombinedItem = {
                id: newId,
                name: proposedName,
                category: proposedCategory,
                unit: "unit",
                requires_scraping: true,
                stores: {}
              };
              catalog.items.push(newCombinedItem);
              await blobSetCombinedCatalog(catalog);
              console.log(`[Auto-Create] Auto-created catalog item "${proposedName}" (ID ${newId}) under combined-catalog registry`);

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

      function ensureHttps(url: string): string {
        if (!url) return "";
        let trimmed = url.trim();
        // Remove surrounding or embedded double quotes/backslashes/single quotes
        trimmed = trimmed.replace(/["\\']/g, "");
        if (!trimmed) return "";
        if (/^https?:\/\//i.test(trimmed)) {
          return trimmed;
        }
        return `https://${trimmed}`;
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
        try {
          const catalog = await blobGetCombinedCatalog();
          const catalogItem = catalog.items.find((i: any) => i.id === priceDoc.matched_catalog_id);
          if (catalogItem) {
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
            } else {
              const lowerId = String(priceDoc.store_id || "").toLowerCase();
              if (lowerId === "metro") fStoreKey = "metro";
              else if (lowerId === "loblaws") fStoreKey = "loblaws";
              else if (lowerId === "nofrills") fStoreKey = "nofrills";
              else if (lowerId === "freshco" || lowerId.includes("freshco")) fStoreKey = "freshco";
              else if (lowerId === "yourindependentgrocer" || lowerId.includes("yourindependentgrocer")) fStoreKey = "yourindependentgrocer";
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
              track_pricing: priceDoc.track_pricing === 1 || priceDoc.track_pricing === true || priceDoc.track_pricing === "true" || !!existingStoreLink.track_pricing,
              valid_until: priceDoc.valid_until || existingStoreLink.valid_until || "",
              is_verified: existingStoreLink.is_verified === true || existingStoreLink.is_verified === 1 || String(existingStoreLink.is_verified) === "true"
            };

            await blobSetCombinedCatalog(catalog);
            console.log(`Successfully synced matched item "${catalogItem.name}" to combined-catalog under store "${fStoreKey}" from MongoDB prices log entry.`);

            // Vercel prices.json cache update eliminated for the append/grocery API pipeline.
          }
        } catch (catalogErr) {
          console.error("Error updating combined-catalog in /api/append-grocery:", catalogErr);
        }
      }

      res.json({
        success: true,
        message: `Successfully synchronized pricing record under target key: ${finalKey}`,
        matchedCount: result.matchedCount,
        modifiedCount: result.modifiedCount,
        upsertedCount: result.upsertedCount,
        upsertedId: result.upsertedId ? (result.upsertedId._id || result.upsertedId) : finalKey
      });
    } catch (error: any) {
      console.error("Error in POST /api/append-grocery:", error);
      res.status(500).json({
        error: "Internal Server Error",
        details: error?.message || String(error)
      });
    }
  });

  // 1. GET /api/sync
  app.get("/api/sync", async (req, res) => {
    try {
      const [groceryItems, regularItems, syncMeta, prices] = await Promise.all([
        blobGetGroceryItems(),
        blobGetRegularItems(),
        blobGetSyncMeta(),
        getMergedPrices(),
      ]);
      res.json({ groceryItems, regularItems, syncMeta, prices });
    } catch {
      res.status(500).json({ error: "Failed to fetch sync data" });
    }
  });

  // 2. PUT /api/sync
  app.put("/api/sync", async (req, res) => {
    try {
      const { groceryItems, regularItems, deviceName } = req.body;

      if (groceryItems) {
        await blobSetGroceryItems(groceryItems);
      }
      if (regularItems) {
        await blobSetRegularItems(regularItems);
      }

      const syncMeta = await blobUpdateSyncMeta(deviceName || "Unknown");
      res.json({ success: true, syncMeta });
    } catch {
      res.status(500).json({ error: "Failed to update sync data" });
    }
  });

  // 3. GET /api/prices
  app.get("/api/prices", async (req, res) => {
    try {
      const prices = await getMergedPrices();
      res.json({ prices });
    } catch {
      res.status(500).json({ error: "Failed to fetch prices data" });
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
    } catch {
      res.status(500).json({ error: "Failed to fetch regular items" });
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
    } catch {
      res.status(500).json({ error: "Failed to upload and parse CSV" });
    }
  });

  // 5.5. POST /api/prices/import-json (JSON prices upload)
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
      const standardized: Record<string, any> = {};

      if (Array.isArray(parsedData)) {
        parsedData.forEach((item: any) => {
          const upc = item.upc || item.sku || item.id || `manual-${Date.now()}-${count}`;
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

          standardized[upc] = {
            item_name: item.item_name || item.name || "",
            config_name: item.config_name || item.name || "",
            store_name: finalStoreName,
            postal_code: finalPostalCode,
            store_id: finalStoreId,
            regular_price: typeof finalRegular === "number" ? finalRegular : parseFloat(finalRegular || "0") || null,
            sale_price: typeof finalSale === "number" ? finalSale : parseFloat(finalSale || item.salePrice) || null,
            is_on_sale: finalIsOnSale !== undefined ? (finalIsOnSale ? 1 : 0) : (finalSale ? 1 : 0),
            last_updated: item.last_updated || new Date().toISOString(),
            lookup_url: finalLookupUrl,
            stores: stores
          };
          count++;
        });
      } else {
        for (const [key, item] of Object.entries(parsedData)) {
          if (item && typeof item === "object") {
            const rawItem = item as any;
            const stores = rawItem.stores || null;
            let finalStoreName = rawItem.store_name || "Food Basics";
            let finalPostalCode = rawItem.postal_code || "K7H3C6";
            let finalStoreId = rawItem.store_id || "7923194";
            let finalRegular = rawItem.regular_price;
            let finalSale = rawItem.sale_price;
            let finalIsOnSale = rawItem.is_on_sale;
            let finalLookupUrl = rawItem.lookup_url || rawItem.url || "";

            if (stores && typeof stores === "object") {
              const storeKeys = Object.keys(stores);
              if (storeKeys.length > 0) {
                let lowestStoreKey = storeKeys[0];
                let lowestPrice = Infinity;
                for (const k of storeKeys) {
                  const s = stores[k];
                  const p = (s.is_on_sale && s.sale_price !== null && s.sale_price !== undefined) ? s.sale_price : (s.regular_price || 0);
                  if (p < lowestPrice) {
                    lowestPrice = p;
                    lowestStoreKey = k;
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

            standardized[key] = {
              item_name: rawItem.item_name || rawItem.name || "",
              config_name: rawItem.config_name || rawItem.name || "",
              store_name: finalStoreName,
              postal_code: finalPostalCode,
              store_id: finalStoreId,
              regular_price: typeof finalRegular === "number" ? finalRegular : parseFloat(finalRegular || "0") || null,
              sale_price: typeof finalSale === "number" ? finalSale : parseFloat(finalSale || rawItem.salePrice) || null,
              is_on_sale: finalIsOnSale !== undefined ? (finalIsOnSale ? 1 : 0) : (finalSale ? 1 : 0),
              last_updated: rawItem.last_updated || new Date().toISOString(),
              lookup_url: finalLookupUrl,
              stores: stores
            };
            count++;
          }
        }
      }

      if (count > 0) {
        const merged = { ...existingPrices, ...standardized };
        await blobSetPrices(merged);
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
    } catch {
      res.status(500).json({ error: "Failed to clear regular items" });
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
    } catch {
      res.status(500).json({ error: "Failed to update regular items" });
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
    } catch {
      res.status(500).json({ error: "Failed to fetch scrape configuration" });
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
    } catch {
      res.status(500).json({ error: "Failed to update scrape configuration" });
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

  // --- Front-end Integration & Bundling ---

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
