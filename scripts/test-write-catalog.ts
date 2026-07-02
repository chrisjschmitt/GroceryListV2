import { blobGetCombinedCatalog, blobSetCombinedCatalog } from "../src/lib/blob-store";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

// Load Environment Variables from .env.local
const envPath = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config();
}

async function run() {
  console.log("Fetching catalog...");
  const catalog = await blobGetCombinedCatalog();
  console.log("Original catalog items count:", catalog.items.length);

  const testName = "TestItem-" + Date.now();
  console.log("Adding item:", testName);
  catalog.items.push({
    id: "test-" + Date.now(),
    name: testName,
    category: "Produce",
    unit: "unit",
    requires_scraping: false,
    stores: {}
  });

  console.log("Saving catalog back...");
  await blobSetCombinedCatalog(catalog);
  console.log("Catalog saved.");

  console.log("Fetching catalog again to verify...");
  const updatedCatalog = await blobGetCombinedCatalog();
  console.log("New catalog items count:", updatedCatalog.items.length);

  const found = updatedCatalog.items.find(i => i.name === testName);
  if (found) {
    console.log("SUCCESS: Test item found in updated catalog!");
  } else {
    console.error("FAIL: Test item NOT found in updated catalog!");
  }
}

run();
