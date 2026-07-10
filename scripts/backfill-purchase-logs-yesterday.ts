import dotenv from "dotenv";
import { MongoClient } from "mongodb";
import { getStoreDisplayName, getStoreActivePrice } from "../src/lib/price-utils";

import fs from "fs";
import path from "path";

if (fs.existsSync(path.join(process.cwd(), ".env.local"))) {
  dotenv.config({ path: ".env.local" });
} else {
  dotenv.config();
}

console.log("=== Running Purchase Logs Backfill for Yesterday ===");

// Timezone aware helper for America/Toronto
function getTorontoYesterdayChecker() {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });
  const parts = formatter.formatToParts(new Date());
  const year = parseInt(parts.find(p => p.type === 'year')!.value);
  const month = parseInt(parts.find(p => p.type === 'month')!.value);
  const day = parseInt(parts.find(p => p.type === 'day')!.value);

  const todayLocal = new Date(year, month - 1, day);
  const yesterdayLocal = new Date(todayLocal);
  yesterdayLocal.setDate(todayLocal.getDate() - 1);
  
  const yYear = yesterdayLocal.getFullYear();
  const yMonth = String(yesterdayLocal.getMonth() + 1).padStart(2, '0');
  const yDay = String(yesterdayLocal.getDate()).padStart(2, '0');
  
  console.log(`Toronto local yesterday date to backfill: ${yYear}-${yMonth}-${yDay}`);

  return {
    isYesterday: (timestamp: string): boolean => {
      const d = new Date(timestamp);
      const f = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Toronto",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
      const logParts = f.formatToParts(d);
      const ly = logParts.find(p => p.type === 'year')!.value;
      const lm = logParts.find(p => p.type === 'month')!.value;
      const ld = logParts.find(p => p.type === 'day')!.value;
      
      return ly === String(yYear) && lm === yMonth && ld === yDay;
    },
    dateString: `${yYear}-${yMonth}-${yDay}`
  };
}

async function backfill() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error("MONGODB_URI is not defined in environment variables.");
  }
  const cleanUri = mongoUri.trim().replace(/^["']|["']$/g, "");
  const client = new MongoClient(cleanUri);
  await client.connect();
  const db = client.db("groceryscout");
  console.log("Connected to MongoDB.");

  // Fetch prices collection
  const pricesCollection = db.collection("prices");
  const priceDocs = await pricesCollection.find().toArray();
  
  // Construct lookup map
  const priceMap = new Map<string, any>();
  for (const doc of priceDocs) {
    if (doc.item_name) {
      priceMap.set(doc.item_name.toLowerCase().trim(), doc);
    }
    if (doc.config_name) {
      priceMap.set(doc.config_name.toLowerCase().trim(), doc);
    }
  }

  // Fetch purchase logs
  const logsCollection = db.collection("purchase_logs");
  const logs = await logsCollection.find().toArray();
  console.log(`Found ${logs.length} total purchase logs.`);

  const checker = getTorontoYesterdayChecker();
  let updatedCount = 0;

  for (const log of logs) {
    if (checker.isYesterday(log.timestamp)) {
      console.log(`Updating yesterday's log: "${log.name}" (ID: ${log._id})`);
      
      // Update storeId to "foodbasics" and storeName to "Food Basics"
      const storeId = "foodbasics";
      const storeName = "Food Basics";
      
      // Resolve prices
      const normalizedName = (log.name || "").toLowerCase().trim();
      const priceInfo = priceMap.get(normalizedName);
      
      let paidPrice: number | null = null;
      let regularPrice: number | null = null;
      let salePrice: number | null = null;
      let wasOnSale = false;
      let validUntil: string | null = null;
      const priceSnapshot: any[] = [];

      if (priceInfo) {
        // Build snapshot
        if (priceInfo.stores && typeof priceInfo.stores === "object") {
          for (const [sId, sInfo] of Object.entries(priceInfo.stores) as [string, any][]) {
            const activeP = getStoreActivePrice(sInfo);
            const regP = sInfo.regular_price || activeP || null;
            priceSnapshot.push({
              storeId: sId,
              storeName: sInfo.store_name || getStoreDisplayName(sId),
              activePrice: activeP,
              regularPrice: regP,
            });
          }
        } else {
          const activeP = getStoreActivePrice(priceInfo);
          const regP = priceInfo.regular_price || activeP || null;
          const sId = priceInfo.store_id || "foodbasics";
          priceSnapshot.push({
            storeId: sId,
            storeName: priceInfo.store_name || getStoreDisplayName(sId),
            activePrice: activeP,
            regularPrice: regP,
          });
        }

        // Food Basics specific active/regular prices
        const fbInfo = priceInfo.stores?.["foodbasics"];
        if (fbInfo) {
          paidPrice = getStoreActivePrice(fbInfo);
          regularPrice = fbInfo.regular_price || paidPrice;
          if (fbInfo.is_on_sale) {
            salePrice = fbInfo.sale_price || null;
            wasOnSale = true;
            validUntil = fbInfo.valid_until || null;
          }
        }
      }

      // Legacy fallback
      const priceVal = paidPrice;

      // Update in MongoDB
      await logsCollection.updateOne(
        { _id: log._id },
        {
          $set: {
            storeId,
            storeName,
            price: priceVal,
            paidPrice,
            regularPrice,
            salePrice,
            wasOnSale,
            validUntil,
            priceSnapshot,
            backfillEstimated: true, // Tag indicating this was backfilled
          }
        }
      );
      updatedCount++;
    }
  }

  console.log(`\n🎉 Backfilled ${updatedCount} purchase logs successfully!`);
  await client.close();
}

backfill().catch(err => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
