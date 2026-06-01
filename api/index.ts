import express from "express";
import multer from "multer";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
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
} from "../src/lib/blob-store.js";

const app = express();

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
