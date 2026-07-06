import { normalizeStoreKey } from "./price-utils.js";
import type { ScrapeStoreConfig } from "./types.js";

/**
 * Resolves the postal code for Flipp flyer lookups by matching the storeName
 * against configured stores in the combined catalog.
 * 
 * Match order:
 * 1. Direct key match in catalogStores
 * 2. Scan key/store_name matches in catalogStores
 * 3. Client postal code fallback
 * 4. Global default (K7H3C6)
 */
export function resolveStorePostalCode(
  storeName: string | null | undefined,
  clientPostal: string | null | undefined,
  catalogStores: Record<string, ScrapeStoreConfig> | null | undefined
): string {
  const defaultPostal = "K7H3C6";
  const cleanClientPostal = clientPostal ? clientPostal.trim().toUpperCase().replace(/\s/g, "") : null;
  
  if (!storeName) {
    return cleanClientPostal || defaultPostal;
  }

  const normalizedQuery = normalizeStoreKey(storeName);

  if (catalogStores && typeof catalogStores === "object") {
    // 1. Direct key match (e.g. catalogStores["freshco"])
    if (catalogStores[normalizedQuery] && catalogStores[normalizedQuery].postal_code) {
      const p = catalogStores[normalizedQuery].postal_code.trim().toUpperCase().replace(/\s/g, "");
      if (p) return p;
    }

    // 2. Scan keys/store_names
    for (const [key, config] of Object.entries(catalogStores)) {
      if (!config) continue;
      const normalizedKey = normalizeStoreKey(key);
      const normalizedName = normalizeStoreKey(config.store_name);

      if ((normalizedKey === normalizedQuery || normalizedName === normalizedQuery) && config.postal_code) {
        const p = config.postal_code.trim().toUpperCase().replace(/\s/g, "");
        if (p) return p;
      }
    }
  }

  // 3. Fallback to client postal code or default K7H3C6
  return cleanClientPostal || defaultPostal;
}
