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
}

export interface GroceryItem {
  id: string;
  name: string;
  category: string;
  quantity: number;
  unit: string;
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
}

export type PriceData = Record<string, PriceEntry>;

export interface ScrapeStoreItemLink {
  url: string;
  upc: string;
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

