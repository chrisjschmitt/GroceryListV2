import { GoogleGenAI, Type } from "@google/genai";
import { RegularItem } from "./types.js";

export interface MatchResult {
  matched_id: string | null;
  confidence: number; // 0 to 100
  unit_match: boolean;
  brand_match: boolean;
  reason: string;
  proposed_new_item?: {
    name: string;
    category: string;
  };
  isFallback?: boolean;
  fallbackReason?: string;
  isApiError?: boolean;
}

let geminiClientCache: GoogleGenAI | null = null;
const matchCache = new Map<string, { result: MatchResult; timestamp: number }>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes cache

// Helper to check if weights or unit mismatch
export function checkMeasurementTypeMismatch(nameA: string, nameB: string): boolean {
  const normA = nameA.toLowerCase();
  const normB = nameB.toLowerCase();

  const isWeightA = normA.includes("bag") || normA.includes(" g") || /\d+g/.test(normA) || normA.includes("oz") || normA.includes("lb") || normA.includes("kg") || normA.includes("pack");
  const isWeightB = normB.includes("bag") || normB.includes(" g") || /\d+g/.test(normB) || normB.includes("oz") || normB.includes("lb") || normB.includes("kg") || normB.includes("pack");

  const isUnitA = normA.includes("each") || normA.includes("unit") || normA.includes("singles") || normA.includes("per unit") || normA.includes("piece");
  const isUnitB = normB.includes("each") || normB.includes("unit") || normB.includes("singles") || normB.includes("per unit") || normB.includes("piece");

  // If one is clearly a weight-based / packet purchase and the other is a singular unit purchase, they mismatch
  if ((isWeightA && isUnitB) || (isUnitA && isWeightB)) {
    return true;
  }
  return false;
}

export function checkExplicitSizeMismatch(nameA: string, nameB: string): boolean {
  const cleanA = nameA.toLowerCase();
  const cleanB = nameB.toLowerCase();

  const extractSizes = (str: string) => {
    const sizes: { value: number; unit: string }[] = [];
    
    // Pattern 1: numbers followed by unit (g, kg, ml, l, lb, oz, pack, roll, pk, pcs, sheets)
    const unitRegex = /(\d+(?:\.\d+)?)\s*(g|kg|ml|l|oz|lb|pack|rolls?|pk|pcs|sheets?|double rolls?)\b/g;
    let match;
    while ((match = unitRegex.exec(str)) !== null) {
      sizes.push({ value: parseFloat(match[1]), unit: match[2].toLowerCase().replace(/s$/, "") });
    }
    
    // Pattern 2: pack notation like "pack of 12"
    const packOfRegex = /pack\s+of\s+(\d+)/g;
    while ((match = packOfRegex.exec(str)) !== null) {
      sizes.push({ value: parseFloat(match[1]), unit: "pack" });
    }

    // Pattern 3: standalone numbers at the end or separated by hyphen/space (like "Eggs - 18", "Eggs - 30")
    const standaloneRegex = /(?:-\s*|\b)(\d+)\b/g;
    while ((match = standaloneRegex.exec(str)) !== null) {
      const val = parseFloat(match[1]);
      if (val >= 2 && val <= 1000 && !sizes.some(s => s.value === val)) {
        sizes.push({ value: val, unit: "count" });
      }
    }
    
    return sizes;
  };

  const sizesA = extractSizes(cleanA);
  const sizesB = extractSizes(cleanB);

  for (const sizeA of sizesA) {
    const normUnitA = ["pack", "pk", "roll", "double roll", "count", "pcs"].includes(sizeA.unit) ? "pack" : sizeA.unit;
    
    for (const sizeB of sizesB) {
      const normUnitB = ["pack", "pk", "roll", "double roll", "count", "pcs"].includes(sizeB.unit) ? "pack" : sizeB.unit;
      
      if (normUnitA === normUnitB && sizeA.value !== sizeB.value) {
        return true; // Explicit size value mismatch!
      }
    }
  }

  return false;
}

export function checkFatPercentageMismatch(nameA: string, nameB: string): boolean {
  const cleanA = nameA.toLowerCase();
  const cleanB = nameB.toLowerCase();

  const getPercent = (str: string) => {
    const match = str.match(/(\d+(?:\.\d+)?)\s*%/);
    if (match) return parseFloat(match[1]);
    
    if (str.includes("skim")) return 0;
    if (str.includes("whole")) return 3.25;
    if (str.includes("homo") || str.includes("homogenized")) return 3.25;
    return null;
  };

  const pctA = getPercent(cleanA);
  const pctB = getPercent(cleanB);

  if (pctA !== null && pctB !== null && pctA !== pctB) {
    return true;
  }
  return false;
}

export function cleanString(s: string): string {
  return s.trim().toLowerCase()
    .replace(/\blactose[- ]free\b/g, "lf")
    .replace(/\bdecaffeinated\b/g, "decaf")
    .replace(/[\s,()\-]+/g, " ");
}

