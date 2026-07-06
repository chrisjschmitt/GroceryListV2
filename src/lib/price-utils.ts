import { StoreInfo } from "./types";

export function parsePrice(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const num = typeof value === "number" ? value : parseFloat(String(value).trim());
  if (isNaN(num) || num <= 0) return null;
  return num;
}

export function isOnSaleFlag(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (value === 0 || value === "0" || value === false || value === "false") return false;
  return !!value;
}

export function isSaleExpired(validUntil?: string | null): boolean {
  if (!validUntil) return false;
  const trimmed = validUntil.trim();
  if (!trimmed) return false;

  const expiryDate = new Date(trimmed);
  if (isNaN(expiryDate.getTime())) return false;

  const now = new Date();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [y, m, d] = trimmed.split("-").map(Number);
    const targetDate = new Date(y, m - 1, d, 23, 59, 59, 999);
    return now > targetDate;
  }
  return now > expiryDate;
}

export function isSaleActive(validUntil?: string | null): boolean {
  return !isSaleExpired(validUntil);
}

export function normalizeStoreKey(storeId: string): string {
  if (!storeId) return "foodbasics";
  const lower = String(storeId).toLowerCase().trim();
  if (lower.includes("metro")) return "metro";
  if (lower.includes("loblaws")) return "loblaws";
  if (lower.includes("nofrills")) return "nofrills";
  if (
    lower.includes("freshco") ||
    lower.includes("freschco") ||
    lower.includes("fresco") ||
    lower.includes("fresh co")
  ) {
    return "freshco";
  }
  if (lower.includes("yourindependentgrocer")) return "yourindependentgrocer";
  if (
    lower === "7923194" ||
    lower.includes("foodbasics") ||
    lower.includes("food basics")
  ) {
    return "foodbasics";
  }
  if (lower.includes("walmart")) return "walmart";
  if (lower.includes("costco")) return "costco";
  if (lower.includes("canadiantire")) return "canadiantire";
  return lower;
}

export const STORE_DISPLAY_NAMES: Record<string, string> = {
  foodbasics: "Food Basics",
  metro: "Metro",
  freshco: "FreshCo",
  loblaws: "Loblaws",
  nofrills: "No Frills",
  yourindependentgrocer: "Your Independent Grocer",
  walmart: "Walmart",
  costco: "Costco",
  canadiantire: "Canadian Tire",
};

export function getStoreDisplayName(storeId: string): string {
  const normKey = normalizeStoreKey(storeId);
  return STORE_DISPLAY_NAMES[normKey] ?? normKey;
}

export function getStoreActivePrice(
  storeInfo: StoreInfo | Record<string, unknown> | null | undefined
): number | null {
  if (!storeInfo) return null;
  const info = storeInfo as any;

  const regPrice = parsePrice(info.regular_price);
  const salePrice = parsePrice(info.sale_price);

  const saleActive = isOnSaleFlag(info.is_on_sale) && 
                     salePrice !== null && 
                     !isSaleExpired(info.valid_until);

  if (saleActive && salePrice !== null) {
    return salePrice;
  }

  if (regPrice !== null) {
    if (salePrice !== null && regPrice === salePrice) {
      return null;
    }
    return regPrice;
  }

  return null;
}
