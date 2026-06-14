import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { MongoClient } from "mongodb";
import { evaluateGeminiMatch } from "./src/lib/gemini-match-service";

dotenv.config();

async function run() {
  console.log("Starting MongoDB / local prices.json to regular_items.json matching...\n");

  // Load regular items
  let regularItems: any[] = [];
  const regularPath = path.join(process.cwd(), "db-storage", "grocerylist-regular-items.json");
  const fallbackCatalogPath = path.join(process.cwd(), "db-storage", "grocerylist-combined-catalog.json");
  
  if (fs.existsSync(regularPath)) {
    try {
      const rawReg = fs.readFileSync(regularPath, "utf8");
      regularItems = JSON.parse(rawReg);
      console.log(`Loaded ${regularItems.length} regular catalog items from local storage.`);
    } catch (err) {
      console.warn("Could not read local regular-items file, trying unified catalog:", err);
    }
  }

  if (regularItems.length === 0 && fs.existsSync(fallbackCatalogPath)) {
    try {
      const rawCatalog = fs.readFileSync(fallbackCatalogPath, "utf8");
      const catalogData = JSON.parse(rawCatalog);
      regularItems = catalogData.items || [];
      console.log(`Loaded ${regularItems.length} catalog items from unified combined-catalog.`);
    } catch (err) {
      console.error("Could not read unified combined-catalog file either:", err);
    }
  }

  // Load prices.json
  let prices: Record<string, any> = {};
  
  // Try MongoDB first if MONGODB_URI is available
  const uri = process.env.MONGODB_URI;
  if (uri && !uri.includes("mongodb+srv://...")) {
    console.log("Connecting to MongoDB Atlas...");
    try {
      const client = new MongoClient(uri);
      await client.connect();
      const db = client.db("groceryscout");
      const pricesCollection = db.collection("prices");
      const dbPrices = await pricesCollection.find({}).toArray();
      console.log(`Successfully fetched ${dbPrices.length} price documents from MongoDB Atlas.`);
      dbPrices.forEach(doc => {
        prices[doc._id || doc.upc] = doc;
      });
      await client.close();
    } catch (dbErr) {
      console.error("MongoDB Atlas fetch failed, falling back to local file...", dbErr);
    }
  }

  // If prices is still empty, load from db-storage/grocerylist-prices.json
  if (Object.keys(prices).length === 0) {
    try {
      const rawPrices = fs.readFileSync(path.join(process.cwd(), "db-storage", "grocerylist-prices.json"), "utf8");
      prices = JSON.parse(rawPrices);
      console.log(`Loaded ${Object.keys(prices).length} price records from local db-storage.`);
    } catch (err) {
      console.error("Critical error: Could not load prices.json", err);
      return;
    }
  }

  const results: any[] = [];
  const entries = Object.entries(prices);
  console.log(`\nEvaluating matches for ${entries.length} items. This uses programmatic fast-paths + optimized Gemini API calls...`);
  
  for (const [key, item] of entries) {
    const configName = item.config_name || item.item_name || "";
    if (!configName) continue;
    
    try {
      const match = await evaluateGeminiMatch(configName, regularItems);
      const matchedCatalogItem = match.matched_id 
        ? regularItems.find(i => i.id === match.matched_id)
        : null;

      results.push({
        upc: key,
        config_name: configName,
        item_name: item.item_name,
        matched_name: matchedCatalogItem ? matchedCatalogItem.name : "NO MATCH",
        matched_id: match.matched_id,
        confidence: match.confidence,
        reason: match.reason,
        isFallback: match.isFallback,
        fallbackReason: match.fallbackReason
      });
      
      console.log(`- "${configName}" -> ${matchedCatalogItem ? `"${matchedCatalogItem.name}"` : "NO MATCH"} (${match.confidence}% conf)`);
    } catch (err) {
      console.error(`Error matching "${configName}":`, err);
    }
  }

  // Save the matching results report to a JSON file
  const outputPath = path.join(process.cwd(), "matching_results.json");
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2), "utf8");
  console.log(`\nMatching complete! High-fidelity results written to: ${outputPath}`);
}

run();
