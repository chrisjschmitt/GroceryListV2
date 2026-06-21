import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { MongoClient } from "mongodb";
import { blobGetCombinedCatalog, blobSetCombinedCatalog } from "../src/lib/blob-store";

// 1. Load Environment Variables from .env.local
const envPath = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config();
}

const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
const MONGO_URI = process.env.MONGODB_URI;

if (!BLOB_TOKEN) {
  console.error("Error: BLOB_READ_WRITE_TOKEN is not defined in environment");
  process.exit(1);
}

async function migrate() {
  console.log("Starting price tracking enablement migration...");
  
  // 2. Update canonical Combined Catalog in Vercel Blob
  console.log("\n--- Part 1: Updating Vercel Blob Catalog ---");
  let catalog;
  try {
    catalog = await blobGetCombinedCatalog();
  } catch (err: any) {
    console.error("Error fetching catalog from Vercel Blob:", err.message || err);
    process.exit(1);
  }

  let catalogUpdatesCount = 0;
  let catalogTotalLinks = 0;
  let catalogVerifiedLinks = 0;

  for (const item of catalog.items || []) {
    if (!item.stores) continue;
    for (const [storeKey, link] of Object.entries(item.stores)) {
      if (!link) continue;
      catalogTotalLinks++;
      const isVerified = (link as any).is_verified === true || (link as any).is_verified === 1 || String((link as any).is_verified) === "true";
      if (isVerified) {
        catalogVerifiedLinks++;
        if (storeKey !== "costco") {
          if (!(link as any).track_pricing) {
            (link as any).track_pricing = true;
            catalogUpdatesCount++;
          }
        }
      }
    }
  }

  console.log(`Scanned ${catalog.items?.length || 0} catalog items.`);
  console.log(`Found ${catalogTotalLinks} store links, of which ${catalogVerifiedLinks} are verified.`);
  console.log(`Updating ${catalogUpdatesCount} verified non-Costco links to track_pricing = true.`);

  if (catalogUpdatesCount > 0) {
    try {
      await blobSetCombinedCatalog(catalog);
      console.log("Successfully saved updated catalog back to Vercel Blob storage!");
    } catch (err: any) {
      console.error("Failed to save updated catalog to Vercel Blob:", err.message || err);
      process.exit(1);
    }
  } else {
    console.log("No Vercel Blob catalog updates required (all verified non-Costco links are already tracked).");
  }

  // 3. Update Local fallback catalog files
  console.log("\n--- Part 2: Updating Local Fallback Files ---");
  const localDbDir = path.join(process.cwd(), "db-storage");
  const localCatalogPath = path.join(localDbDir, "grocerylist-combined-catalog.json");
  
  if (fs.existsSync(localCatalogPath)) {
    try {
      const localData = JSON.parse(fs.readFileSync(localCatalogPath, "utf8"));
      let localUpdatesCount = 0;
      for (const item of localData.items || []) {
        if (!item.stores) continue;
        for (const [storeKey, link] of Object.entries(item.stores)) {
          if (!link) continue;
          const isVerified = (link as any).is_verified === true || (link as any).is_verified === 1 || String((link as any).is_verified) === "true";
          if (isVerified && storeKey !== "costco") {
            if (!(link as any).track_pricing) {
              (link as any).track_pricing = true;
              localUpdatesCount++;
            }
          }
        }
      }
      if (localUpdatesCount > 0) {
        fs.writeFileSync(localCatalogPath, JSON.stringify(localData, null, 2), "utf8");
        console.log(`Successfully updated ${localUpdatesCount} store links in local file: db-storage/grocerylist-combined-catalog.json`);
      } else {
        console.log("No local catalog file updates required.");
      }
    } catch (err: any) {
      console.warn("Local catalog update failed or skipped:", err.message || err);
    }
  } else {
    console.log("No local catalog file found at db-storage/grocerylist-combined-catalog.json");
  }

  // 4. Update MongoDB Ingestion Logs (prices collection)
  if (MONGO_URI) {
    console.log("\n--- Part 3: Updating MongoDB Ingestion Logs ---");
    const cleanUri = MONGO_URI.trim().replace(/^["']|["']$/g, "").trim();
    const client = new MongoClient(cleanUri);
    try {
      await client.connect();
      const db = client.db("groceryscout");
      const pricesCollection = db.collection("prices");

      const mongoDocs = await pricesCollection.find().toArray();
      let mongoUpdatesCount = 0;

      // Create a map from catalog item ID to set of verified stores
      const catalogVerifiedStoresMap: Record<string, Set<string>> = {};
      for (const item of catalog.items || []) {
        catalogVerifiedStoresMap[item.id] = new Set<string>();
        for (const [storeKey, link] of Object.entries(item.stores || {})) {
          const isVerified = (link as any).is_verified === true || (link as any).is_verified === 1 || String((link as any).is_verified) === "true";
          if (isVerified) {
            catalogVerifiedStoresMap[item.id].add(storeKey);
          }
        }
      }

      for (const doc of mongoDocs) {
        const storeId = doc.store_id || "foodbasics";
        let storeKey = "foodbasics";
        const lowerStoreId = String(storeId).toLowerCase();
        if (lowerStoreId.includes("metro")) storeKey = "metro";
        else if (lowerStoreId.includes("loblaws")) storeKey = "loblaws";
        else if (lowerStoreId.includes("nofrills")) storeKey = "nofrills";
        else if (lowerStoreId.includes("freshco")) storeKey = "freshco";
        else if (lowerStoreId.includes("yourindependentgrocer")) storeKey = "yourindependentgrocer";
        else if (lowerStoreId === "7923194" || lowerStoreId.includes("foodbasics")) storeKey = "foodbasics";
        else storeKey = storeId;

        if (storeKey === "costco") continue;

        let shouldTrack = false;
        if (doc.matched_catalog_id && catalogVerifiedStoresMap[doc.matched_catalog_id]) {
          shouldTrack = catalogVerifiedStoresMap[doc.matched_catalog_id].has(storeKey);
        }

        if (shouldTrack && doc.track_pricing !== 1 && doc.track_pricing !== true) {
          await pricesCollection.updateOne(
            { _id: doc._id },
            { $set: { track_pricing: 1 } }
          );
          mongoUpdatesCount++;
        }
      }

      console.log(`Scanned ${mongoDocs.length} database logs in MongoDB 'prices' collection.`);
      console.log(`Updated ${mongoUpdatesCount} MongoDB prices logs to enable price tracking.`);
    } catch (err: any) {
      console.error("MongoDB Atlas connection or update failed:", err.message || err);
    } finally {
      await client.close();
    }
  } else {
    console.log("\n--- Part 3: MongoDB URI missing, skipping MongoDB logs update ---");
  }

  console.log("\nMigration completed successfully!");
}

migrate();
