import express from "express";
import path from "path";
import multer from "multer";
import { createServer as createViteServer } from "vite";
import { parseCsv } from "./src/lib/csv-parser";
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
} from "./src/lib/blob-store";

// Use standard memory storage for multer CSV upload
const upload = multer({ storage: multer.memoryStorage() });

async function startServer() {
  const app = express();
  const PORT = 3000;

  // JSON Body Parser for sync and scrape-config payloads
  app.use(express.json({ limit: "15mb" }));

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
