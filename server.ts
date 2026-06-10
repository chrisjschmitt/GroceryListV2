import express from "express";
import path from "path";
import multer from "multer";
import { spawn } from "child_process";
import fs from "fs";
import { MongoClient } from "mongodb";
import { createServer as createViteServer } from "vite";
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
} from "./src/lib/blob-store";

// Use standard memory storage for multer CSV upload
const upload = multer({ storage: multer.memoryStorage() });

// Global Live Scraper Subprocess Orchestration State
let activeScraperProcess: any = null;
let scraperLogs: string[] = [];
let scraperIsRunning = false;
let scraperExitCode: number | null = null;

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
    if (cachedMongoClient && cachedMongoDb) {
      return { client: cachedMongoClient, db: cachedMongoDb };
    }
    
    const globalRef = global as any;
    if (!globalRef._mongoClientPromise) {
      const client = new MongoClient(uri);
      globalRef._mongoClientPromise = client.connect();
    }
    const client = await globalRef._mongoClientPromise;
    const db = client.db("groceryscout");
    
    cachedMongoClient = client;
    cachedMongoDb = db;
    return { client, db };
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

      // Read catalog items from regular_items.json
      const catalogItems = await blobGetRegularItems();
      let correctedData = { ...data };
      const configName = data.config_name || data.item_name || "";

      if (configName && catalogItems.length > 0) {
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
            }
          }
        } catch (matchErr) {
          console.error("Gemini matching error in /api/append-grocery:", matchErr);
        }
      }

      const { db } = await getMongoDatabase();
      const pricesCollection = db.collection("prices");

      // Fetch existing pricing record from MongoDB if it exists to preserve its store_id and other stable fields
      const existingDoc = await pricesCollection.findOne({ _id: key });
      const existingStoreId = existingDoc?.store_id || null;
      const existingStoreName = existingDoc?.store_name || null;

      const resolvedStoreId = data.store_id || req.body.store_id || existingStoreId || "7923194";
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
      } else {
        resolvedStoreName = data.store_name || req.body.store_name || existingStoreName || "Food Basics";
      }

      correctedData.store_id = resolvedStoreId;
      correctedData.store_name = resolvedStoreName;

      // Upsert the record targeting the incoming key as the _id identifier
      const result = await pricesCollection.updateOne(
        { _id: key },
        {
          $set: {
            _id: key,
            ...correctedData,
            synchronized_at: new Date()
          }
        },
        { upsert: true }
      );

      res.json({
        success: true,
        message: `Successfully synchronized pricing record under target key: ${key}`,
        matchedCount: result.matchedCount,
        modifiedCount: result.modifiedCount,
        upsertedCount: result.upsertedCount,
        upsertedId: result.upsertedId ? (result.upsertedId._id || result.upsertedId) : key
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
        blobGetPrices(),
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
      const prices = await blobGetPrices();
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

  // POST /api/admin/prices (Create/Update single price record)
  app.post("/api/admin/prices", async (req, res) => {
    try {
      const { upc, item } = req.body;
      if (!upc || !item || typeof item !== "object") {
        res.status(400).json({ error: "Invalid payload: 'upc' and 'item' object required" });
        return;
      }
      const existingPrices = await blobGetPrices();
      const currentEntry = (existingPrices[upc] || { stores: {} }) as any;
      
      const targetStoreId = item.store_id || "foodbasics";
      const targetStoreName = item.store_name || "Food Basics";
      
      const updatedStores = { ...(currentEntry.stores || {}) };
      updatedStores[targetStoreId] = {
        store_name: targetStoreName,
        postal_code: item.postal_code || "K7H3C6",
        store_id: targetStoreId,
        regular_price: typeof item.regular_price === "number" ? item.regular_price : parseFloat(item.regular_price) || null,
        sale_price: typeof item.sale_price === "number" ? item.sale_price : (item.sale_price ? parseFloat(item.sale_price) : null),
        is_on_sale: item.is_on_sale !== undefined ? (item.is_on_sale ? 1 : 0) : (item.sale_price !== null && item.sale_price !== undefined && item.sale_price !== "" ? 1 : 0),
        lookup_url: item.lookup_url || "",
        valid_until: item.valid_until || "",
        last_updated: item.last_updated || new Date().toISOString(),
      };
      
      // Compute the lowest price store or default to the target store
      const storeKeys = Object.keys(updatedStores);
      let lowestStoreKey = targetStoreId;
      let lowestPrice = Infinity;
      for (const key of storeKeys) {
        const s = updatedStores[key];
        const p = (s.is_on_sale && s.sale_price !== null && s.sale_price !== undefined) ? s.sale_price : (s.regular_price || 0);
        if (p < lowestPrice) {
          lowestPrice = p;
          lowestStoreKey = key;
        }
      }
      
      const bestStore = updatedStores[lowestStoreKey];
      
      existingPrices[upc] = {
        item_name: item.item_name || currentEntry.item_name || "",
        config_name: item.config_name || currentEntry.config_name || "",
        store_name: bestStore.store_name,
        postal_code: bestStore.postal_code,
        store_id: bestStore.store_id,
        regular_price: bestStore.regular_price,
        sale_price: bestStore.sale_price,
        is_on_sale: bestStore.is_on_sale,
        last_updated: item.last_updated || new Date().toISOString(),
        lookup_url: bestStore.lookup_url,
        valid_until: bestStore.valid_until || "",
        stores: updatedStores
      };
      await blobSetPrices(existingPrices);
      res.json({ success: true, prices: existingPrices });
    } catch (error: any) {
      console.error("POST /api/admin/prices error:", error);
      res.status(500).json({ error: "Failed to update price", details: String(error) });
    }
  });

  // DELETE /api/admin/prices/:upc (Delete single price record by UPC)
  app.delete("/api/admin/prices/:upc", async (req, res) => {
    try {
      const { upc } = req.params;
      if (!upc) {
        res.status(400).json({ error: "UPC param required" });
        return;
      }
      const existingPrices = await blobGetPrices();
      if (existingPrices[upc]) {
        delete existingPrices[upc];
        await blobSetPrices(existingPrices);
        res.json({ success: true, prices: existingPrices });
      } else {
        res.status(404).json({ error: "Price entry not found" });
      }
    } catch (error: any) {
      console.error("DELETE /api/admin/prices/:upc error:", error);
      res.status(500).json({ error: "Failed to delete price record", details: String(error) });
    }
  });

  // DELETE /api/admin/prices (Clear all prices)
  app.delete("/api/admin/prices", async (req, res) => {
    try {
      await blobSetPrices({});
      res.json({ success: true });
    } catch (error: any) {
      console.error("DELETE /api/admin/prices error:", error);
      res.status(500).json({ error: "Failed to reset prices", details: String(error) });
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

  // --- Real-time Interactive Scraper Runner Endpoints ---

  // GET /api/scraper/status
  app.get("/api/scraper/status", async (req, res) => {
    let screenshots: string[] = [];
    try {
      const dir = path.join(process.cwd(), "debug-screenshots");
      if (fs.existsSync(dir)) {
        screenshots = fs.readdirSync(dir).filter(f => f.endsWith(".png") || f.endsWith(".html"));
      }
    } catch (err) {
      console.error("Error reading debug screenshots directory:", err);
    }

    res.json({
      isRunning: scraperIsRunning,
      logs: scraperLogs,
      exitCode: scraperExitCode,
      screenshots,
    });
  });

  // POST /api/scraper/run
  app.post("/api/scraper/run", async (req, res) => {
    if (scraperIsRunning) {
      res.status(400).json({ error: "Scraper is already running" });
      return;
    }

    const { testUrl, limit } = req.body;
    scraperIsRunning = true;
    scraperLogs = ["--- Starting scraper subprocess ---"];
    scraperExitCode = null;

    const args: string[] = ["scraper/scrape-prices.mjs"];
    if (testUrl) {
      args.push("--test-url", testUrl);
    }
    if (limit) {
      args.push("--limit", String(limit));
    }

    try {
      // Clear old diagnostics screenshots
      const dir = path.join(process.cwd(), "debug-screenshots");
      if (fs.existsSync(dir)) {
        const files = fs.readdirSync(dir);
        for (const file of files) {
          try {
            fs.unlinkSync(path.join(dir, file));
          } catch (e) {}
        }
      }
    } catch (e) {
      console.error("Error clearing old screenshots:", e);
    }

    console.log(`Spawning: node ${args.join(" ")}`);
    const child = spawn("node", args, {
      env: { ...process.env, HEADLESS: "true" }
    });

    activeScraperProcess = child;

    child.stdout.on("data", (data) => {
      const lines = data.toString().split("\n");
      for (const line of lines) {
        if (line.trim()) {
          scraperLogs.push(line);
        }
      }
      if (scraperLogs.length > 500) {
        scraperLogs.splice(0, scraperLogs.length - 500);
      }
    });

    child.stderr.on("data", (data) => {
      const lines = data.toString().split("\n");
      for (const line of lines) {
        if (line.trim()) {
          scraperLogs.push("[STDERR] " + line);
        }
      }
      if (scraperLogs.length > 500) {
        scraperLogs.splice(0, scraperLogs.length - 500);
      }
    });

    child.on("close", (code) => {
      scraperIsRunning = false;
      scraperExitCode = code;
      scraperLogs.push(`--- Scraper Process Finished with Code ${code} ---`);
      console.log(`Scraper subprocess finished with code ${code}`);
      activeScraperProcess = null;
    });

    res.json({ success: true, message: "Scraper initiated successfully" });
  });

  // POST /api/scraper/stop
  app.post("/api/scraper/stop", async (req, res) => {
    if (activeScraperProcess) {
      activeScraperProcess.kill("SIGKILL");
      scraperIsRunning = false;
      scraperLogs.push("--- Scraper Process Aborted by User ---");
      activeScraperProcess = null;
      res.json({ success: true, message: "Aborted scraper successfully" });
    } else {
      res.status(400).json({ error: "Scraper is not running" });
    }
  });

  // GET /api/scraper/screenshot/:name
  app.get("/api/scraper/screenshot/:name", (req, res) => {
    const name = req.params.name;
    if (name.includes("/") || name.includes("\\") || name.includes("..")) {
      res.status(400).json({ error: "Invalid file name" });
      return;
    }

    const filePath = path.join(process.cwd(), "debug-screenshots", name);
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: "File not found" });
      return;
    }

    if (name.endsWith(".png")) {
      res.setHeader("Content-Type", "image/png");
      res.sendFile(filePath);
    } else if (name.endsWith(".html")) {
      res.setHeader("Content-Type", "text/html");
      res.sendFile(filePath);
    } else {
      res.sendFile(filePath);
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
