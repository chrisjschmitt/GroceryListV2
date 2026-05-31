import { RegularItem } from "./types";
import { blobGetRegularItems, blobSetRegularItems } from "./blob-store";

export async function getRegularItems(): Promise<RegularItem[]> {
  return blobGetRegularItems();
}

export async function setRegularItems(items: RegularItem[]): Promise<void> {
  await blobSetRegularItems(items);
}

export async function addRegularItems(items: RegularItem[]): Promise<RegularItem[]> {
  const existing = await blobGetRegularItems();
  const merged = [...existing, ...items];
  await blobSetRegularItems(merged);
  return merged;
}

export async function toggleRegularItem(id: string): Promise<RegularItem | null> {
  const items = await blobGetRegularItems();
  const item = items.find((i) => i.id === id);
  if (!item) return null;

  item.selected = !item.selected;
  await blobSetRegularItems(items);

  return { ...item };
}

export async function clearRegularItems(): Promise<void> {
  await blobSetRegularItems([]);
}

export async function getSelectedItems(): Promise<RegularItem[]> {
  const items = await blobGetRegularItems();
  return items.filter((i) => i.selected);
}

export async function deselectAll(): Promise<void> {
  const items = await blobGetRegularItems();
  items.forEach((i) => { i.selected = false; });
  await blobSetRegularItems(items);
}
