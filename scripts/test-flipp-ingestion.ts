import { CombinedCatalog, GroceryItem } from "../src/lib/types";
import {
  extractFlippItemId,
  resolveCatalogMatch,
  buildPreviewResponse,
  commitFlippIngestion,
  scoreCatalogMatch
} from "../src/lib/flipp-ingestion";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

// Mock Combined Catalog data
let mockCatalog: CombinedCatalog = {
  stores: {
    "foodbasics": {
      enabled: true,
      store_name: "Food Basics",
      base_url: "https://www.foodbasics.ca",
      postal_code: "K7H3C6",
      store_id: "Food Basics"
    },
    "metro": {
      enabled: true,
      store_name: "Metro Perth",
      base_url: "https://www.metro.ca",
      postal_code: "K7H3C6",
      store_id: "metro"
    }
  },
  items: [
    {
      id: "catalog-exists-matching",
      name: "White Cremini Mushrooms",
      category: "Fresh Produce",
      unit: "unit",
      requires_scraping: true,
      stores: {
        "foodbasics": {
          url: "https://foodbasics.ca/mushrooms",
          flipp_url: "https://flipp.com/en-ca/perth-on/item/999002-food-basics-weekly-ad",
          upc: "999002",
          regular_price: 2.99,
          sale_price: 1.99,
          is_on_sale: 1,
          valid_until: "2026-07-10",
          track_pricing: true,
          external_name: "WHITE CREMINI MUSHROOMS",
          is_verified: true,
          in_flyer: 1
        }
      }
    },
    {
      id: "catalog-exists-mismatched",
      name: "Cashmere Tissue",
      category: "Household",
      unit: "unit",
      requires_scraping: true,
      stores: {
        "foodbasics": {
          url: "https://foodbasics.ca/cashmere",
          flipp_url: "https://flipp.com/en-ca/perth-on/item/999003-food-basics-weekly-ad",
          upc: "999003",
          regular_price: 2.99,
          sale_price: 1.99, // old price
          is_on_sale: 1,
          valid_until: "2026-07-01", // old expiry
          track_pricing: true,
          external_name: "CASHMERE TISSUE",
          is_verified: true,
          in_flyer: 1
        }
      }
    },
    {
      id: "catalog-exists-no-store",
      name: "Purfiltre Milk 2%",
      category: "Dairy",
      unit: "unit",
      requires_scraping: true,
      stores: {
        "foodbasics": {
          url: "https://foodbasics.ca/purfiltre",
          flipp_url: "https://flipp.com/en-ca/perth-on/item/999004-food-basics-weekly-ad",
          upc: "999004",
          regular_price: 5.99,
          sale_price: 4.99,
          is_on_sale: 1,
          valid_until: "2026-07-10",
          track_pricing: true,
          external_name: "Purfiltre Milk 2%",
          is_verified: true,
          in_flyer: 1
        }
        // "metro" is missing store configuration
      }
    }
  ]
};

// Mock Grocery List data
let mockGroceryItems: GroceryItem[] = [];

