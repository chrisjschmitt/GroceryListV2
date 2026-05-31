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
  blobGetScrapeConfig,
  blobSetScrapeConfig,
  getBlobDiagnostics,
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
