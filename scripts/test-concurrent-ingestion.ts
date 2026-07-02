import fs from "fs";
import path from "path";
import dotenv from "dotenv";

// Load local environment variables
const envPath = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config();
}

const secretToken = process.env.GROCERY_SECRET_TOKEN || "GroceryHub2026";

async function runTest() {
  const timestamp = Date.now();
  const itemName = `SuperUnobtainiumMegaCheese ${timestamp}`;
  console.log(`Starting concurrent ingestion test for item: "${itemName}"`);

  const req1 = {
    key: `test-upc-freshco-${timestamp}`,
    data: {
      config_name: itemName,
      url: `https://freshco.com/lactose-free-mozzarella-test-${timestamp}`,
      regular_price: "6.99",
      sale_price: "5.49",
      is_on_sale: true,
      store_id: "freshco",
      store_name: "FreshCo",
      category: "Dairy",
      unit: "g",
      units: "400"
    }
  };

  const req2 = {
    key: `test-upc-foodbasics-${timestamp}`,
    data: {
      config_name: itemName,
      url: `https://foodbasics.ca/lactose-free-mozzarella-test-${timestamp}`,
      regular_price: "5.99",
      sale_price: "4.99",
      is_on_sale: true,
      store_id: "foodbasics",
      store_name: "Food Basics",
      category: "Dairy",
      unit: "g",
      units: "400"
    }
  };

  console.log("Sending concurrent requests...");
  const headers = {
    "Content-Type": "application/json",
    "x-groceryscout-token": secretToken
  };

  try {
    const [res1, res2] = await Promise.all([
      fetch("http://localhost:3000/api/append-grocery", {
        method: "POST",
        headers,
        body: JSON.stringify(req1)
      }).then(r => r.json()),
      fetch("http://localhost:3000/api/append-grocery", {
        method: "POST",
        headers,
        body: JSON.stringify(req2)
      }).then(r => r.json())
    ]);

    console.log("Response 1:", JSON.stringify(res1));
    console.log("Response 2:", JSON.stringify(res2));

    console.log("Waiting 5 seconds for Vercel Blob propagation...");
    await new Promise((r) => setTimeout(r, 5000));

    console.log("Fetching updated catalog from dev server...");
    const catalogRes = await fetch("http://localhost:3000/api/catalog");
    const catalog = await catalogRes.json();

    const returnedItemName = res1.catalogMatch?.catalogItemName || itemName;
    console.log(`Checking catalog for item name: "${returnedItemName}"`);

    console.log("All catalog item names:", (catalog.items || []).map((i: any) => i.name));

    const matchedItems = (catalog.items || []).filter(
      (item: any) => item.name === returnedItemName
    );

    console.log(`\nFound ${matchedItems.length} items matching "${returnedItemName}" in combined-catalog.`);

    if (matchedItems.length === 0) {
      console.error("FAIL: Item was not created in combined-catalog.");
      process.exit(1);
    } else if (matchedItems.length > 1) {
      console.error("FAIL: Multiple duplicate items were created instead of reusing the first one.");
      process.exit(1);
    }

    const item = matchedItems[0];
    console.log("Created Catalog Item details:", JSON.stringify(item, null, 2));

    const stores = Object.keys(item.stores || {});
    console.log(`Registered stores: ${JSON.stringify(stores)}`);

    const hasFreshCo = stores.includes("freshco");
    const hasFoodBasics = stores.includes("foodbasics");

    if (!hasFreshCo || !hasFoodBasics) {
      console.error(`FAIL: Missing one of the stores. freshco: ${hasFreshCo}, foodbasics: ${hasFoodBasics}`);
      process.exit(1);
    }

    // Verify track_pricing and is_verified defaults
    const freshCoStore = item.stores.freshco;
    const foodBasicsStore = item.stores.foodbasics;

    console.log("FreshCo Store details:", JSON.stringify(freshCoStore, null, 2));
    console.log("Food Basics Store details:", JSON.stringify(foodBasicsStore, null, 2));

    if (freshCoStore.track_pricing !== true || freshCoStore.is_verified !== true) {
      console.error("FAIL: FreshCo store track_pricing or is_verified is not true.");
      process.exit(1);
    }

    if (foodBasicsStore.track_pricing !== true || foodBasicsStore.is_verified !== true) {
      console.error("FAIL: Food Basics store track_pricing or is_verified is not true.");
      process.exit(1);
    }

    console.log("\nSUCCESS! Concurrency test passed: Only one item created, both stores merged successfully, with track_pricing and is_verified set to true!");
  } catch (err: any) {
    console.error("Test execution failed:", err);
    process.exit(1);
  }
}

runTest();
