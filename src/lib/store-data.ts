import { Store, StorePrice } from "./types";

export const LOCAL_STORES: Store[] = [
  { id: "store-1", name: "FreshMart", location: "123 Main St" },
  { id: "store-2", name: "BudgetGrocer", location: "456 Oak Ave" },
  { id: "store-3", name: "OrganicPlace", location: "789 Elm Dr" },
  { id: "store-4", name: "MegaSave", location: "321 Pine Rd" },
];

const PRICE_DATABASE: Record<string, Record<string, { price: number; onSale: boolean }>> = {
  "store-1": {
    milk: { price: 3.99, onSale: false },
    bread: { price: 2.49, onSale: true },
    eggs: { price: 4.29, onSale: false },
    butter: { price: 4.99, onSale: false },
    cheese: { price: 5.49, onSale: true },
    chicken: { price: 7.99, onSale: false },
    rice: { price: 3.29, onSale: false },
    pasta: { price: 1.79, onSale: false },
    tomatoes: { price: 2.99, onSale: false },
    apples: { price: 3.49, onSale: true },
    bananas: { price: 0.69, onSale: false },
    onions: { price: 1.29, onSale: false },
    potatoes: { price: 4.49, onSale: false },
    yogurt: { price: 5.99, onSale: false },
    cereal: { price: 4.29, onSale: true },
  },
  "store-2": {
    milk: { price: 3.49, onSale: true },
    bread: { price: 2.79, onSale: false },
    eggs: { price: 3.89, onSale: false },
    butter: { price: 4.49, onSale: true },
    cheese: { price: 5.99, onSale: false },
    chicken: { price: 6.99, onSale: true },
    rice: { price: 2.99, onSale: false },
    pasta: { price: 1.49, onSale: true },
    tomatoes: { price: 3.29, onSale: false },
    apples: { price: 3.99, onSale: false },
    bananas: { price: 0.59, onSale: true },
    onions: { price: 1.49, onSale: false },
    potatoes: { price: 3.99, onSale: true },
    yogurt: { price: 5.49, onSale: false },
    cereal: { price: 3.99, onSale: false },
  },
  "store-3": {
    milk: { price: 5.49, onSale: false },
    bread: { price: 3.99, onSale: false },
    eggs: { price: 5.99, onSale: false },
    butter: { price: 6.49, onSale: false },
    cheese: { price: 7.29, onSale: false },
    chicken: { price: 10.99, onSale: false },
    rice: { price: 4.99, onSale: false },
    pasta: { price: 2.99, onSale: false },
    tomatoes: { price: 3.99, onSale: true },
    apples: { price: 2.99, onSale: false },
    bananas: { price: 0.89, onSale: false },
    onions: { price: 1.99, onSale: false },
    potatoes: { price: 5.49, onSale: false },
    yogurt: { price: 6.99, onSale: true },
    cereal: { price: 5.49, onSale: false },
  },
  "store-4": {
    milk: { price: 2.99, onSale: false },
    bread: { price: 1.99, onSale: false },
    eggs: { price: 3.49, onSale: true },
    butter: { price: 3.99, onSale: false },
    cheese: { price: 4.99, onSale: false },
    chicken: { price: 5.99, onSale: false },
    rice: { price: 2.49, onSale: true },
    pasta: { price: 0.99, onSale: false },
    tomatoes: { price: 2.49, onSale: false },
    apples: { price: 3.29, onSale: false },
    bananas: { price: 0.49, onSale: false },
    onions: { price: 0.99, onSale: false },
    potatoes: { price: 3.49, onSale: false },
    yogurt: { price: 4.99, onSale: false },
    cereal: { price: 3.49, onSale: false },
  },
};

export function lookupPrices(itemName: string): StorePrice[] {
  const normalized = itemName.toLowerCase().trim();

  return LOCAL_STORES.map((store) => {
    const storeData = PRICE_DATABASE[store.id];
    const match = storeData?.[normalized];

    if (match) {
      return {
        storeId: store.id,
        storeName: store.name,
        price: match.price,
        onSale: match.onSale,
      };
    }

    const fuzzyKey = Object.keys(storeData || {}).find(
      (key) => normalized.includes(key) || key.includes(normalized)
    );

    if (fuzzyKey && storeData) {
      return {
        storeId: store.id,
        storeName: store.name,
        price: storeData[fuzzyKey].price,
        onSale: storeData[fuzzyKey].onSale,
      };
    }

    return null;
  }).filter((p): p is StorePrice => p !== null);
}

export function findBestPrice(prices: StorePrice[]): StorePrice | undefined {
  if (prices.length === 0) return undefined;
  return prices.reduce((best, current) =>
    current.price < best.price ? current : best
  );
}
