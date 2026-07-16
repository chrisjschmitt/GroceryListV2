import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// MUST run before any Mongo/db-store import. Stale Cursor-injected env can otherwise win.
const projectRootEnvPath = path.join(__dirname, "..", ".env.local");
const cwdEnvPath = path.join(process.cwd(), ".env.local");

let envPath = "";
if (fs.existsSync(projectRootEnvPath)) {
  envPath = projectRootEnvPath;
} else if (fs.existsSync(cwdEnvPath)) {
  envPath = cwdEnvPath;
}

if (envPath) {
  dotenv.config({ path: envPath, override: true });
} else {
  dotenv.config({ override: true });
}

async function main() {
  const { MongoClient } = await import("mongodb");
  const {
    getStoreDisplayName,
    getStoreActivePrice,
    normalizeStoreKey,
    isOnSaleFlag,
  } = await import("../src/lib/price-utils.js");
  const { blobGetPrices } = await import("../src/lib/db-store.js");
  const typeMod = await import("../src/lib/types.js");
  type PriceEntry = typeMod.PriceEntry;

  console.log("=== Running Purchase Logs Backfill for Yesterday ===");

  function getTorontoYesterdayChecker() {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Toronto",
      year: "numeric",
      month: "numeric",
      day: "numeric",
    });
    const parts = formatter.formatToParts(new Date());
    const year = parseInt(parts.find((p) => p.type === "year")!.value);
    const month = parseInt(parts.find((p) => p.type === "month")!.value);
    const day = parseInt(parts.find((p) => p.type === "day")!.value);

    const todayLocal = new Date(year, month - 1, day);
    const yesterdayLocal = new Date(todayLocal);
    yesterdayLocal.setDate(todayLocal.getDate() - 1);

    const yYear = yesterdayLocal.getFullYear();
    const yMonth = String(yesterdayLocal.getMonth() + 1).padStart(2, "0");
    const yDay = String(yesterdayLocal.getDate()).padStart(2, "0");

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
        const ly = logParts.find((p) => p.type === "year")!.value;
        const lm = logParts.find((p) => p.type === "month")!.value;
        const ld = logParts.find((p) => p.type === "day")!.value;
        return ly === String(yYear) && lm === yMonth && ld === yDay;
      },
    };
  }

  function buildPriceLookup(prices: Record<string, PriceEntry | null | undefined>) {
    const map = new Map<string, PriceEntry>();
    for (const entry of Object.values(prices)) {
      if (!entry) continue;
      for (const key of [entry.item_name, entry.config_name]) {
        const k = (key || "").toLowerCase().trim();
        if (k && !map.has(k)) map.set(k, entry);
      }
    }
    return map;
  }

  function findPriceEntry(priceMap: Map<string, PriceEntry>, name: string): PriceEntry | null {
    const normalized = (name || "").toLowerCase().trim();
    if (!normalized) return null;
    const exact = priceMap.get(normalized);
    if (exact) return exact;

    let best: PriceEntry | null = null;
    let bestLen = 0;
    for (const [key, entry] of priceMap.entries()) {
      if (!key || key.length < 3) continue;
      if (normalized.includes(key) || key.includes(normalized)) {
        if (key.length > bestLen) {
          best = entry;
          bestLen = key.length;
        }
      }
    }
    return best;
  }

  function getFoodBasicsStoreInfo(priceInfo: PriceEntry): any | null {
    if (priceInfo.stores && typeof priceInfo.stores === "object") {
      for (const [sId, sInfo] of Object.entries(priceInfo.stores)) {
        if (normalizeStoreKey(sId) === "foodbasics") return sInfo;
      }
    }
    if (normalizeStoreKey(priceInfo.store_id || priceInfo.store_name || "") === "foodbasics") {
      return priceInfo;
    }
    return null;
  }

  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error("MONGODB_URI is not defined in environment variables.");
  }
  const cleanUri = mongoUri.trim().replace(/^["']|["']$/g, "");
  const host = cleanUri.split("@")[1]?.split("/")[0] || "(unknown)";
  console.log(`Using Mongo host: ${host}`);

  if (host === "cluster.mongodb.net" || host.startsWith("cluster.mongodb.net")) {
    throw new Error(
      `MONGODB_URI still points at placeholder host "${host}". Check .env.local and that no shell env overrides it.`
    );
  }

  console.log("Loading prices from combined catalog (same path as the app)...");
  const prices = await blobGetPrices();
  const priceMap = buildPriceLookup(prices);
  console.log(`Catalog price entries indexed: ${priceMap.size}`);

  const client = new MongoClient(cleanUri, { serverSelectionTimeoutMS: 15000 });
  console.log("Connecting to MongoDB (15s timeout)...");
  await client.connect();
  const db = client.db("groceryscout");
  console.log(`Connected. db=groceryscout`);

  const logsCollection = db.collection("purchase_logs");
  const logs = await logsCollection.find().toArray();
  console.log(`Found ${logs.length} total purchase logs.`);

  const checker = getTorontoYesterdayChecker();
  let updatedCount = 0;
  let matchedCatalog = 0;
  let withPaidPrice = 0;
  const unmatchedNames: string[] = [];

  for (const log of logs) {
    if (!checker.isYesterday(log.timestamp)) continue;

    const storeId = "foodbasics";
    const storeName = "Food Basics";
    const priceInfo = findPriceEntry(priceMap, log.name || "");

    let paidPrice: number | null = null;
    let regularPrice: number | null = null;
    let salePrice: number | null = null;
    let wasOnSale = false;
    let validUntil: string | null = null;
    const priceSnapshot: any[] = [];

    if (priceInfo) {
      matchedCatalog++;
      if (priceInfo.stores && typeof priceInfo.stores === "object") {
        for (const [sId, sInfo] of Object.entries(priceInfo.stores) as [string, any][]) {
          const activeP = getStoreActivePrice(sInfo);
          const regP =
            sInfo.regular_price != null && Number(sInfo.regular_price) > 0
              ? Number(sInfo.regular_price)
              : activeP;
          priceSnapshot.push({
            storeId: normalizeStoreKey(sId),
            storeName: sInfo.store_name || getStoreDisplayName(sId),
            activePrice: activeP,
            regularPrice: regP,
          });
        }
      }

      const fbInfo = getFoodBasicsStoreInfo(priceInfo);
      if (fbInfo) {
        paidPrice = getStoreActivePrice(fbInfo);
        regularPrice =
          fbInfo.regular_price != null && Number(fbInfo.regular_price) > 0
            ? Number(fbInfo.regular_price)
            : paidPrice;
        if (isOnSaleFlag(fbInfo.is_on_sale)) {
          salePrice = fbInfo.sale_price != null ? Number(fbInfo.sale_price) : null;
          wasOnSale = true;
          validUntil = fbInfo.valid_until || null;
        }
      }
    } else {
      unmatchedNames.push(log.name || "(unnamed)");
    }

    if ((paidPrice === null || paidPrice <= 0) && log.price != null && Number(log.price) > 0) {
      paidPrice = Number(log.price);
    }

    if (paidPrice != null && paidPrice > 0) withPaidPrice++;

    console.log(
      `Updating "${log.name}" → paid=${paidPrice} regular=${regularPrice} snapshot=${priceSnapshot.length}`
    );

    await logsCollection.updateOne(
      { _id: log._id },
      {
        $set: {
          storeId,
          storeName,
          price: paidPrice,
          paidPrice,
          regularPrice,
          salePrice,
          wasOnSale,
          validUntil,
          priceSnapshot,
          backfillEstimated: true,
        },
      }
    );
    updatedCount++;
  }

  console.log(`\n🎉 Backfilled ${updatedCount} purchase logs.`);
  console.log(`Catalog name matches: ${matchedCatalog}/${updatedCount}`);
  console.log(`With paidPrice > 0: ${withPaidPrice}/${updatedCount}`);
  if (unmatchedNames.length) {
    console.log(`Unmatched names (${unmatchedNames.length}):`);
    for (const n of unmatchedNames.slice(0, 30)) console.log(`  - ${n}`);
  }

  const sample = await logsCollection.findOne({ backfillEstimated: true, paidPrice: { $ne: null } });
  if (sample) {
    console.log("\nSample enriched doc:", {
      name: sample.name,
      storeName: sample.storeName,
      paidPrice: sample.paidPrice,
      regularPrice: sample.regularPrice,
      snapshotStores: (sample.priceSnapshot || []).length,
    });
  } else {
    console.log("\n⚠️ No docs with paidPrice set. Check catalog pricing / name matches.");
  }

  await client.close();
}

main().catch((err) => {
  console.error("Backfill failed:", err?.message || err);
  if (String(err?.message || err).includes("ENOTFOUND") || String(err?.message || err).includes("timed out") || String(err?.message || err).includes("ServerSelection")) {
    console.error("\nHint: In MongoDB Atlas → Network Access, allow your current IP (or 0.0.0.0/0 for testing).");
  }
  process.exit(1);
});
