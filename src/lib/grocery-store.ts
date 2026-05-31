import { GroceryItem } from "./types";
import { lookupPrices, findBestPrice } from "./store-data";
import { blobGetGroceryItems, blobSetGroceryItems } from "./blob-store";

export async function getItems(): Promise<GroceryItem[]> {
  return blobGetGroceryItems();
}

export async function addItem(name: string, quantity: number, unit: string, category?: string): Promise<GroceryItem> {
  const prices = lookupPrices(name);
  const bestPrice = findBestPrice(prices);

  const item: GroceryItem = {
    id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    name,
    category: category || "Other",
    quantity,
    unit,
    checked: false,
    prices,
    bestPrice,
    createdAt: new Date().toISOString(),
  };

  const items = await blobGetGroceryItems();
  items.push(item);
  await blobSetGroceryItems(items);

  return item;
}

export async function toggleItem(id: string): Promise<GroceryItem | null> {
  const items = await blobGetGroceryItems();
  const item = items.find((i) => i.id === id);
  if (!item) return null;

  item.checked = !item.checked;
  await blobSetGroceryItems(items);

  return { ...item };
}

export async function removeItem(id: string): Promise<boolean> {
  const items = await blobGetGroceryItems();
  const index = items.findIndex((i) => i.id === id);
  if (index === -1) return false;

  items.splice(index, 1);
  await blobSetGroceryItems(items);

  return true;
}

export async function clearChecked(): Promise<number> {
  const items = await blobGetGroceryItems();
  const before = items.length;
  const remaining = items.filter((i) => !i.checked);
  await blobSetGroceryItems(remaining);

  return before - remaining.length;
}
