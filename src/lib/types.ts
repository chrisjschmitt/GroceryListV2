export interface Store {
  id: string;
  name: string;
  location: string;
}

export interface StorePrice {
  storeId: string;
  storeName: string;
  price: number;
  onSale: boolean;
  lookup_url?: string;
  valid_until?: string;
  brand_name?: string;
}

export interface GroceryItem {
  id: string;
  name: string;
  category: string;
  quantity: number;
  unit: string;
  units?: number;
  checked: boolean;
  prices: StorePrice[];
  bestPrice?: StorePrice;
  createdAt: string;
}

export interface GroceryList {
  items: GroceryItem[];
}

export interface RegularItem {
  id: string;
  category: string;
  name: string;
  selected: boolean;
  unit?: string;
  units?: number;
  stores?: Record<string, any>;
}

export interface StoreInfo {
  store_name: string;
  postal_code: string;
  store_id: string;
  regular_price: number | null;
  sale_price: number | null;
  is_on_sale: number;
  lookup_url?: string;
  valid_until?: string;
  track_pricing?: number | boolean;
  external_name?: string;
  brand_name?: string;
}

export interface PriceEntry {
  item_name: string;
  config_name: string;
  store_name: string;
  postal_code: string;
  store_id: string;
  regular_price: number | null;
  sale_price: number | null;
  is_on_sale: number;
  last_updated: string;
  lookup_url?: string;
  valid_until?: string;
  track_pricing?: number | boolean;
  external_name?: string;
  brand_name?: string;
  stores?: Record<string, StoreInfo>;
}

export type PriceData = Record<string, PriceEntry>;

export interface ScrapeStoreItemLink {
  url: string;
  upc: string;
  track_pricing?: boolean;
  external_name?: string;
}

export interface ScrapeItemConfig {
  name: string;
  stores: Record<string, ScrapeStoreItemLink>;
}

export interface ScrapeStoreConfig {
  enabled: boolean;
  store_name: string;
  base_url: string;
  postal_code: string;
  store_id: string;
}

export type ScrapeConfig = {
  stores: Record<string, ScrapeStoreConfig>;
  items: ScrapeItemConfig[];
};

export interface CombinedStoreLink {
  url: string;
  upc: string;
  regular_price: number | null;
  sale_price: number | null;
  is_on_sale: number;
  valid_until?: string;
  track_pricing?: boolean;
  external_name?: string;
  is_verified?: boolean;
  flipp_url?: string;
  in_flyer?: number;
}

export interface CombinedCatalogItem {
  id: string;
  name: string;
  category: string;
  unit: string;
  units?: number;
  requires_scraping: boolean;
  parent_id?: string;
  stores: Record<string, CombinedStoreLink>;
  last_updated?: string;
}

export interface CombinedCatalog {
  stores: Record<string, ScrapeStoreConfig>;
  items: CombinedCatalogItem[];
}

export interface SyncMetadata {
  lastSavedBy: string;
  lastSavedTime: number;
}


export interface TelemetryEntry {
  timestamp: string;
  store_key?: string;
  upc?: string;
  item_config_name?: string;
  error_phase?: string;
  error_message?: string;
  severity?: "success" | "warning" | "error" | "info";
  message?: string;
}

export interface PurchaseLogEntry {
  id: string; // unique id (log-[timestamp]-[random])
  timestamp: string; // ISO string
  itemId: string; // matched catalog item ID or UPC
  name: string; // product name
  category: string; // product category
  quantity: number; // quantity purchased
  unit?: string;
  units?: number;
  storeId?: string; // purchased store ID
  storeName?: string; // purchased store name
  price?: number; // active price at purchase
}


