import express from "express";
import multer from "multer";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { MongoClient } from "mongodb";
import { parseCsv } from "../src/lib/csv-parser.js";
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
} from "../src/lib/blob-store.js";

const app = express();

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

// Global Live Scraper Subprocess Orchestration State
let activeScraperProcess: any = null;
let scraperLogs: string[] = [];
let scraperIsRunning = false;
let scraperExitCode: number | null = null;

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

// 0. APPEND-GROCERY POST Endpoint (Tampermonkey client uploads)
app.post("/api/append-grocery", async (req, res) => {
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

    const { db } = await getMongoDatabase();
    const pricesCollection = db.collection("prices");

    // Upsert the record targeting the incoming key as the _id identifier
    const result = await pricesCollection.updateOne(
      { _id: key },
      {
        $set: {
          _id: key,
          ...data,
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
  } catch (error) {
    console.error("GET /api/sync error:", error);
    res.status(500).json({ error: "Failed to fetch sync data", details: String(error) });
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
  } catch (error) {
    console.error("PUT /api/sync error:", error);
    res.status(500).json({ error: "Failed to update sync data", details: String(error) });
  }
});

// 3. GET /api/prices
app.get("/api/prices", async (req, res) => {
  try {
    const prices = await blobGetPrices();
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

// POST /api/admin/prices (Create/Update single price record with match safety)
app.post("/api/admin/prices", async (req, res) => {
  try {
    const { upc, item } = req.body;
    if (!upc || !item || typeof item !== "object") {
      res.status(400).json({ error: "Invalid payload: 'upc' and 'item' object required" });
      return;
    }
    const existingPrices = await blobGetPrices();

    // Check if another entry already has the same Match Key and Store combination.
    const matchKey = (item.config_name || item.item_name || "").trim().toLowerCase();
    const storeId = (item.store_id || "").trim().toLowerCase();

    // Find if a duplicate exists on another key
    const duplicateKey = Object.keys(existingPrices).find(k => {
      if (k === upc) return false;
      const p = existingPrices[k];
      const pMatchKey = (p.config_name || p.item_name || "").trim().toLowerCase();
      const pStoreId = (p.store_id || "").trim().toLowerCase();
      return pMatchKey === matchKey && pStoreId === storeId;
    });

    if (duplicateKey) {
      // Remove the old separate entry to prevent duplicates
      delete existingPrices[duplicateKey];
    }

    existingPrices[upc] = {
      item_name: item.item_name || "",
      config_name: item.config_name || "",
      store_name: item.store_name || "Food Basics",
      postal_code: item.postal_code || "K7H3C6",
      store_id: item.store_id || "7923194",
      regular_price: typeof item.regular_price === "number" ? item.regular_price : parseFloat(item.regular_price) || null,
      sale_price: typeof item.sale_price === "number" ? item.sale_price : (item.sale_price ? parseFloat(item.sale_price) : null),
      is_on_sale: item.is_on_sale !== undefined ? (item.is_on_sale ? 1 : 0) : (item.sale_price !== null && item.sale_price !== undefined && item.sale_price !== "" ? 1 : 0),
      last_updated: item.last_updated || new Date().toISOString(),
      lookup_url: item.lookup_url || "",
      valid_until: item.valid_until || "",
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

export default app;
