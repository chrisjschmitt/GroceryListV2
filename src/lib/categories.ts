export const CATEGORY_ORDER = [
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

export function getCategoryOrderIndex(catName: string): number {
  const idx = CATEGORY_ORDER.indexOf(catName);
  return idx === -1 ? 999 : idx;
}
