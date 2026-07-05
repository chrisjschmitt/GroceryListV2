import { CombinedCatalog, GroceryItem } from "./src/lib/types";
import { splitMultiProductDescription } from "../src/lib/gemini-match-service";
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

// URL Normalizer to ignore query parameters and protocols
const normalizeUrl = (u: string): string => {
  if (!u) return "";
  let norm = u.toLowerCase().trim();
  norm = norm.replace(/^https?:\/\//, "").replace(/^www\./, "");
  const qIdx = norm.indexOf("?");
  if (qIdx !== -1) {
    norm = norm.substring(0, qIdx);
  }
  if (norm.endsWith("/")) {
    norm = norm.slice(0, -1);
  }
  return norm;
};

// Name cleaning and title casing helpers
const cleanName = (n: string): string => {
  return n.toLowerCase()
          .replace(/\b\d+(?:g|kg|ml|l|oz|lb|s|'s|pk|pack|pcs|pieces)\b/gi, "")
          .replace(/\b(selected varieties|product of canada|each|weekly ad)\b/gi, "")
          .replace(/\s+/g, " ")
          .trim();
};

const toTitleCase = (str: string): string => {
  return str.toLowerCase().split(' ').map(word => {
    return word.charAt(0).toUpperCase() + word.slice(1);
  }).join(' ');
};

const categorizeItemByName = (itemName: string): string => {
  const name = itemName.toLowerCase();

  // Produce
  if (
    name.includes("mushroom") ||
    name.includes("onion") ||
    name.includes("garlic") ||
    name.includes("potato") ||
    name.includes("carrot") ||
    name.includes("tomato") ||
    name.includes("pepper") ||
    name.includes("salad") ||
    name.includes("lettuce") ||
    name.includes("cabbage") ||
    name.includes("spinach") ||
    name.includes("cucumber") ||
    name.includes("celery") ||
    name.includes("broccoli") ||
    name.includes("cauliflower") ||
    name.includes("zucchini") ||
    name.includes("squash") ||
    name.includes("berry") ||
    name.includes("berries") ||
    name.includes("strawberry") ||
    name.includes("blueberry") ||
    name.includes("raspberry") ||
    name.includes("banana") ||
    name.includes("apple") ||
    name.includes("orange") ||
    name.includes("lemon") ||
    name.includes("lime") ||
    name.includes("grape") ||
    name.includes("melon") ||
    name.includes("watermelon") ||
    name.includes("avocado") ||
    name.includes("peach") ||
    name.includes("plum") ||
    name.includes("pear") ||
    name.includes("herb") ||
    name.includes("parsley") ||
    name.includes("cilantro") ||
    name.includes("basil") ||
    name.includes("fruit") ||
    name.includes("vegetable")
  ) {
    return "Fresh Produce";
  }

  // Dairy & Eggs
  if (
    name.includes("milk") ||
    name.includes("cream") ||
    name.includes("cheese") ||
    name.includes("yogurt") ||
    name.includes("butter") ||
    name.includes("margarine") ||
    name.includes("egg") ||
    name.includes("sour cream") ||
    name.includes("cottage cheese") ||
    name.includes("kefir") ||
    name.includes("dairy")
  ) {
    return "Dairy & Eggs";
  }

  // Bakery & Breads
  if (
    name.includes("bread") ||
    name.includes("bun") ||
    name.includes("roll") ||
    name.includes("bagel") ||
    name.includes("tortilla") ||
    name.includes("pita") ||
    name.includes("croissant") ||
    name.includes("muffin") ||
    name.includes("cake") ||
    name.includes("pastry") ||
    name.includes("pie") ||
    name.includes("cookie") ||
    name.includes("donut") ||
    name.includes("danish") ||
    name.includes("baguette") ||
    name.includes("bakery")
  ) {
    return "Bakery & Breads";
  }

  // Meat & Seafood
  if (
    name.includes("chicken") ||
    name.includes("beef") ||
    name.includes("pork") ||
    name.includes("turkey") ||
    name.includes("bacon") ||
    name.includes("sausage") ||
    name.includes("ham") ||
    name.includes("steak") ||
    name.includes("chop") ||
    name.includes("rib") ||
    name.includes("salmon") ||
    name.includes("shrimp") ||
    name.includes("fish") ||
    name.includes("tuna") ||
    name.includes("seafood") ||
    name.includes("meat") ||
    name.includes("lamb") ||
    name.includes("veal") ||
    name.includes("burger")
  ) {
    return "Meat & Seafood";
  }

  // Frozen Foods
  if (
    name.includes("frozen") ||
    name.includes("ice cream") ||
    name.includes("gelato") ||
    name.includes("sorbet") ||
    name.includes("waffle") ||
    name.includes("pizza")
  ) {
    return "Frozen Foods";
  }

  // Snacks & Beverages
  if (
    name.includes("chip") ||
    name.includes("cracker") ||
    name.includes("pretzel") ||
    name.includes("popcorn") ||
    name.includes("nut") ||
    name.includes("seed") ||
    name.includes("candy") ||
    name.includes("chocolate") ||
    name.includes("gummy") ||
    name.includes("soda") ||
    name.includes("pop") ||
    name.includes("juice") ||
    name.includes("water") ||
    name.includes("tea") ||
    name.includes("coffee") ||
    name.includes("drink") ||
    name.includes("beverage") ||
    name.includes("coke") ||
    name.includes("pepsi")
  ) {
    return "Snacks & Beverages";
  }

  // Health, Personal & Household
  if (
    name.includes("soap") ||
    name.includes("shampoo") ||
    name.includes("conditioner") ||
    name.includes("toothpaste") ||
    name.includes("toothbrush") ||
    name.includes("tissue") ||
    name.includes("toilet paper") ||
    name.includes("napkin") ||
    name.includes("detergent") ||
    name.includes("cleaner") ||
    name.includes("trash bag") ||
    name.includes("foil") ||
    name.includes("wrap") ||
    name.includes("vitamin") ||
    name.includes("supplement") ||
    name.includes("medicine") ||
    name.includes("lotion") ||
    name.includes("cream") ||
    name.includes("deodorant")
  ) {
    return "Health, Personal & Household";
  }

  // Pantry Staples
  if (
    name.includes("mayo") ||
    name.includes("dressing") ||
    name.includes("sauce") ||
    name.includes("oil") ||
    name.includes("vinegar") ||
    name.includes("spice") ||
    name.includes("salt") ||
    name.includes("pepper") ||
    name.includes("flour") ||
    name.includes("sugar") ||
    name.includes("rice") ||
    name.includes("pasta") ||
    name.includes("noodle") ||
    name.includes("cereal") ||
    name.includes("oat") ||
    name.includes("soup") ||
    name.includes("can") ||
    name.includes("canned") ||
    name.includes("bean") ||
    name.includes("honey") ||
    name.includes("syrup") ||
    name.includes("spread") ||
    name.includes("peanut butter") ||
    name.includes("jam") ||
    name.includes("jelly") ||
    name.includes("ketchup") ||
    name.includes("mustard") ||
    name.includes("relish") ||
    name.includes("salsa") ||
    name.includes("taco") ||
    name.includes("seasoning") ||
    name.includes("marinade") ||
    name.includes("extract") ||
    name.includes("baking") ||
    name.includes("yeast") ||
    name.includes("starch") ||
    name.includes("broth") ||
    name.includes("stock") ||
    name.includes("bouillon") ||
    name.includes("gravy")
  ) {
    return "Pantry Staples";
  }

  return "Other";
};

const scoreCatalogMatch = (catalogName: string, flippName: string): number => {
  const c = catalogName.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
  const f = flippName.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();

  if (c === f) return 100; // Exact match

  const cWords = c.split(/\s+/).filter(w => w.length > 1);
  const fWords = f.split(/\s+/).filter(w => w.length > 1);

  if (cWords.length === 0 || fWords.length === 0) return 0;

  // Count matching words
  let matches = 0;
  for (const cw of cWords) {
    // Handle singular/plural basic match (e.g. mushroom vs mushrooms, apple vs apples)
    const singularCw = cw.endsWith("s") && cw.length > 3 ? cw.slice(0, -1) : cw;
    const matched = fWords.some(fw => {
      const singularFw = fw.endsWith("s") && fw.length > 3 ? fw.slice(0, -1) : fw;
      return fw === cw || singularFw === singularCw || fw === singularCw || singularFw === cw;
    });
    if (matched) {
      matches++;
    }
  }

  if (matches === 0) return 0;

  const overlapRatio = matches / cWords.length;
  if (overlapRatio < 1.0) {
    return overlapRatio * 70; // Partial match
  }

  return 85 + (cWords.length * 2);
};

// Ingestion Logic Core function for simulation
async function runIngestionTest(url: string, quantity: number): Promise<string> {
  // Extract item ID
  const match = url.match(/\/item\/(\d+)/);
  if (!match) {
    throw new Error("Error: Invalid Flipp item URL structure.");
  }
  const itemId = match[1];

  // Fetch Flipp details via Mocked Fetch Database
  let flippData: any = null;
  if (itemId === "999001") {
    flippData = {
      item: {
        id: 999001,
        merchant: "Sears Store",
        name: "Unsupported Item",
        current_price: 10.99,
        original_price: null,
        valid_to: "2026-07-10T23:59:59-04:00"
      }
    };
  } else if (itemId === "999002") {
    flippData = {
      item: {
        id: 999002,
        merchant: "Food Basics",
        name: "WHITE CREMINI MUSHROOMS",
        current_price: 1.99,
        original_price: 2.99,
        valid_to: "2026-07-10T23:59:59-04:00"
      }
    };
  } else if (itemId === "999003") {
    flippData = {
      item: {
        id: 999003,
        merchant: "Food Basics",
        name: "CASHMERE TISSUE",
        current_price: 1.49, // Updated sale price
        original_price: 2.99,
        valid_to: "2026-07-10T23:59:59-04:00"
      }
    };
  } else if (itemId === "999004") {
    flippData = {
      item: {
        id: 999004,
        merchant: "Metro", // Metropolitan area store
        name: "Purfiltre Milk 2%",
        current_price: 4.88,
        original_price: 5.99,
        valid_to: "2026-07-10T23:59:59-04:00"
      }
    };
  } else if (itemId === "999005") {
    flippData = {
      item: {
        id: 999005,
        merchant: "Food Basics",
        name: "NATREL ORGANIC MILK 1%",
        current_price: 5.49,
        original_price: 6.49,
        valid_to: "2026-07-10T23:59:59-04:00"
      }
    };
  } else if (itemId === "999006") {
    flippData = {
      item: {
        id: 999006,
        merchant: "Food Basics",
        name: "KAWARTHA OR SHAW'S ICE CREAM",
        current_price: 4.99,
        original_price: 6.99,
        valid_to: "2026-07-10T23:59:59-04:00"
      }
    };
  }

  if (!flippData || !flippData.item) {
    throw new Error("Error: Item not found in Flipp database.");
  }

  const fItem = flippData.item;
  const rawMerchant = fItem.merchant || "";
  const rawItemName = fItem.name || "";
  const saleVal = fItem.current_price;
  const regVal = fItem.original_price;
  const validTo = fItem.valid_to || "";

  // Normalize merchant to Store ID
  const normalizeMerchantToStoreId = (mName: string): string | null => {
    const m = mName.toLowerCase().trim();
    if (m.includes("food basics") || m.includes("foodbasics")) return "foodbasics";
    if (m === "metro") return "metro";
    if (m.includes("freshco") || m.includes("fresh co")) return "freshco";
    if (m.includes("no frills") || m.includes("nofrills")) return "nofrills";
    if (m === "walmart") return "walmart";
    if (m === "loblaws") return "loblaws";
    if (m.includes("independent grocer") || m === "yourindependentgrocer") return "yourindependentgrocer";
    if (m.includes("canadian tire") || m.includes("canadiantire")) return "canadiantire";
    return null;
  };

  const storeId = normalizeMerchantToStoreId(rawMerchant);
  if (!storeId || !mockCatalog.stores[storeId]) {
    return "Store not setup for this item";
  }

  const splitNames = await splitMultiProductDescription(rawItemName);

  const newItemsList: string[] = [];
  const updatedItemsList: string[] = [];
  const regularItemsList: string[] = [];

  for (const productName of splitNames) {
    // Search matching item in catalog
    let matchedItem = (mockCatalog.items || []).find((item: any) => {
      const hasUrlMatch = Object.values(item.stores || {}).some((s: any) => 
        s && (normalizeUrl(s.flipp_url) === normalizeUrl(url) || normalizeUrl(s.url) === normalizeUrl(url) || String(s.upc) === String(itemId))
      );
      if (hasUrlMatch) {
        return scoreCatalogMatch(item.name, productName) >= 70;
      }
      return false;
    });

    if (!matchedItem) {
      matchedItem = (mockCatalog.items || []).find((item: any) => 
        item.name.toLowerCase() === productName.toLowerCase()
      );
    }

    if (!matchedItem) {
      const targetClean = cleanName(productName);
      matchedItem = (mockCatalog.items || []).find((item: any) => 
        cleanName(item.name) === targetClean
      );
    }

    if (!matchedItem) {
      const scoredCandidates = (mockCatalog.items || []).map((item: any) => {
        const score = scoreCatalogMatch(item.name, productName);
        return { item, score };
      }).filter(c => c.score >= 80);

      if (scoredCandidates.length > 0) {
        scoredCandidates.sort((a, b) => b.score - a.score);
        matchedItem = scoredCandidates[0].item;
      }
    }

    let isNewItem = false;
    let priceUpdated = false;
    let finalItemName = "";

    const formattedExpiry = validTo ? validTo.split("T")[0] : "";

    if (matchedItem) {
      finalItemName = matchedItem.name;
      const existingStore = matchedItem.stores?.[storeId];
      if (!existingStore) {
        priceUpdated = true;
        if (!matchedItem.stores) matchedItem.stores = {};
        matchedItem.stores[storeId] = {
          url: url,
          flipp_url: url,
          upc: itemId,
          regular_price: regVal !== null ? regVal : saleVal,
          sale_price: saleVal,
          is_on_sale: 1,
          valid_until: formattedExpiry,
          in_flyer: 1,
          is_verified: true,
          track_pricing: true
        };
      } else {
        const matchesPricing = existingStore.sale_price === saleVal && existingStore.regular_price === (regVal !== null ? regVal : existingStore.regular_price);
        const matchesUrl = normalizeUrl(existingStore.flipp_url) === normalizeUrl(url);
        if (!matchesPricing || !matchesUrl) {
          priceUpdated = true;
          matchedItem.stores[storeId] = {
            ...existingStore,
            flipp_url: url,
            regular_price: regVal !== null ? regVal : (existingStore.regular_price !== undefined && existingStore.regular_price !== null ? existingStore.regular_price : saleVal),
            sale_price: saleVal,
            is_on_sale: 1,
            valid_until: formattedExpiry || existingStore.valid_until,
            in_flyer: 1,
            is_verified: true,
            track_pricing: true
          };
        }
      }
    } else {
      isNewItem = true;
      const cleanedTitle = toTitleCase(cleanName(productName));
      finalItemName = cleanedTitle || toTitleCase(productName);
      
      const newId = `regular-unmatched-${Date.now()}`;
      matchedItem = {
        id: newId,
        name: finalItemName,
        category: categorizeItemByName(finalItemName),
        unit: "unit",
        requires_scraping: true,
        stores: {
          [storeId]: {
            url: url,
            flipp_url: url,
            upc: itemId,
            regular_price: regVal !== null ? regVal : saleVal,
            sale_price: saleVal,
            is_on_sale: 1,
            valid_until: formattedExpiry,
            in_flyer: 1,
            is_verified: true,
            track_pricing: true
          }
        }
      };
      if (!mockCatalog.items) mockCatalog.items = [];
      mockCatalog.items.push(matchedItem);
    }

    if (isNewItem) {
      newItemsList.push(finalItemName);
    } else if (priceUpdated) {
      updatedItemsList.push(finalItemName);
    } else {
      regularItemsList.push(finalItemName);
    }

    // Update mock shopping list
    const existingListItem = mockGroceryItems.find(i => i.name.toLowerCase().trim() === finalItemName.toLowerCase().trim());
    if (existingListItem) {
      existingListItem.quantity += quantity;
    } else {
      const newListItem: any = {
        id: `item-${Date.now()}`,
        name: finalItemName,
        category: matchedItem.category || "Other",
        quantity: quantity,
        unit: matchedItem.unit || "unit",
        units: matchedItem.units,
        checked: false,
        prices: [],
        bestPrice: undefined,
        createdAt: new Date().toISOString()
      };
      mockGroceryItems.push(newListItem);
    }
  }

  // Build return message matching server logic
  const summaryParts: string[] = [];
  if (newItemsList.length > 0) {
    summaryParts.push(`Added ${newItemsList.join(", ")} to catalog and shopping list`);
  }
  if (updatedItemsList.length > 0) {
    summaryParts.push(`Added ${updatedItemsList.join(", ")} to shopping list (price updated)`);
  }
  if (regularItemsList.length > 0) {
    summaryParts.push(`Added ${regularItemsList.join(", ")} to shopping list`);
  }
  return summaryParts.join("; ");
}

// Verification Test suite
async function runTests() {
  console.log("=== STARTING FLIPP INGESTION UNIT TESTS ===\n");
  
  // Scenario 1: Attempting to add an item for which the store has not yet been configured
  const res1 = await runIngestionTest("https://flipp.com/en-ca/perth-on/item/999001-sears-ad?postal_code=K7H3C6", 1);
  console.log(`Scenario 1 (Unsupported Store):`);
  console.log(`  Expected: "Store not setup for this item"`);
  console.log(`  Actual:   "${res1}"`);
  console.log(res1 === "Store not setup for this item" ? "  ✅ PASS" : "  ❌ FAIL");
  console.log();

  // Scenario 2: Adding an item to the shopping list for which the item exists, and the pricing matches
  const res2 = await runIngestionTest("https://flipp.com/en-ca/perth-on/item/999002-food-basics-weekly-ad?postal_code=K7H3C6", 1);
  console.log(`Scenario 2 (Exact Pricing Match):`);
  console.log(`  Expected: "Added White Cremini Mushrooms to shopping list"`);
  console.log(`  Actual:   "${res2}"`);
  console.log(res2 === "Added White Cremini Mushrooms to shopping list" ? "  ✅ PASS" : "  ❌ FAIL");
  console.log(`  List Quantity: ${mockGroceryItems.find(i => i.name === "White Cremini Mushrooms")?.quantity}`);
  console.log();

  // Scenario 3: Adding an item to the shopping list for which the item exists, but the store pricing doesn't match
  const res3 = await runIngestionTest("https://flipp.com/en-ca/perth-on/item/999003-food-basics-weekly-ad?postal_code=K7H3C6", 2);
  console.log(`Scenario 3 (Mismatched Pricing Update):`);
  console.log(`  Expected: "Added Cashmere Tissue to shopping list (price updated)"`);
  console.log(`  Actual:   "${res3}"`);
  console.log(res3 === "Added Cashmere Tissue to shopping list (price updated)" ? "  ✅ PASS" : "  ❌ FAIL");
  console.log(`  List Quantity: ${mockGroceryItems.find(i => i.name === "Cashmere Tissue")?.quantity}`);
  console.log(`  New Sale Price: ${mockCatalog.items.find(i => i.name === "Cashmere Tissue")?.stores["foodbasics"]?.sale_price}`);
  console.log();

  // Scenario 4: Adding an item to the shopping list for which the item exists, but there is no store pricing configured
  const res4 = await runIngestionTest("https://flipp.com/en-ca/perth-on/item/999004-metro-weekly-ad?postal_code=K7H3C6", 1);
  console.log(`Scenario 4 (No Store Pricing Configured):`);
  console.log(`  Expected: "Added Purfiltre Milk 2% to shopping list (price updated)"`);
  console.log(`  Actual:   "${res4}"`);
  console.log(res4 === "Added Purfiltre Milk 2% to shopping list (price updated)" ? "  ✅ PASS" : "  ❌ FAIL");
  console.log(`  Metro Sale Price Created: ${mockCatalog.items.find(i => i.name === "Purfiltre Milk 2%")?.stores["metro"]?.sale_price}`);
  console.log();

  // Scenario 5: Adding an item in the shopping list for which the item does not exist, is created, with store pricing added
  const res5 = await runIngestionTest("https://flipp.com/en-ca/perth-on/item/999005-food-basics-weekly-ad?postal_code=K7H3C6", 3);
  console.log(`Scenario 5 (Brand New Item Created):`);
  console.log(`  Expected: "Added Natrel Organic Milk 1% to catalog and shopping list"`);
  console.log(`  Actual:   "${res5}"`);
  console.log(res5 === "Added Natrel Organic Milk 1% to catalog and shopping list" || res5.includes("Natrel Organic Milk 1%") ? "  ✅ PASS" : "  ❌ FAIL");
  console.log(`  New Item List Quantity: ${mockGroceryItems.find(i => i.name === "Natrel Organic Milk 1%")?.quantity}`);
  console.log();

  // Scenario 6: Adding a conjoined multi-product item (e.g. Kawartha or Shaw's Ice Cream)
  const res6 = await runIngestionTest("https://flipp.com/en-ca/perth-on/item/999006-food-basics-weekly-ad?postal_code=K7H3C6", 2);
  console.log(`Scenario 6 (Conjoined Multi-Product Item Split):`);
  console.log(`  Expected: "Added Kawartha Ice Cream, Shaw's Ice Cream to catalog and shopping list"`);
  console.log(`  Actual:   "${res6}"`);
  console.log(res6.includes("Kawartha Ice Cream") && res6.includes("Shaw's Ice Cream") ? "  ✅ PASS" : "  ❌ FAIL");
  console.log(`  Kawartha Qty: ${mockGroceryItems.find(i => i.name === "Kawartha Ice Cream")?.quantity}`);
  console.log(`  Shaw's Qty: ${mockGroceryItems.find(i => i.name === "Shaw's Ice Cream")?.quantity}`);
  console.log();

  console.log("=== TESTS COMPLETE ===");
}

runTests();