export function isWordMatch(w1: string, w2: string): boolean {
  const norm1 = w1.toLowerCase();
  const norm2 = w2.toLowerCase();
  if (norm1 === norm2) return true;
  
  const stripPlural = (w: string) => {
    if (w.endsWith("ies")) return w.slice(0, -3) + "y";
    if (w.endsWith("es")) return w.slice(0, -2);
    if (w.endsWith("s")) return w.slice(0, -1);
    return w;
  };
  
  return stripPlural(norm1) === stripPlural(norm2);
}

export function isPluralOrSimpleSpacingMatch(nameA: string, nameB: string): boolean {
  const normA = cleanString(nameA);
  const normB = cleanString(nameB);
  
  if (normA === normB) return true;
  
  const wordsA = normA.split(" ").filter(w => w.length > 0);
  const wordsB = normB.split(" ").filter(w => w.length > 0);
  
  if (wordsA.length !== wordsB.length) return false;
  
  for (let i = 0; i < wordsA.length; i++) {
    if (!isWordMatch(wordsA[i], wordsB[i])) {
      return false;
    }
  }
  
  return true;
}

// Programmatic fallback matcher (used when GEMINI_API_KEY is not defined or on network failures)
export function runProgrammaticFallbackMatch(scrapedName: string, catalogItems: RegularItem[]): MatchResult {
  const cleanScraped = cleanString(scrapedName);
  
  // 1. Check exact match
  const exact = catalogItems.find(item => cleanString(item.name) === cleanScraped);
  if (exact) {
    return {
      matched_id: exact.id,
      confidence: 100,
      unit_match: true,
      brand_match: true,
      reason: `Programmatic exact match for "${exact.name}"`
    };
  }

  // 1.5. Check plural or simple spacing match (95% confidence)
  const pluralMatch = catalogItems.find(item => isPluralOrSimpleSpacingMatch(scrapedName, item.name));
  if (pluralMatch) {
    return {
      matched_id: pluralMatch.id,
      confidence: 95,
      unit_match: true,
      brand_match: true,
      reason: `Programmatic plural or simple spacing match for "${pluralMatch.name}"`
    };
  }

  // 2. Perform fuzzy word intersection to score candidates
  let bestItem: RegularItem | null = null;
  let maxScore = 0;
  let bestUnitMatch = true;
  let bestBrandMatch = true;

  const scrapedWords = cleanScraped.split(" ").filter(w => w.length > 0);
  const isWordOfInterest = (w: string) => w.length > 2 || /^\d+%?$/.test(w) || w === "lf";
  const scrapedWordsOfInterest = scrapedWords.filter(isWordOfInterest);

  for (const item of catalogItems) {
    const cleanCatalog = cleanString(item.name);
    const catalogWords = cleanCatalog.split(" ").filter(w => w.length > 0);
    const catalogWordsOfInterest = catalogWords.filter(isWordOfInterest);
    
    if (catalogWordsOfInterest.length === 0) continue;

    // Calculate intersection of words of interest
    const intersection = scrapedWordsOfInterest.filter(w => 
      catalogWordsOfInterest.some(cw => isWordMatch(w, cw))
    );
    
    let score = intersection.length * 10;

    if (score > 0) {
      // Calculate match ratio of catalog words found in scraped name
      const matchedCatalogWords = catalogWordsOfInterest.filter(cw => 
        scrapedWordsOfInterest.some(sw => isWordMatch(cw, sw))
      );
      const matchRatio = matchedCatalogWords.length / catalogWordsOfInterest.length;

      // Apply bonuses for match ratios
      if (matchRatio === 1.0) {
        score += 25; // Boost score when all catalog words are present in scraped name
      } else if (matchRatio >= 0.75) {
        score += 15; // Boost score when most catalog words are present
      }

      // Check weight vs unit mismatch
      const hasUnitMismatch = checkMeasurementTypeMismatch(scrapedName, item.name);
      if (hasUnitMismatch) {
        score -= 15; // penalize
      }

      // Check explicit package size/count mismatch
      const hasSizeMismatch = checkExplicitSizeMismatch(scrapedName, item.name);
      if (hasSizeMismatch) {
        score -= 35; // severe penalty for pack/size mismatch!
      }

      // Check fat percentage mismatch
      const hasPctMismatch = checkFatPercentageMismatch(scrapedName, item.name);
      if (hasPctMismatch) {
        score -= 40; // severe penalty for fat percentage mismatch!
      }

      // Check product specificity keywords mismatch (e.g. crunchy vs smooth, lactose-free vs regular)
      const isCrunchyScraped = cleanScraped.includes("crunchy") || cleanScraped.includes("chunky");
      const isCrunchyCatalog = cleanCatalog.includes("crunchy") || cleanCatalog.includes("chunky");
      if (isCrunchyScraped !== isCrunchyCatalog) {
        score -= 25; // severe penalty
      }

      const isSmoothScraped = cleanScraped.includes("smooth") || cleanScraped.includes("creamy");
      const isSmoothCatalog = cleanCatalog.includes("smooth") || cleanCatalog.includes("creamy");
      if (isSmoothScraped !== isSmoothCatalog) {
        score -= 25; // severe penalty
      }

      const isLfScraped = cleanScraped.includes("lf");
      const isLfCatalog = cleanCatalog.includes("lf");
      if (isLfScraped !== isLfCatalog) {
        score -= 30; // severe penalty
      }

      const isToiletScraped = cleanScraped.includes("toilet") || cleanScraped.includes("bathroom") || cleanScraped.includes("tissue");
      const isToiletCatalog = cleanCatalog.includes("toilet") || cleanCatalog.includes("bathroom") || cleanCatalog.includes("tissue");
      if (isToiletScraped !== isToiletCatalog) {
        score -= 40; // severe penalty
      }

      const isTowelScraped = cleanScraped.includes("towel");
      const isTowelCatalog = cleanCatalog.includes("towel");
      if (isTowelScraped !== isTowelCatalog) {
        score -= 40; // severe penalty
      }

      if (score > maxScore) {
        maxScore = score;
        bestItem = item;
        bestUnitMatch = !hasUnitMismatch;
        // Mock brand match check — if scraped has a common brand not in catalog
        const brands = ["kraft", "dempster", "quaker", "heinz", "mcintosh", "natrel"];
        const scrapedHasBrand = brands.some(b => cleanScraped.includes(b));
        const catalogHasBrand = brands.some(b => cleanCatalog.includes(b));
        bestBrandMatch = !(scrapedHasBrand && !catalogHasBrand);
      }
    }
  }

  // Calculate simulated confidence
  let confidence = Math.min(Math.max(maxScore * 2, 20), 98);
  if (bestItem) {
    // If unit mismatched, clamp confidence to 60 as per rules
    if (!bestUnitMatch) {
      confidence = Math.min(confidence, 60);
    }
    // Brand mismatch is minor, keep confidence fairly high (80-85)
    if (!bestBrandMatch && bestUnitMatch && confidence > 80) {
      confidence = Math.min(confidence, 85);
    }

    if (confidence >= 70) {
      return {
        matched_id: bestItem.id,
        confidence,
        unit_match: bestUnitMatch,
        brand_match: bestBrandMatch,
        reason: `Fuzzy search matching "${bestItem.name}" with confidence ${confidence}% (Brand match: ${bestBrandMatch}, Unit match: ${bestUnitMatch})`
      };
    }
  }

  // 3. No Match Case — suggest a new item format
  // Derive a cleaner name: remove common brands and sizes
  let refinedName = scrapedName
    .replace(/(Kraft|Dempster's|Dempster|Quaker|Heinz|McIntosh|Natrel|Food Basics|Metro|Loblaws|No Frills|FreshCo|Fresh Co|Your Independent Grocer|Your Independent)/gi, "")
    .replace(/\b\d+(g|kg|ml|l|oz|lb|pcs|pack|bag)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  
  if (refinedName.length < 2) refinedName = scrapedName;
  
  // Categorize based on keywords
  let recommendedCategory = "Pantry Staples";
  const normRefined = refinedName.toLowerCase();
  if (normRefined.includes("milk") || normRefined.includes("yogurt") || normRefined.includes("cheese") || normRefined.includes("butter") || normRefined.includes("cream") || normRefined.includes("dairy") || normRefined.includes("eggs")) {
    recommendedCategory = "Dairy & Eggs";
  } else if (normRefined.includes("apple") || normRefined.includes("avocado") || normRefined.includes("lettuce") || normRefined.includes("berries") || normRefined.includes("broccoli") || normRefined.includes("strawberry") || normRefined.includes("fruit") || normRefined.includes("veggie") || normRefined.includes("veg") || normRefined.includes("cucumber") || normRefined.includes("onion") || normRefined.includes("garlic") || normRefined.includes("potato") || normRefined.includes("carrot")) {
    recommendedCategory = "Fresh Produce";
  } else if (normRefined.includes("beef") || normRefined.includes("chicken") || normRefined.includes("turkey") || normRefined.includes("pork") || normRefined.includes("bacon") || normRefined.includes("meat") || normRefined.includes("salmon") || normRefined.includes("shrimp") || normRefined.includes("sausage") || normRefined.includes("lamb")) {
    recommendedCategory = "Meat & Seafood";
  } else if (normRefined.includes("bread") || normRefined.includes("tortilla") || normRefined.includes("bun") || normRefined.includes("bagel") || normRefined.includes("croissant") || normRefined.includes("naan") || normRefined.includes("bakery")) {
    recommendedCategory = "Bakery & Breads";
  } else if (normRefined.includes("coffee") || normRefined.includes("tea") || normRefined.includes("espresso") || normRefined.includes("juice") || normRefined.includes("cider") || normRefined.includes("soda") || normRefined.includes("water") || normRefined.includes("beverage") || normRefined.includes("chips") || normRefined.includes("popcorn") || normRefined.includes("pretzel") || normRefined.includes("cracker") || normRefined.includes("cookie") || normRefined.includes("snack") || normRefined.includes("candy") || normRefined.includes("chocolate") || normRefined.includes("ice cream")) {
    recommendedCategory = "Snacks & Beverages";
  } else if (normRefined.includes("flour") || normRefined.includes("sugar") || normRefined.includes("salt") || normRefined.includes("pepper") || normRefined.includes("spice") || normRefined.includes("baking") || normRefined.includes("almond") || normRefined.includes("cashew") || normRefined.includes("peanut") || normRefined.includes("walnut") || normRefined.includes("pecan") || normRefined.includes("seed")) {
    recommendedCategory = "Baking & Spices";
  } else if (normRefined.includes("deodorant") || normRefined.includes("toothpaste") || normRefined.includes("razor") || normRefined.includes("soap") || normRefined.includes("shampoo") || normRefined.includes("conditioner") || normRefined.includes("gaviscon") || normRefined.includes("niquil") || normRefined.includes("cepacol") || normRefined.includes("med") || normRefined.includes("tylenol") || normRefined.includes("advil") || normRefined.includes("garbage bag") || normRefined.includes("paper towel") || normRefined.includes("napkin") || normRefined.includes("plate") || normRefined.includes("detergent") || normRefined.includes("foil") || normRefined.includes("ziploc")) {
    recommendedCategory = "Health, Personal & Household";
  } else if (normRefined.includes("wine") || normRefined.includes("beer") || normRefined.includes("rum") || normRefined.includes("alcohol")) {
    recommendedCategory = "Beer, Wine & Spirits";
  }

  return {
    matched_id: null,
    confidence: Math.max(confidence, 15),
    unit_match: false,
    brand_match: false,
    reason: "No matching catalog item found with acceptable confidence (<70%). Programmatic analysis generated recommended addition.",
    proposed_new_item: {
      name: refinedName.charAt(0).toUpperCase() + refinedName.slice(1),
      category: recommendedCategory
    }
  };
}

// Post-processes and sanitizes proposed unmatched items to safeguard database/catalog entries
export function sanitizeProposedItem(proposed: { name?: string; category?: string } | undefined): { name: string; category: string } | undefined {
  if (!proposed) return undefined;
  let name = proposed.name || "";
  let category = proposed.category || "";

  // 1. Clean the name
  if (name) {
    // If the model output a whole conversational block, we clean it up.
    // Try to locate quoted strings (single or double quotes) first, which often enclose the clean name
    const quoteMatches = name.match(/['"“‘]([^'"“”‘’.]{3,40})['"”’]/);
    if (quoteMatches && quoteMatches[1] && !/\b(json|correct|block|comment|valid|format|structure|category|staples|below|standard)\b/i.test(quoteMatches[1])) {
      name = quoteMatches[1];
    } else {
      // If it contains sentences or format/meta keywords, let's parse it
      if (name.includes(".") || name.includes(":") || name.length > 45) {
        // Match label patterns like "Name: Canned Diced Tomatoes" or "structure is: Name: No Salt Added Canned Diced Tomatoes"
        const nameLabelMatch = name.match(/(?:Name|Product|structure is: Name):\s*['"“‘]?([^'",.!\n]+)/i);
        if (nameLabelMatch && nameLabelMatch[1]) {
          name = nameLabelMatch[1];
        } else {
          // Take the first short clause that isn't full of formatting meta-words
          const clauses = name.split(/[.,:;!?\n]+/);
          const candidate = clauses.map(c => c.trim()).find(c => c.length > 2 && c.length < 35 && !/\b(json|correct|block|comment|valid|format|structure|category|staples|below|standard|output|comply|requirement|parseable)\b/i.test(c));
          if (candidate) {
            name = candidate;
          }
        }
      }
    }

    // Strip out quotes, backslashes, and other noise
    name = name
      .replace(/["\\']/g, "")
      .replace(/\s+/g, " ")
      .trim();
    
    // Capitalize first letter
    if (name.length > 0) {
      name = name.charAt(0).toUpperCase() + name.slice(1);
    }
  }

  // Fallback if name is empty, too long, or still contains formatting terms
  if (!name || name.length > 50 || /\b(json|parseable|comments|structure|valid|comply|requirement)\b/i.test(name)) {
    name = "Unmatched Item";
  }

  // 2. Normalize and check category
  const allowedCategories = [
    "Fresh Produce",
    "Bakery & Breads",
    "Meat & Seafood",
    "Dairy & Eggs",
    "Pantry Staples",
    "Baking & Spices",
    "Snacks & Beverages",
    "Health, Personal & Household",
    "Beer, Wine & Spirits"
  ];

  let matchedCategory = allowedCategories.find(
    c => c.toLowerCase() === category.trim().toLowerCase()
  );

  if (!matchedCategory) {
    const trimmedCat = category.trim().toLowerCase();
    matchedCategory = allowedCategories.find(c => c.toLowerCase().includes(trimmedCat) || trimmedCat.includes(c.toLowerCase()));
  }

  return {
    name: name,
    category: matchedCategory || "Pantry Staples"
  };
}

// Evaluate match using Gemini 3.5 Flash
export async function evaluateGeminiMatch(scrapedName: string, catalogItems: RegularItem[]): Promise<MatchResult> {
  const cleanScraped = scrapedName.trim().toLowerCase();
  
  // Fast Path 1: Check in-memory Cache to completely prevent duplicate API calls
  const cacheKey = `${cleanScraped}::${catalogItems.map(i => i.id).sort().join(",")}`;
  const cached = matchCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
    return cached.result;
  }

  // Fast Path 2: Exact matching pre-check (100% confidence, 0 API cost)
  const exact = catalogItems.find(item => item.name.trim().toLowerCase() === cleanScraped);
  if (exact) {
    const result: MatchResult = {
      matched_id: exact.id,
      confidence: 100,
      unit_match: true,
      brand_match: true,
      reason: `Programmatic exact match for "${exact.name}"`
    };
    matchCache.set(cacheKey, { result, timestamp: Date.now() });
    return result;
  }

  // Fast Path 3: Plural or simple spacing pre-check (95% confidence, 0 API cost)
  const pluralMatch = catalogItems.find(item => isPluralOrSimpleSpacingMatch(scrapedName, item.name));
  if (pluralMatch) {
    const result: MatchResult = {
      matched_id: pluralMatch.id,
      confidence: 95,
      unit_match: true,
      brand_match: true,
      reason: `Programmatic plural or simple spacing match for "${pluralMatch.name}"`
    };
    matchCache.set(cacheKey, { result, timestamp: Date.now() });
    return result;
  }

  // Fast Path 3.5: Run programmatic fallback matching check. If it yields high confidence (>= 85%), bypass Gemini!
  const progMatch = runProgrammaticFallbackMatch(scrapedName, catalogItems);
  if (progMatch && progMatch.matched_id && progMatch.confidence >= 85) {
    progMatch.isFallback = true;
    progMatch.fallbackReason = `High-confidence programmatic match (${progMatch.confidence}%) bypassing Gemini API call.`;
    matchCache.set(cacheKey, { result: progMatch, timestamp: Date.now() });
    return progMatch;
  }

  // Fast Path 4: Programmatic fuzzy heuristic matching to prune unrelated candidates
  const scrapedWords = cleanScraped.split(/[\s,()\-]+/).filter(w => w.length > 2);
  const scoredCandidates = catalogItems.map(item => {
    const catalogWords = item.name.trim().toLowerCase().split(/[\s,()\-]+/);
    const intersection = scrapedWords.filter(w => catalogWords.some(cw => isWordMatch(w, cw)));
    let score = intersection.length * 10;
    
    // Add similarity score for string occurrences
    if (item.name.toLowerCase().includes(cleanScraped) || cleanScraped.includes(item.name.toLowerCase())) {
      score += 5;
    }
    return { item, score };
  });

  // Filter candidates with non-zero similarity
  const relevantCandidates = scoredCandidates
    .filter(sc => sc.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(sc => sc.item);

  // If catalog is populated and there is literally 0 keywords intersection, we can skip Gemini
  // and run programmatic fallback directly (costs 0 tokens!).
  if (relevantCandidates.length === 0 && catalogItems.length > 3) {
    const fallbackRes = runProgrammaticFallbackMatch(scrapedName, catalogItems);
    fallbackRes.isFallback = true;
    fallbackRes.fallbackReason = "Cost Optimization: No overlapping keyword found in catalog; skipped Gemini call.";
    matchCache.set(cacheKey, { result: fallbackRes, timestamp: Date.now() });
    return fallbackRes;
  }

  // Keep at most 12 candidates to pass to Gemini (major token / context reduction!)
  // If there are no positive scores (and catalog is small), we send the full original catalog.
  const finalCandidates = relevantCandidates.length > 0 
    ? relevantCandidates.slice(0, 12) 
    : catalogItems.slice(0, 12);

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY" || apiKey.trim() === "") {
    const fallbackRes = runProgrammaticFallbackMatch(scrapedName, catalogItems);
    fallbackRes.isFallback = true;
    fallbackRes.fallbackReason = "GEMINI_API_KEY environment variable is not defined or is placeholder.";
    return fallbackRes;
  }

  try {
    if (!geminiClientCache) {
      geminiClientCache = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build"
          }
        }
      });
    }

    const candidatesList = finalCandidates.map(item => ({
      id: item.id,
      name: item.name,
      category: item.category
    }));

    const systemInstruction = `
You are an expert grocery data integration system. Your mission is to match a "scrapedName" (which contains descriptive product texts from a website scrape) against a list of "catalogItems" (the canonical products on a grocery list).

For your match output, determine:
1. "matched_id": The exact "id" of the single item in "catalogItems" that matches. Set to empty string "" if there is no high-quality match.
2. "confidence": A score between 0 and 100 indicating match quality, adhering to these rules:
   - WEIGHT VS UNIT MEASUREMENT (WEIGHT-UNIT MISMATCH): Check if one product is measured by weight/size (e.g., avocados sold in a bag, 3lb, 454g) and the other is a single unit/piece (e.g., Avocado Each, Single Avocado, unit). If there is a unit style mismatch, PENALIZE the confidence severely, clamping it to a MAX of 60%.
   - PACKAGE SIZE / QUANTITY MISMATCH (MAJOR PENALTY): Check if the package sizes or quantities are explicitly different (e.g., "12-pack" vs "3-pack", "12 double rolls" vs "3 rolls", "450g" vs "227g", "Eggs - 30" vs "Eggs - 18"). If they are explicitly different sizes or counts, PENALIZE the confidence severely, clamping it to a MAX of 45% or set "matched_id" to "".
   - TOILET PAPER VS PAPER TOWELS (CRITICAL RULE): Toilet paper (or bathroom tissue/tissue) is NOT paper towels. They are completely different products. They must NEVER match. If one is toilet paper/tissue and the other is paper towels, you must set "matched_id" to "" and confidence to 0%.
   - BRAND SUBSTITUTION & TOLERANCE: Brand changes are minor conflicts. For example, Kraft Brand Crunchy Peanut Butter is a high-confidence substitute for No Name Crunchy Peanut Butter as long as critical product features (like crunchy peanut butter) are identical. Under this rule, do NOT penalize with more than a 15% deduction (keep confidence at a solid 80%-85%).
   - PRODUCT SPECIFICITY (MAJOR PENALTY): Critical attributes are non-negotiable. Mismatches such as crunchy vs smooth peanut butter, regular milk vs lactose-free milk, cottage cheese vs sour cream, fat-free vs whole fat constitute severe conflicts. These matches must be rejected (confidence < 45% or set "matched_id" to "").
   - MILK FAT PERCENTAGE MISMATCH (MAJOR PENALTY): Milk fat percentages (e.g., 1%, 2%, 3.25%, skim, homogenized, whole) are non-negotiable. 1% milk must NEVER match 2% milk or 3.25% milk. If fat percentages are explicitly different, you must reject the match (confidence < 45% or set "matched_id" to "").
   - EXACT SPELLING MATCH: If lowercase exact text matches, confidence is 100%. Plurals or simple spacing (e.g. Avocado vs Avocados) should be 95%.
3. "unit_match": True if measurement modes (weight vs unit) are compatible, false if one is weight and the other is single unit/piece.
4. "brand_match": True if the brands match or are both generic/unspecified, false if different brands.
5. "reason": A brief 1-sentence analytical explanation of your choice.
6. "proposed_new_item": If confidence is below 70% (no high-quality match), populate this object. Crucially, the "name" and "category" fields must NEVER contain conversational commentary, code block tags, markdown formatting, explanations, or JSON formatting instructions.
   - "name": A simplified, reader-friendly canonical item name derived from the scraped name (remove store codes, brand noise, and packaging size, e.g. "Dempster's Whole Wheat sliced bread 675g" becomes "Whole Wheat Bread"). It must be a short clean product name only (e.g., "No Salt Added Canned Diced Tomatoes").
   - "category": The best food category match. Choose ONLY from standard sections: "Fresh Produce", "Bakery & Breads", "Meat & Seafood", "Dairy & Eggs", "Pantry Staples", "Baking & Spices", "Snacks & Beverages", "Health, Personal & Household", "Beer, Wine & Spirits".

Return strict JSON conforming to the response schema.
`;

    const userPrompt = `
Scraped Item name: "${scrapedName}"

Candidate Catalog Items:
${JSON.stringify(candidatesList, null, 2)}
`;

    const response = await geminiClientCache.models.generateContent({
      model: "gemini-3.5-flash",
      contents: userPrompt,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          required: ["matched_id", "confidence", "unit_match", "brand_match", "reason"],
          properties: {
            matched_id: {
              type: Type.STRING,
              description: "The id of the matching catalog item, or an empty string if no quality match gets >= 70%."
            },
            confidence: {
              type: Type.INTEGER,
              description: "Determined confidence level from 0 to 100."
            },
            unit_match: {
              type: Type.BOOLEAN,
              description: "Whether the pricing unit type matches (no weight vs unit mismatch)."
            },
            brand_match: {
              type: Type.BOOLEAN,
              description: "Whether the product brands match."
            },
            reason: {
              type: Type.STRING,
              description: "Sentence explaining the matching logic and rule application."
            },
            proposed_new_item: {
              type: Type.OBJECT,
              required: ["name", "category"],
              properties: {
                name: {
                  type: Type.STRING,
                  description: "Streamlined canonical item name proposed (e.g., 'No Salt Added Canned Diced Tomatoes'). MUST be a simple short product name only, with absolutely NO comments, explanations, formatting notes, or conversational text."
                },
                category: {
                  type: Type.STRING,
                  description: "Suggested grocery category. Choose ONLY from: 'Fresh Produce', 'Bakery & Breads', 'Meat & Seafood', 'Dairy & Eggs', 'Pantry Staples', 'Baking & Spices', 'Snacks & Beverages', 'Health, Personal & Household', 'Beer, Wine & Spirits'."
                }
              }
            }
          }
        }
      }
    });

    const text = response.text || "";
    const parsed = JSON.parse(text);

    const result: MatchResult = {
      matched_id: parsed.matched_id || null,
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0,
      unit_match: !!parsed.unit_match,
      brand_match: !!parsed.brand_match,
      reason: parsed.reason || "",
      proposed_new_item: parsed.proposed_new_item 
        ? sanitizeProposedItem(parsed.proposed_new_item) 
        : undefined,
      isFallback: false
    };

    // Store in cache
    matchCache.set(cacheKey, { result, timestamp: Date.now() });
    return result;

  } catch (error: any) {
    console.error("Gemini Flash match API call failed, calling programmatic fallback:", error);
    const fallbackRes = runProgrammaticFallbackMatch(scrapedName, catalogItems);
    fallbackRes.isFallback = true;
    fallbackRes.isApiError = true;
    fallbackRes.fallbackReason = error?.message || String(error);
    return fallbackRes;
  }
}

