import { CombinedCatalog, RegularItem, GroceryItem } from "./types.js";
import { evaluateGeminiMatch, splitMultiProductDescription } from "./gemini-match-service.js";
import { getMongoDb } from "./db-store.js";

export interface IngestionPreviewResponse {
  success: boolean;
  requiresSelection: boolean;
  storeId: string;
  storeName: string;
  options: IngestionOption[];
  fItem: {
    id: string;
    merchant: string;
    name: string;
    current_price: number | null;
    original_price: number | null;
    valid_to: string;
  };
}

export interface IngestionOption {
  productName: string;
  cleanTitle: string;
  category: string;
  matchedId: string | null;
  matchedName: string | null;
  confidence: number;
  alternatives: Array<{ id: string; name: string; score: number }>;
}

export function extractFlippItemId(url: string): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const itemIdParam = parsed.searchParams.get("item_id");
    if (itemIdParam) return itemIdParam;
  } catch (e) {
    // Ignore URL parsing errors
  }
  const match = url.match(/\/item\/(\d+)/);
  if (match) return match[1];
  const matchParam = url.match(/[?&]item_id=(\d+)/);
  if (matchParam) return matchParam[1];
  return null;
}

export function scoreCatalogMatch(catalogName: string, flippName: string): number {
  const c = catalogName.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
  const f = flippName.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();

  if (c === f) return 100; // Exact match

  const cWords = c.split(/\s+/).filter(w => w.length > 1);
  const fWords = f.split(/\s+/).filter(w => w.length > 1);

  if (cWords.length === 0 || fWords.length === 0) return 0;

  // Count matching words
  let matches = 0;
  for (const cw of cWords) {
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
}

export function cleanName(n: string): string {
  return n.toLowerCase()
          .replace(/\b\d+(?:g|kg|ml|l|oz|lb|s|'s|pk|pack|pcs|pieces)\b/gi, "")
          .replace(/\b(selected varieties|product of canada|each|weekly ad)\b/gi, "")
          .replace(/\s+/g, " ")
          .trim();
}

export function toTitleCase(str: string): string {
  return str.toLowerCase().split(' ').map(word => {
    return word.charAt(0).toUpperCase() + word.slice(1);
  }).join(' ');
}

export function categorizeItemByName(itemName: string): string {
  const name = itemName.toLowerCase();
  if (
    name.includes("mushroom") || name.includes("onion") || name.includes("garlic") ||
    name.includes("potato") || name.includes("carrot") || name.includes("tomato") ||
    name.includes("pepper") || name.includes("salad") || name.includes("lettuce") ||
    name.includes("cabbage") || name.includes("spinach") || name.includes("cucumber") ||
    name.includes("celery") || name.includes("broccoli") || name.includes("cauliflower") ||
    name.includes("zucchini") || name.includes("squash") || name.includes("berry") ||
    name.includes("berries") || name.includes("strawberry") || name.includes("blueberry") ||
    name.includes("raspberry") || name.includes("banana") || name.includes("apple") ||
    name.includes("orange") || name.includes("lemon") || name.includes("lime") ||
    name.includes("grape") || name.includes("melon") || name.includes("watermelon") ||
    name.includes("avocado") || name.includes("peach") || name.includes("plum") ||
    name.includes("pear") || name.includes("herb") || name.includes("parsley") ||
    name.includes("cilantro") || name.includes("basil") || name.includes("fruit") ||
    name.includes("vegetable")
  ) {
    return "Fresh Produce";
  }
  if (
    name.includes("milk") || name.includes("cream") || name.includes("cheese") ||
    name.includes("yogurt") || name.includes("butter") || name.includes("margarine") ||
    name.includes("egg") || name.includes("sour cream") || name.includes("cottage cheese") ||
    name.includes("kefir") || name.includes("dairy")
  ) {
    return "Dairy & Eggs";
  }
  if (
    name.includes("bread") || name.includes("bun") || name.includes("roll") ||
    name.includes("bagel") || name.includes("tortilla") || name.includes("pita") ||
    name.includes("croissant") || name.includes("muffin") || name.includes("cake") ||
    name.includes("pastry") || name.includes("pie") || name.includes("cookie") ||
    name.includes("donut") || name.includes("danish") || name.includes("baguette") ||
    name.includes("bakery")
  ) {
    return "Bakery & Breads";
  }
  if (
    name.includes("chicken") || name.includes("beef") || name.includes("pork") ||
    name.includes("turkey") || name.includes("bacon") || name.includes("sausage") ||
    name.includes("ham") || name.includes("steak") || name.includes("chop") ||
    name.includes("rib") || name.includes("salmon") || name.includes("shrimp") ||
    name.includes("fish") || name.includes("tuna") || name.includes("seafood") ||
    name.includes("meat") || name.includes("lamb") || name.includes("veal") ||
    name.includes("burger")
  ) {
    return "Meat & Seafood";
  }
  if (
    name.includes("frozen") || name.includes("ice cream") || name.includes("gelato") ||
    name.includes("sorbet") || name.includes("waffle") || name.includes("pizza")
  ) {
    return "Frozen Foods";
  }
  if (
    name.includes("chip") || name.includes("cracker") || name.includes("pretzel") ||
    name.includes("popcorn") || name.includes("nut") || name.includes("seed") ||
    name.includes("candy") || name.includes("chocolate") || name.includes("gummy") ||
    name.includes("soda") || name.includes("pop") || name.includes("juice") ||
    name.includes("water") || name.includes("tea") || name.includes("coffee") ||
    name.includes("drink") || name.includes("beverage") || name.includes("coke") ||
    name.includes("pepsi")
  ) {
    return "Snacks & Beverages";
  }
  if (
    name.includes("soap") || name.includes("shampoo") || name.includes("conditioner") ||
    name.includes("toothpaste") || name.includes("toothbrush") || name.includes("tissue") ||
    name.includes("toilet paper") || name.includes("napkin") || name.includes("detergent") ||
    name.includes("cleaner") || name.includes("trash bag") || name.includes("foil") ||
    name.includes("wrap") || name.includes("vitamin") || name.includes("supplement") ||
    name.includes("medicine") || name.includes("lotion") || name.includes("cream") ||
    name.includes("deodorant")
  ) {
    return "Health, Personal & Household";
  }
  if (
    name.includes("mayo") || name.includes("dressing") || name.includes("sauce") ||
    name.includes("oil") || name.includes("vinegar") || name.includes("spice") ||
    name.includes("salt") || name.includes("pepper") || name.includes("flour") ||
    name.includes("sugar") || name.includes("rice") || name.includes("pasta") ||
    name.includes("noodle") || name.includes("cereal") || name.includes("oat") ||
    name.includes("soup") || name.includes("can") || name.includes("canned") ||
    name.includes("bean") || name.includes("honey") || name.includes("syrup") ||
    name.includes("spread") || name.includes("peanut butter") || name.includes("jam") ||
    name.includes("jelly") || name.includes("ketchup") || name.includes("mustard") ||
    name.includes("relish") || name.includes("salsa") || name.includes("taco") ||
    name.includes("seasoning") || name.includes("marinade") || name.includes("extract") ||
    name.includes("baking") || name.includes("yeast") || name.includes("starch") ||
    name.includes("broth") || name.includes("stock") || name.includes("bouillon") ||
    name.includes("gravy")
  ) {
    return "Pantry Staples";
  }
  return "Other";
}

export interface ResolvedMatch {
  matchedItem: any | null;
  confidence: number;
  alternatives: Array<{ id: string; name: string; score: number }>;
}

export function normalizeUrl(u: string): string {
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
}

export async function resolveCatalogMatch(
  productName: string,
  catalog: CombinedCatalog,
  itemId: string,
  url: string,
  storeId: string
): Promise<ResolvedMatch> {
  const items = catalog.items || [];
  const alternatives: Array<{ id: string; name: string; score: number }> = [];

  // Populate alternatives for items with score 45-95 (to catch fuzzy/partial overlaps)
  for (const item of items) {
    const score = scoreCatalogMatch(item.name, productName);
    if (score >= 45 && score <= 95) {
      alternatives.push({ id: item.id, name: item.name, score });
    }
  }

  // 1. UPC / Flipp Item ID match
  const upcMatch = items.find((item) => {
    const storeConfig = item.stores?.[storeId];
    if (!storeConfig) return false;
    const hasUpc = String(storeConfig.upc) === String(itemId);
    const hasUrl = normalizeUrl(storeConfig.flipp_url) === normalizeUrl(url) || normalizeUrl(storeConfig.url) === normalizeUrl(url);
    if (hasUpc || hasUrl) {
      return scoreCatalogMatch(item.name, productName) >= 70;
    }
    return false;
  });
  if (upcMatch) {
    return { matchedItem: upcMatch, confidence: 95, alternatives };
  }

  // 2. Exact Name Match
  const exactMatch = items.find(
    (item) => item.name.toLowerCase() === productName.toLowerCase()
  );
  if (exactMatch) {
    return { matchedItem: exactMatch, confidence: 100, alternatives };
  }

  // 3. External Name Match
  const externalMatch = items.find((item) => {
    const storeConfig = item.stores?.[storeId];
    return storeConfig?.external_name?.toLowerCase() === productName.toLowerCase();
  });
  if (externalMatch) {
    return { matchedItem: externalMatch, confidence: 98, alternatives };
  }

  // 4. Fuzzy Match (>= 85)
  let bestFuzzyItem: any = null;
  let maxFuzzyScore = 0;
  for (const item of items) {
    const score = scoreCatalogMatch(item.name, productName);
    if (score >= 85 && score > maxFuzzyScore) {
      maxFuzzyScore = score;
      bestFuzzyItem = item;
    }
  }
  if (bestFuzzyItem) {
    return { matchedItem: bestFuzzyItem, confidence: maxFuzzyScore, alternatives };
  }

  // 5. Gemini Match
  try {
    const catalogItems: RegularItem[] = items.map((item) => ({
      id: item.id,
      name: item.name,
      category: item.category,
      selected: false,
      unit: item.unit,
      units: item.units
    }));
    const geminiResult = await evaluateGeminiMatch(productName, catalogItems);
    if (geminiResult && geminiResult.matched_id) {
      const geminiMatch = items.find((item) => item.id === geminiResult.matched_id);
      if (geminiMatch) {
        return { matchedItem: geminiMatch, confidence: geminiResult.confidence || 90, alternatives };
      }
    }
  } catch (err) {
    console.warn("[Flipp Ingestion] Gemini match evaluation failed, falling back:", err);
  }

  return { matchedItem: null, confidence: 0, alternatives };
}

export async function buildPreviewResponse(
  url: string,
  catalog: CombinedCatalog
): Promise<IngestionPreviewResponse> {
  const itemId = extractFlippItemId(url);
  if (!itemId) {
    throw new Error("Error: Invalid Flipp item URL structure.");
  }

  const flippApiUrl = `https://backflipp.wishabi.com/flipp/items/${itemId}`;
  const flippRes = await fetch(flippApiUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
  });

  if (!flippRes.ok) {
    throw new Error(`Error: Failed to fetch item details from Flipp Ad API. Status: ${flippRes.status}`);
  }

  const flippData: any = await flippRes.json();
  if (!flippData || !flippData.item) {
    throw new Error("Error: Item not found in Flipp database.");
  }

  const fItem = flippData.item;
  const rawMerchant = fItem.merchant || "";
  const rawItemName = fItem.name || "";
  const saleVal = typeof fItem.current_price === "number" 
    ? fItem.current_price 
    : (fItem.current_price ? parseFloat(String(fItem.current_price).replace(/[^0-9.]/g, "")) : null);
  const regVal = typeof fItem.original_price === "number" 
    ? fItem.original_price 
    : (fItem.original_price ? parseFloat(String(fItem.original_price).replace(/[^0-9.]/g, "")) : null);
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
  if (!storeId || !catalog.stores || !catalog.stores[storeId]) {
    throw new Error("Store not setup for this item");
  }

  const storeName = catalog.stores[storeId].store_name || rawMerchant;

  const splitNames = await splitMultiProductDescription(rawItemName);

  const options: IngestionOption[] = [];
  for (const productName of splitNames) {
    const match = await resolveCatalogMatch(productName, catalog, itemId, url, storeId);
    const cleanTitle = toTitleCase(cleanName(productName));
    const proposedCategory = match.matchedItem?.category || categorizeItemByName(cleanTitle);

    options.push({
      productName,
      cleanTitle,
      category: proposedCategory,
      matchedId: match.matchedItem?.id || null,
      matchedName: match.matchedItem?.name || null,
      confidence: match.confidence,
      alternatives: match.alternatives
    });
  }

  return {
    success: true,
    requiresSelection: options.length > 1,
    storeId,
    storeName,
    options,
    fItem: {
      id: itemId,
      merchant: rawMerchant,
      name: rawItemName,
      current_price: saleVal,
      original_price: regVal,
      valid_to: validTo
    }
  };
}

export async function commitFlippIngestion({
  url,
  quantity,
  selectedOptionIndex,
  catalogItemId,
  preview,
  catalog,
  groceryItems
}: {
  url: string;
  quantity: number;
  selectedOptionIndex: number;
  catalogItemId?: string;
  preview: IngestionPreviewResponse;
  catalog: CombinedCatalog;
  groceryItems: GroceryItem[];
}) {
  const storeId = preview.storeId;
  const fItem = preview.fItem;
  const itemId = fItem.id;
  const option = preview.options[selectedOptionIndex];
  if (!option) {
    throw new Error("Invalid selected option index");
  }

  let matchedItem: any = null;
  let finalItemName = "";
  let isNewItem = false;
  let priceUpdated = false;

  // Resolve matching item:
  if (catalogItemId) {
    matchedItem = (catalog.items || []).find((i: any) => i.id === catalogItemId);
  } else if (option.matchedId) {
    matchedItem = (catalog.items || []).find((i: any) => i.id === option.matchedId);
  }

  const formattedExpiry = fItem.valid_to ? fItem.valid_to.split("T")[0] : "";
  const saleVal = fItem.current_price;
  const regVal = fItem.original_price;

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
        track_pricing: true,
        external_name: option.productName
      };
    } else {
      const matchesPricing = existingStore.sale_price === saleVal && existingStore.regular_price === (regVal !== null ? regVal : existingStore.regular_price);
      if (!matchesPricing || normalizeUrl(existingStore.flipp_url) !== normalizeUrl(url)) {
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
          track_pricing: true,
          external_name: option.productName
        };
      }
    }
  } else {
    isNewItem = true;
    finalItemName = option.cleanTitle;

    const newId = `regular-unmatched-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    matchedItem = {
      id: newId,
      name: finalItemName,
      category: option.category,
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
          track_pricing: true,
          external_name: option.productName
        }
      }
    };
    if (!catalog.items) catalog.items = [];
    catalog.items.push(matchedItem);
  }

  // Update MongoDB prices collection
  if (isNewItem || priceUpdated) {
    try {
      const db = await getMongoDb();
      const pricesCollection = db.collection("prices");
      const storeConfig = matchedItem.stores[storeId];
      const slugify = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
      
      // Keep ID format stable: if multi-product and we split, append slug to prevent overwrites
      const mongoId = preview.options.length > 1 ? `${itemId}-${slugify(option.productName)}` : itemId;

      await pricesCollection.updateOne(
        { _id: mongoId },
        {
          $set: {
            _id: mongoId,
            store_id: storeId,
            store_name: preview.storeName,
            config_name: finalItemName,
            item_name: finalItemName,
            matched_catalog_id: matchedItem.id,
            regular_price: storeConfig.regular_price,
            sale_price: storeConfig.sale_price,
            is_on_sale: true,
            valid_until: storeConfig.valid_until,
            flipp_url: url,
            url: url,
            upc: itemId,
            synchronized_at: new Date()
          }
        },
        { upsert: true }
      );
    } catch (dbErr: any) {
      console.warn(`[Flipp Ingestion] MongoDB prices update skipped: ${dbErr.message}`);
    }
  }

  // Update Shopping List (groceryItems)
  const existingListItem = groceryItems.find(i => i.name.toLowerCase().trim() === finalItemName.toLowerCase().trim());
  if (existingListItem) {
    existingListItem.quantity += quantity;
  } else {
    const newListItem: any = {
      id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
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
    groceryItems.push(newListItem);
  }

  // Build status message
  let message = "";
  if (isNewItem) {
    message = `Added ${finalItemName} to catalog and shopping list`;
  } else if (priceUpdated) {
    message = `Added ${finalItemName} to shopping list (price updated)`;
  } else {
    message = `Added ${finalItemName} to shopping list`;
  }

  return {
    success: true,
    message,
    catalog,
    groceryItems,
    matchedItemName: finalItemName
  };
}
