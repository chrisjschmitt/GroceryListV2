import { MongoClient } from "mongodb";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 1. Load Environment Variables from .env.local
const projectRootEnvPath = path.join(__dirname, "..", ".env.local");
const cwdEnvPath = path.join(process.cwd(), ".env.local");

let envPath = "";
if (fs.existsSync(projectRootEnvPath)) {
  envPath = projectRootEnvPath;
} else if (fs.existsSync(cwdEnvPath)) {
  envPath = cwdEnvPath;
}

if (envPath) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config();
}

const MONGO_URI = process.env.MONGODB_URI;
if (!MONGO_URI) {
  console.error("Error: MONGODB_URI is not defined in environment variables.");
  process.exit(1);
}

async function sync() {
  console.log("Connecting to production MongoDB Atlas to synchronize local fallback databases...");
  const cleanUri = MONGO_URI.trim().replace(/^["']|["']$/g, "").trim();
  const client = new MongoClient(cleanUri);
  
  try {
    await client.connect();
    const db = client.db("groceryscout");
    console.log("Connected successfully to database 'groceryscout'.");

    const dbDir = path.join(process.cwd(), "db-storage");
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    // 1. Synchronize Combined Catalog
    console.log("\n[1/4] Synchronizing Combined Catalog...");
    const [items, storesList] = await Promise.all([
      db.collection("catalog_items").find().toArray(),
      db.collection("catalog_stores").find().toArray()
    ]);
    const stores: Record<string, any> = {};
    for (const s of storesList) {
      stores[s._id] = {
        enabled: s.enabled,
        store_name: s.store_name,
        base_url: s.base_url,
        postal_code: s.postal_code,
        store_id: s.store_id || s._id,
      };
    }
    const combinedCatalog = {
      stores,
      items: items.map(i => ({
        id: i._id,
        name: i.name,
        category: i.category,
        unit: i.unit,
        units: i.units || undefined,
        requires_scraping: i.requires_scraping,
        stores: i.stores || {}
      }))
    };
    fs.writeFileSync(
      path.join(dbDir, "grocerylist-combined-catalog.json"),
      JSON.stringify(combinedCatalog, null, 2),
      "utf8"
    );
    console.log(`  Saved combined-catalog to: db-storage/grocerylist-combined-catalog.json (${combinedCatalog.items.length} items)`);

    // 2. Synchronize Shopping List
    console.log("\n[2/4] Synchronizing Active Shopping List...");
    const groceryListDocs = await db.collection("grocery_list").find().toArray();
    const groceryList = groceryListDocs.map(g => ({
      id: g._id,
      name: g.name,
      category: g.category,
      quantity: g.quantity,
      unit: g.unit,
      checked: g.checked,
      units: g.units || undefined
    }));
    fs.writeFileSync(
      path.join(dbDir, "grocerylist-grocery-items.json"),
      JSON.stringify(groceryList, null, 2),
      "utf8"
    );
    console.log(`  Saved active list to: db-storage/grocerylist-grocery-items.json (${groceryList.length} items)`);

    // 3. Synchronize Purchase Logs
    console.log("\n[3/4] Synchronizing Purchase Logs...");
    const logDocs = await db.collection("purchase_logs").find().sort({ timestamp: -1 }).toArray();
    const purchaseLogs = logDocs.map(l => ({
      id: l._id,
      timestamp: l.timestamp,
      itemId: l.itemId,
      name: l.name,
      category: l.category,
      quantity: l.quantity,
      unit: l.unit || undefined,
      units: l.units || undefined,
      storeId: l.storeId || undefined,
      storeName: l.storeName || undefined,
      price: l.price || undefined
    }));
    fs.writeFileSync(
      path.join(dbDir, "grocerylist-purchase-logs.json"),
      JSON.stringify(purchaseLogs, null, 2),
      "utf8"
    );
    console.log(`  Saved purchase logs to: db-storage/grocerylist-purchase-logs.json (${purchaseLogs.length} items)`);

    // 4. Synchronize Sync Metadata
    console.log("\n[4/4] Synchronizing Sync Metadata...");
    const syncDoc = await db.collection("sync_metadata").findOne({ _id: "global" });
    if (syncDoc) {
      const syncMeta = {
        lastSavedTime: syncDoc.lastSavedTime,
        lastSavedBy: syncDoc.lastSavedBy
      };
      fs.writeFileSync(
        path.join(dbDir, "grocerylist-sync-meta.json"),
        JSON.stringify(syncMeta, null, 2),
        "utf8"
      );
      console.log(`  Saved sync metadata to: db-storage/grocerylist-sync-meta.json`);
    }

    console.log("\nSuccess! Production MongoDB databases are now synchronized locally in your db-storage/ offline cache.");
  } catch (err: any) {
    console.error("Sync Error:", err.message || String(err));
    process.exit(1);
  } finally {
    await client.close();
  }
}

sync();