// Test cases list for test coverage verifying weight/units, brands and specific substitutions
export interface MatchTestCase {
  id: string;
  scrapedName: string;
  catalogItems: RegularItem[];
  expectedCondition: (res: MatchResult) => boolean;
  expectedDescription: string;
}

export const TEST_CASES: MatchTestCase[] = [
  {
    id: "exact_spelling",
    scrapedName: "Broccoli",
    catalogItems: [
      { id: "1", name: "Broccoli", category: "Produce", selected: false },
      { id: "2", name: "Butter unsalted", category: "Dairy & Eggs", selected: false }
    ],
    expectedDescription: "Exact spelling match",
    expectedCondition: (res) => res.matched_id === "1" && res.confidence === 100
  },
  {
    id: "plural_singular",
    scrapedName: "Avocado Each",
    catalogItems: [
      { id: "10", name: "Avocados Each", category: "Produce", selected: false },
      { id: "11", name: "Orange Juice", category: "Beverages", selected: false }
    ],
    expectedDescription: "Singular / plurals under unit count",
    expectedCondition: (res) => res.matched_id === "10" && res.confidence >= 90
  },
  {
    id: "weight_unit_mismatch",
    scrapedName: "Avocado Bag 3lb",
    catalogItems: [
      { id: "20", name: "Avocado Each", category: "Produce", selected: false }
    ],
    expectedDescription: "Weight sizing vs singular Unit packaging size penalty",
    expectedCondition: (res) => res.confidence <= 60 && !res.unit_match
  },
  {
    id: "brand_substitution",
    scrapedName: "Kraft crunchy peanut butter 500g",
    catalogItems: [
      { id: "30", name: "Skippy crunchy peanut butter 500g", category: "Pantry", selected: false }
    ],
    expectedDescription: "Brand substitution minor penalty (accepts substitution, high confidence)",
    expectedCondition: (res) => res.matched_id === "30" && res.confidence >= 75 && res.confidence <= 90 && !res.brand_match
  },
  {
    id: "product_specificity_crunchy_smooth_mismatch",
    scrapedName: "Kraft smooth peanut butter 500g",
    catalogItems: [
      { id: "40", name: "Kraft crunchy peanut butter 500g", category: "Pantry", selected: false }
    ],
    expectedDescription: "Specific property (smooth vs crunchy) mismatch major penalty",
    expectedCondition: (res) => (res.matched_id !== "40" || res.confidence < 50)
  },
  {
    id: "product_specificity_lactose_free_mismatch",
    scrapedName: "Natrel Lactose Free Milk 1% 2L",
    catalogItems: [
      { id: "50", name: "Regular Milk 1% 2L", category: "Dairy & Eggs", selected: false }
    ],
    expectedDescription: "Lactose-Free milk vs Regular milk mismatch major penalty",
    expectedCondition: (res) => (res.matched_id !== "50" || res.confidence < 50)
  },
  {
    id: "toilet_vs_towels",
    scrapedName: "toilet paper",
    catalogItems: [
      { id: "80", name: "2-ply paper towels - 3-pack", category: "Health, Personal & Household", selected: false }
    ],
    expectedDescription: "Toilet paper vs Paper towels mismatch (critical boundary)",
    expectedCondition: (res) => res.matched_id !== "80" || res.confidence < 45
  },
  {
    id: "pack_count_mismatch",
    scrapedName: "2-ply paper towels - 12-pack",
    catalogItems: [
      { id: "80", name: "2-ply paper towels - 3-pack", category: "Health, Personal & Household", selected: false }
    ],
    expectedDescription: "Pack count / size mismatch (3-pack vs 12-pack)",
    expectedCondition: (res) => res.matched_id !== "80" || res.confidence < 50
  },
  {
    id: "absolutely_no_match",
    scrapedName: "Chicken Thighs Bone-In Skin-On",
    catalogItems: [
      { id: "60", name: "Canned Tuna", category: "Pantry", selected: false },
      { id: "61", name: "White Bread", category: "Bakery", selected: false }
    ],
    expectedDescription: "Unmatched scenario with smart item recommendations",
    expectedCondition: (res) => res.matched_id === null && !!res.proposed_new_item && res.proposed_new_item.category === "Meat & Seafood"
  }
];