// Mock fetch handler to intercept Flipp API details requests
globalThis.fetch = async (url: string | Request | URL) => {
  const urlStr = String(url);
  const match = urlStr.match(/\/items\/(\d+)/);
  const itemId = match ? match[1] : "";

  let mockItem: any = null;
  if (itemId === "999001") {
    mockItem = {
      id: 999001,
      merchant: "Sears Store",
      name: "Unsupported Item",
      current_price: 10.99,
      original_price: null,
      valid_to: "2026-07-10T23:59:59-04:00"
    };
  } else if (itemId === "999002") {
    mockItem = {
      id: 999002,
      merchant: "Food Basics",
      name: "WHITE CREMINI MUSHROOMS",
      current_price: 1.99,
      original_price: 2.99,
      valid_to: "2026-07-10T23:59:59-04:00"
    };
  } else if (itemId === "999003") {
    mockItem = {
      id: 999003,
      merchant: "Food Basics",
      name: "CASHMERE TISSUE",
      current_price: 1.49,
      original_price: 2.99,
      valid_to: "2026-07-10T23:59:59-04:00"
    };
  } else if (itemId === "999004") {
    mockItem = {
      id: 999004,
      merchant: "Metro",
      name: "Purfiltre Milk 2%",
      current_price: 4.88,
      original_price: 5.99,
      valid_to: "2026-07-10T23:59:59-04:00"
    };
  } else if (itemId === "999005") {
    mockItem = {
      id: 999005,
      merchant: "Food Basics",
      name: "NATREL ORGANIC MILK 1%",
      current_price: 5.49,
      original_price: 6.49,
      valid_to: "2026-07-10T23:59:59-04:00"
    };
  } else if (itemId === "999006") {
    mockItem = {
      id: 999006,
      merchant: "Food Basics",
      name: "KAWARTHA OR SHAW'S ICE CREAM",
      current_price: 4.99,
      original_price: 6.99,
      valid_to: "2026-07-10T23:59:59-04:00"
    };
  } else if (itemId === "999007") {
    // Existing catalog item pricing update scenario
    mockItem = {
      id: 999007,
      merchant: "Food Basics",
      name: "NATREL ORGANIC MILK 1%",
      current_price: 3.99, // Updated price
      original_price: 6.49,
      valid_to: "2026-07-10T23:59:59-04:00"
    };
  } else if (itemId === "999008") {
    // Uncertain match confidence 70-89
    mockItem = {
      id: 999008,
      merchant: "Food Basics",
      name: "Cremini Mushroom",
      current_price: 1.88,
      original_price: 2.99,
      valid_to: "2026-07-10T23:59:59-04:00"
    };
  }

  if (mockItem) {
    return {
      ok: true,
      status: 200,
      json: async () => ({ item: mockItem })
    } as any;
  }

  return {
    ok: false,
    status: 404,
    json: async () => ({ error: "Not Found" })
  } as any;
};

