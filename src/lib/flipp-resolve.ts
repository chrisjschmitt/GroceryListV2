import { normalizeStoreKey, getStoreDisplayName, isSaleExpired } from "./price-utils.js";
import { resolveStorePostalCode } from "./flipp-postal.js";
import type { ScrapeStoreConfig } from "./types.js";

export function normalizeFlippMerchantName(storeIdOrName: string): string {
  return getStoreDisplayName(storeIdOrName);
}

export function merchantNamesMatch(merchantName: string, targetStoreIdOrName: string): boolean {
  if (!merchantName || !targetStoreIdOrName) return false;
  return normalizeStoreKey(merchantName) === normalizeStoreKey(targetStoreIdOrName);
}

export function sanitizeFlippItemName(raw: string): string {
  if (!raw) return "";
  let clean = raw.replace(/lactancia/gi, "Lactantia");

  // Strip count ranges like "5-6" or "10-12"
  clean = clean.replace(/\b\d+\s*-\s*\d+\b/g, "");

  // Strip "#5" or "#1"
  clean = clean.replace(/#\d+\b/g, "");

  // Strip sizes and units: g, l, ml, oz, kg, lb, lbs, pack, pk, pks
  clean = clean.replace(/\s*\b\d+(?:\.\d+)?-?(?:g|l|ml|oz|kg|lb|lbs|pack|pk|pks|s)\b/gi, "");

  // Strip size multipliers like 4x100g, 12x355ml
  clean = clean.replace(/\s*\b\d+\s*x\s*\d+(?:\.\d+)?-?(?:g|l|ml|oz|kg|lb|lbs|pack|pk|pks|s)?\b/gi, "");

  // Strip percentages
  clean = clean.replace(/\s*\b\d+(?:\.\d+)?%/g, "");

  // Strip content in parentheses: (12 count), (pack of 4), etc.
  clean = clean.replace(/\s*\([^)]*\)/gi, "");

  // Strip trailing dash followed by number or word
  clean = clean.replace(/\s*-\s*\d+$/gi, "");
  clean = clean.replace(/\s*-\s*\w+$/gi, "");

  // Clean up punctuation and multiple spaces
  clean = clean.replace(/[^a-zA-Z0-9\s'/.-]/g, "");
  clean = clean.replace(/\s+/g, " ").trim();

  return clean;
}

export function buildFlippSearchQueryVariants(
  storeName: string,
  itemName: string,
  configName?: string,
  scrapedName?: string
): string[] {
  const variants: string[] = [];
  const addVariant = (query: string) => {
    const q = query.trim().replace(/\s+/g, " ");
    if (q && !variants.includes(q)) {
      variants.push(q);
    }
  };

  const cleanScraped = scrapedName ? sanitizeFlippItemName(scrapedName) : "";
  const cleanConfig = configName ? sanitizeFlippItemName(configName) : "";
  const cleanItem = sanitizeFlippItemName(itemName);

  const primaryName = cleanScraped || cleanConfig || cleanItem;
  if (primaryName) addVariant(primaryName);

  if (cleanConfig) addVariant(cleanConfig);
  if (cleanItem) addVariant(cleanItem);

  // Simplified Descriptors: Strip common descriptors
  const stripDescriptors = (name: string): string => {
    return name
      .replace(/\b(unsalted|salted|salted\/unsalted|organic|original|sweet|fresh|frozen|large|small|sliced|whole)\b/gi, "")
      .replace(/\s+/g, " ")
      .trim();
  };

  const simplifiedPrimary = stripDescriptors(primaryName);
  if (simplifiedPrimary) addVariant(simplifiedPrimary);

  const simplifiedItem = stripDescriptors(cleanItem);
  if (simplifiedItem) addVariant(simplifiedItem);

  // Last 1-2 tokens
  const getTokens = (name: string) => {
    return name.split(/\s+/).filter(t => t.length > 0);
  };

  const tokens = getTokens(primaryName);
  if (tokens.length >= 2) {
    addVariant(tokens.slice(-2).join(" "));
  }
  if (tokens.length >= 1) {
    addVariant(tokens[tokens.length - 1]);
  }

  const itemTokens = getTokens(cleanItem);
  if (itemTokens.length >= 2) {
    addVariant(itemTokens.slice(-2).join(" "));
  }
  if (itemTokens.length >= 1) {
    addVariant(itemTokens[itemTokens.length - 1]);
  }

  // Prepend canonical store name
  const canonicalStoreName = getStoreDisplayName(storeName);
  const finalQueries = variants.map(v => `${canonicalStoreName} ${v}`.trim());
  return finalQueries;
}

export function scoreFlippItem(flippName: string, originalName: string): number {
  const f = flippName.toLowerCase();
  const o = originalName.toLowerCase();

  let score = 0;

  // Exact phrase match boosts
  const phrases = [
    "lactose free milk",
    "lactose free",
    "lactose-free",
    "lactose free cream",
    "organic milk",
    "purfiltre milk",
    "green lentils",
    "lentils",
    "banana",
    "bananas"
  ];
  phrases.forEach(phrase => {
    if (o.includes(phrase) && f.includes(phrase)) {
      score += 40;
    }
  });

  // Split original name into words for keyword matching
  const words = o.split(/\s+/).filter(w => w.length > 1 && !w.includes("%"));
  words.forEach(w => {
    if (f.includes(w)) {
      score += 10;
      if (["lactantia", "natrel", "milk", "cream", "butter", "lentils", "lentil", "banana", "bananas"].includes(w)) {
        score += 15;
      }
    }
  });

  // Conflicting product checks (e.g. original is milk, but flipp is cream or butter)
  if (o.includes("milk") && f.includes("cream") && !o.includes("cream") && !f.includes("milk")) {
    score -= 60;
  }
  if (o.includes("milk") && f.includes("butter") && !o.includes("butter")) {
    score -= 60;
  }
  if (o.includes("cream") && f.includes("butter") && !o.includes("butter")) {
    score -= 60;
  }

  // Percentage match (e.g. 1%, 2%, 3.25%, skim, chocolate)
  const percentages = ["1%", "2%", "3.25%", "3.8%", "skim", "chocolate"];
  percentages.forEach(p => {
    const oHas = o.includes(p);
    const fHas = f.includes(p);
    if (oHas && fHas) {
      score += 60; // Direct match boost
    } else if (!oHas && fHas) {
      score -= 40; // Mismatch penalty
    }
  });

  return score;
}

export function buildFlippSearchPageUrl(
  storeName: string,
  itemName: string,
  configName?: string,
  postalCode?: string
): string {
  const cleanItem = sanitizeFlippItemName(configName || itemName);
  const canonicalStoreName = getStoreDisplayName(storeName);
  const query = `${canonicalStoreName} ${cleanItem}`.trim();
  const resolvedPostal = postalCode ? postalCode.trim().toUpperCase().replace(/\s/g, "") : "K7H3C6";
  return `https://flipp.com/search?q=${encodeURIComponent(query)}&postal_code=${encodeURIComponent(resolvedPostal)}`;
}

export function buildFlippItemPageUrl(
  itemId: string | number,
  merchantName: string,
  postalCode?: string
): string {
  const displayName = getStoreDisplayName(merchantName) || merchantName;
  const slug = displayName
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
  const postal = postalCode ? postalCode.trim().toUpperCase().replace(/\s/g, "") : "K7H3C6";
  return `https://flipp.com/en-ca/item/${itemId}-${slug}-weekly-ad?postal_code=${postal}`;
}

export function isDirectFlippUrlUsable(flippUrl?: string | null, validUntil?: string | null): boolean {
  if (!flippUrl) return false;
  const isFlipp = flippUrl.includes("flipp.com") || flippUrl.includes("wishabi");
  if (!isFlipp) return false;
  if (validUntil && isSaleExpired(validUntil)) return false;
  return true;
}

export interface ResolveFlippParams {
  storeName?: string;
  storeId?: string;
  itemName: string;
  configName?: string;
  scrapedName?: string;
  postalCode?: string;
  catalogStores?: Record<string, ScrapeStoreConfig> | null;
}

export interface ResolveFlippResult {
  url: string;
  isMatch: boolean;
  resolvedPostal: string;
  queryUsed: string;
  stage: number;
}

export async function resolveFlippFlyerUrl(params: ResolveFlippParams): Promise<ResolveFlippResult> {
  const { storeName, storeId, itemName, configName, scrapedName, postalCode, catalogStores } = params;

  // Track canonical store key & display name
  const effectiveStoreId = storeId ? normalizeStoreKey(storeId) : (storeName ? normalizeStoreKey(storeName) : "foodbasics");
  const effectiveStoreName = getStoreDisplayName(effectiveStoreId);

  // Resolve target postal code
  const resolvedPostal = resolveStorePostalCode(effectiveStoreId, postalCode, catalogStores);

  // Generate progressive search query variants
  const queries = buildFlippSearchQueryVariants(effectiveStoreName, itemName, configName, scrapedName);

  // Try each query variant
  for (let i = 0; i < queries.length; i++) {
    const query = queries[i];
    const flippApiUrl = `https://backflipp.wishabi.com/flipp/items/search?locale=en-ca&postal_code=${encodeURIComponent(resolvedPostal)}&q=${encodeURIComponent(query)}`;

    try {
      const response = await fetch(flippApiUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
      });

      if (response.ok) {
        const data = await response.json();
        const items = data.items || [];

        // Filter using merchantNamesMatch
        const matchedItems = items.filter((it: any) =>
          merchantNamesMatch(it.merchant_name || "", effectiveStoreId)
        );

        if (matchedItems.length > 0) {
          const targetOriginalName = configName || itemName;
          matchedItems.sort((a: any, b: any) => {
            const scoreA = scoreFlippItem(a.name || "", targetOriginalName);
            const scoreB = scoreFlippItem(b.name || "", targetOriginalName);
            return scoreB - scoreA;
          });

          const bestItem = matchedItems[0];
          let url = "";
          if (bestItem.id) {
            url = buildFlippItemPageUrl(bestItem.id, bestItem.merchant_name || effectiveStoreName, resolvedPostal);
          }

          if (url) {
            return {
              url,
              isMatch: true,
              resolvedPostal,
              queryUsed: query,
              stage: 1
            };
          }
        }
      }
    } catch (err) {
      console.error(`Error querying Flipp API for "${query}":`, err);
    }
  }

  return {
    url: "",
    isMatch: false,
    resolvedPostal,
    queryUsed: "",
    stage: 0
  };
}