// Runs all test cases and returns comprehensive coverage report
export async function runAllMatchingTests(): Promise<{
  total: number;
  passed: number;
  failed: number;
  results: Array<{
    caseId: string;
    description: string;
    scrapedName: string;
    matchedId: string | null;
    confidence: number;
    unitMatch: boolean;
    brandMatch: boolean;
    reason: string;
    passed: boolean;
    proposedName?: string;
    proposedCategory?: string;
  }>;
}> {
  let passed = 0;
  const results = [];

  for (const tc of TEST_CASES) {
    try {
      const matchRes = await evaluateGeminiMatch(tc.scrapedName, tc.catalogItems);
      const isPassed = tc.expectedCondition(matchRes);
      if (isPassed) passed++;

      results.push({
        caseId: tc.id,
        description: tc.expectedDescription,
        scrapedName: tc.scrapedName,
        matchedId: matchRes.matched_id,
        confidence: matchRes.confidence,
        unitMatch: matchRes.unit_match,
        brandMatch: matchRes.brand_match,
        reason: matchRes.reason,
        passed: isPassed,
        proposedName: matchRes.proposed_new_item?.name,
        proposedCategory: matchRes.proposed_new_item?.category
      });
    } catch (err: any) {
      results.push({
        caseId: tc.id,
        description: tc.expectedDescription,
        scrapedName: tc.scrapedName,
        matchedId: null,
        confidence: 0,
        unitMatch: false,
        brandMatch: false,
        reason: `Runner exception: ${err?.message || String(err)}`,
        passed: false
      });
    }
  }

  return {
    total: TEST_CASES.length,
    passed,
    failed: TEST_CASES.length - passed,
    results
  };
}