// Verification Test suite
async function runTests() {
  console.log("=== STARTING FLIPP INGESTION UNIT TESTS ===\n");

  // Scenario 1: Attempting to add an item for which the store has not yet been configured
  try {
    await buildPreviewResponse("https://flipp.com/en-ca/perth-on/item/999001-sears-ad?postal_code=K7H3C6", mockCatalog);
    console.log("Scenario 1 (Unsupported Store): ❌ FAIL (Expected error)");
  } catch (err: any) {
    console.log(`Scenario 1 (Unsupported Store):`);
    console.log(`  Expected error: "Store not setup for this item"`);
    console.log(`  Actual:   "${err.message}"`);
    console.log(err.message === "Store not setup for this item" ? "  ✅ PASS" : "  ❌ FAIL");
  }
  console.log();

  // Scenario 2: Preview & commit for item where exact pricing matches
  const preview2 = await buildPreviewResponse("https://flipp.com/en-ca/perth-on/item/999002-food-basics-weekly-ad?postal_code=K7H3C6", mockCatalog);
  console.log(`Scenario 2 Preview (Exact Match):`);
  console.log(`  Requires Selection: ${preview2.requiresSelection} (Expected: false)`);
  console.log(`  Options Count: ${preview2.options.length} (Expected: 1)`);
  console.log(`  Best Matched ID: ${preview2.options[0].matchedId} (Expected: "catalog-exists-matching")`);
  console.log(preview2.requiresSelection === false && preview2.options[0].matchedId === "catalog-exists-matching" ? "  ✅ PASS" : "  ❌ FAIL");

  const commit2 = await commitFlippIngestion({
    url: "https://flipp.com/en-ca/perth-on/item/999002-food-basics-weekly-ad?postal_code=K7H3C6",
    quantity: 1,
    selectedOptionIndex: 0,
    preview: preview2,
    catalog: mockCatalog,
    groceryItems: mockGroceryItems
  });
  mockCatalog = commit2.catalog;
  mockGroceryItems = commit2.groceryItems;
  console.log(`Scenario 2 Commit:`);
  console.log(`  Expected message: "Added White Cremini Mushrooms to shopping list"`);
  console.log(`  Actual:   "${commit2.message}"`);
  console.log(commit2.message === "Added White Cremini Mushrooms to shopping list" ? "  ✅ PASS" : "  ❌ FAIL");
  console.log();

  // Scenario 3: Adding an item to the shopping list for which the item exists, but the store pricing doesn't match
  const preview3 = await buildPreviewResponse("https://flipp.com/en-ca/perth-on/item/999003-food-basics-weekly-ad?postal_code=K7H3C6", mockCatalog);
  const commit3 = await commitFlippIngestion({
    url: "https://flipp.com/en-ca/perth-on/item/999003-food-basics-weekly-ad?postal_code=K7H3C6",
    quantity: 2,
    selectedOptionIndex: 0,
    preview: preview3,
    catalog: mockCatalog,
    groceryItems: mockGroceryItems
  });
  mockCatalog = commit3.catalog;
  mockGroceryItems = commit3.groceryItems;
  console.log(`Scenario 3 (Mismatched Pricing Update):`);
  console.log(`  Expected message: "Added Cashmere Tissue to shopping list (price updated)"`);
  console.log(`  Actual:   "${commit3.message}"`);
  console.log(commit3.message === "Added Cashmere Tissue to shopping list (price updated)" ? "  ✅ PASS" : "  ❌ FAIL");
  console.log(`  List Quantity: ${mockGroceryItems.find(i => i.name === "Cashmere Tissue")?.quantity} (Expected: 2)`);
  console.log(`  New Sale Price: ${mockCatalog.items.find(i => i.name === "Cashmere Tissue")?.stores["foodbasics"]?.sale_price} (Expected: 1.49)`);
  console.log();

  // Scenario 4: Adding an item to the shopping list for which the item exists, but there is no store pricing configured
  const preview4 = await buildPreviewResponse("https://flipp.com/en-ca/perth-on/item/999004-metro-weekly-ad?postal_code=K7H3C6", mockCatalog);
  const commit4 = await commitFlippIngestion({
    url: "https://flipp.com/en-ca/perth-on/item/999004-metro-weekly-ad?postal_code=K7H3C6",
    quantity: 1,
    selectedOptionIndex: 0,
    preview: preview4,
    catalog: mockCatalog,
    groceryItems: mockGroceryItems
  });
  mockCatalog = commit4.catalog;
  mockGroceryItems = commit4.groceryItems;
  console.log(`Scenario 4 (No Store Pricing Configured):`);
  console.log(`  Expected message: "Added Purfiltre Milk 2% to shopping list (price updated)"`);
  console.log(`  Actual:   "${commit4.message}"`);
  console.log(commit4.message === "Added Purfiltre Milk 2% to shopping list (price updated)" ? "  ✅ PASS" : "  ❌ FAIL");
  console.log();

  // Scenario 5: Adding an item in the shopping list for which the item does not exist, is created, with store pricing added
  const preview5 = await buildPreviewResponse("https://flipp.com/en-ca/perth-on/item/999005-food-basics-weekly-ad?postal_code=K7H3C6", mockCatalog);
  const commit5 = await commitFlippIngestion({
    url: "https://flipp.com/en-ca/perth-on/item/999005-food-basics-weekly-ad?postal_code=K7H3C6",
    quantity: 3,
    selectedOptionIndex: 0,
    preview: preview5,
    catalog: mockCatalog,
    groceryItems: mockGroceryItems
  });
  mockCatalog = commit5.catalog;
  mockGroceryItems = commit5.groceryItems;
  console.log(`Scenario 5 (Brand New Item Created):`);
  console.log(`  Expected message: "Added Natrel Organic Milk 1% to catalog and shopping list"`);
  console.log(`  Actual:   "${commit5.message}"`);
  console.log(commit5.message === "Added Natrel Organic Milk 1% to catalog and shopping list" ? "  ✅ PASS" : "  ❌ FAIL");
  console.log();

  // Scenario 6: Adding a conjoined multi-product item (e.g. Kawartha or Shaw's Ice Cream)
  // Expecting preview to return 2 options, and commit with selectedOptionIndex: 0 to only add Kawartha.
  const preview6 = await buildPreviewResponse("https://flipp.com/en-ca/perth-on/item/999006-food-basics-weekly-ad?postal_code=K7H3C6", mockCatalog);
  console.log(`Scenario 6 Preview (Multi-Product Ingestion Option Preview):`);
  console.log(`  Requires Selection: ${preview6.requiresSelection} (Expected: true)`);
  console.log(`  Options: [${preview6.options.map(o => o.productName).join(", ")}]`);
  console.log(preview6.requiresSelection === true && preview6.options.length === 2 ? "  ✅ PASS" : "  ❌ FAIL");

  const commit6 = await commitFlippIngestion({
    url: "https://flipp.com/en-ca/perth-on/item/999006-food-basics-weekly-ad?postal_code=K7H3C6",
    quantity: 2,
    selectedOptionIndex: 0, // Kawartha only
    preview: preview6,
    catalog: mockCatalog,
    groceryItems: mockGroceryItems
  });
  mockCatalog = commit6.catalog;
  mockGroceryItems = commit6.groceryItems;
  console.log(`Scenario 6 Commit:`);
  console.log(`  Expected message: "Added Kawartha to catalog and shopping list"`);
  console.log(`  Actual:   "${commit6.message}"`);
  console.log(commit6.message === "Added Kawartha to catalog and shopping list" ? "  ✅ PASS" : "  ❌ FAIL");
  console.log(`  Kawartha Qty: ${mockGroceryItems.find(i => i.name === "Kawartha")?.quantity} (Expected: 2)`);
  console.log(`  Shaw's in shopping list? ${!!mockGroceryItems.find(i => i.name === "Shaw's Ice Cream")} (Expected: false)`);
  console.log();

  // Scenario 7 (Added Scenario): Existing catalog item gets price update (no duplicate)
  // Natrel Organic Milk 1% already exists from Scenario 5. Let's update its price via 999007.
  const preview7 = await buildPreviewResponse("https://flipp.com/en-ca/perth-on/item/999007-food-basics-weekly-ad?postal_code=K7H3C6", mockCatalog);
  console.log(`Scenario 7 Preview (Existing Item match check):`);
  console.log(`  Matched Item ID: ${preview7.options[0].matchedId} (Expected matches the one created in Scenario 5)`);
  console.log(preview7.options[0].matchedId !== null ? "  ✅ PASS" : "  ❌ FAIL");

  const commit7 = await commitFlippIngestion({
    url: "https://flipp.com/en-ca/perth-on/item/999007-food-basics-weekly-ad?postal_code=K7H3C6",
    quantity: 1,
    selectedOptionIndex: 0,
    preview: preview7,
    catalog: mockCatalog,
    groceryItems: mockGroceryItems
  });
  mockCatalog = commit7.catalog;
  mockGroceryItems = commit7.groceryItems;
  console.log(`Scenario 7 Commit:`);
  console.log(`  Expected message: "Added Natrel Organic Milk 1% to shopping list (price updated)"`);
  console.log(`  Actual:   "${commit7.message}"`);
  console.log(commit7.message === "Added Natrel Organic Milk 1% to shopping list (price updated)" ? "  ✅ PASS" : "  ❌ FAIL");
  console.log();

  // Scenario 8 (Added Scenario): Uncertain match (confidence 70-89) returns alternatives in preview
  // Ingesting "Cremini Mushroom" (999008) against catalog containing "White Cremini Mushrooms" (score 70-89).
  const preview8 = await buildPreviewResponse("https://flipp.com/en-ca/perth-on/item/999008-food-basics-weekly-ad?postal_code=K7H3C6", mockCatalog);
  console.log(`Scenario 8 Preview (Uncertain Match with Alternatives):`);
  console.log(`  Matched Item ID: ${preview8.options[0].matchedId} (Expected: null for uncertain match)`);
  console.log(`  Alternatives Count: ${preview8.options[0].alternatives.length} (Expected: >= 1)`);
  console.log(`  Alternative Item Name: ${preview8.options[0].alternatives[0]?.name} (Expected: "White Cremini Mushrooms")`);
  console.log(preview8.options[0].matchedId === null && preview8.options[0].alternatives[0]?.name === "White Cremini Mushrooms" ? "  ✅ PASS" : "  ❌ FAIL");
  console.log();

  console.log("=== TESTS COMPLETE ===");
}

runTests();