export async function splitMultiProductDescription(rawItemName: string): Promise<string[]> {
  const lower = rawItemName.toLowerCase();
  
  // Quick pre-check: only invoke Gemini if there are likely multiple items separated by conjunctions.
  const containsConjunction = lower.includes(" or ") || lower.includes(" and ") || lower.includes(",") || lower.includes("/");
  if (!containsConjunction) {
    return [rawItemName];
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY" || apiKey.trim() === "") {
    return fallbackRegexSplit(rawItemName);
  }

  try {
    if (!geminiClientCache) {
      geminiClientCache = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build"
          }
        }
      });
    }

    const systemInstruction = `
You are a grocery catalog parsing specialist.
Your task is to analyze a raw grocery flyer description (which might contain multiple distinct products offered as alternatives under the same flyer item) and split it into an array of individual, fully-expanded, clean product names.

Rules:
1. Expansion: If the items share a shared prefix or suffix brand/category descriptor, you MUST expand each name fully so it stands alone.
   Examples:
   - "KAWARTHA OR SHAW'S ICE CREAM" -> ["Kawartha Ice Cream", "Shaw's Ice Cream"]
   - "NATREL ORGANIC FINE-FILTERED OR LACTANTIA LACTOSE FREE MILK" -> ["Natrel Organic Fine-Filtered Milk", "Lactantia Lactose Free Milk"]
   - "KRAFT SALAD DRESSING, DIANA OR BULL'S EYE BBQ SAUCE" -> ["Kraft Salad Dressing", "Diana BBQ Sauce", "Bull's Eye BBQ Sauce"]
   - "COCA-COLA OR PEPSI SOFT DRINKS" -> ["Coca-Cola Soft Drinks", "Pepsi Soft Drinks"]
   - "LACTANTIA PURFILTRE MILK, LACTOSE FREE CREAM" -> ["Lactantia Purfiltre Milk", "Lactantia Lactose Free Cream"]
2. If the string contains only ONE single product description, return an array with that single string.
3. Clean the text: Strip N/A pricing tags, parenthetical codes, or raw flyer layout jargon.
4. Output Format: Return a JSON array of strings.
`;

    const response = await geminiClientCache.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `description: "${rawItemName}"`
            }
          ]
        }
      ],
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.STRING
          },
          description: "An array of fully-qualified individual product name strings."
        }
      }
    });

    const text = response.text || "";
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed.map(n => n.trim());
    }
  } catch (err) {
    console.error("[Gemini Split] Error splitting product:", err);
  }

  return fallbackRegexSplit(rawItemName);
}

function fallbackRegexSplit(rawItemName: string): string[] {
  const parts = rawItemName.split(/\s+or\s+/i);
  if (parts.length > 1) {
    return parts.map(p => p.trim());
  }
  return [rawItemName];
}

