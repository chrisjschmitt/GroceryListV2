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

export function standardizeCategory(catName: string): string {
  if (!catName) return "Pantry Staples";
  
  const trimmedLower = catName.trim().toLowerCase();

  // Primary Exact matched mappings
  if (trimmedLower === "fresh produce" || trimmedLower === "produce" || trimmedLower === "fruits" || trimmedLower === "vegetables") {
    return "Fresh Produce";
  }
  if (trimmedLower === "bakery & breads" || trimmedLower === "bakery" || trimmedLower === "breads" || trimmedLower === "bread") {
    return "Bakery & Breads";
  }
  if (trimmedLower === "meat & seafood" || trimmedLower === "meat" || trimmedLower === "seafood") {
    return "Meat & Seafood";
  }
  if (trimmedLower === "dairy & eggs" || trimmedLower === "dairy" || trimmedLower === "eggs") {
    return "Dairy & Eggs";
  }
  if (trimmedLower === "pantry staples" || trimmedLower === "pantry & dry goods" || trimmedLower === "groceries" || trimmedLower === "grocery" || trimmedLower === "other") {
    return "Pantry Staples";
  }
  if (trimmedLower === "baking & spices" || trimmedLower === "baking, nuts & spices" || trimmedLower === "baking" || trimmedLower === "spices") {
    return "Baking & Spices";
  }
  if (
    trimmedLower === "snacks & beverages" ||
    trimmedLower === "beverages" ||
    trimmedLower === "snacks" ||
    trimmedLower === "snacks & candy" ||
    trimmedLower === "candy" ||
    trimmedLower === "frozen foods" ||
    trimmedLower === "frozen"
  ) {
    return "Snacks & Beverages";
  }
  if (
    trimmedLower === "health, personal & household" ||
    trimmedLower === "household" ||
    trimmedLower === "cleaning" ||
    trimmedLower === "household & cleaning" ||
    trimmedLower === "personal care" ||
    trimmedLower === "personal care & toiletries" ||
    trimmedLower === "toiletries" ||
    trimmedLower === "health & pharmacy" ||
    trimmedLower === "pharmacy" ||
    trimmedLower === "health"
  ) {
    return "Health, Personal & Household";
  }
  if (trimmedLower === "beer, wine & spirits" || trimmedLower === "beer" || trimmedLower === "wine" || trimmedLower === "spirits" || trimmedLower === "alcohol") {
    return "Beer, Wine & Spirits";
  }

  // Fallback mappings based on keywords
  if (trimmedLower.includes("produce") || trimmedLower.includes("fruit") || trimmedLower.includes("veg")) {
    return "Fresh Produce";
  }
  if (trimmedLower.includes("bakery") || trimmedLower.includes("bread")) {
    return "Bakery & Breads";
  }
  if (trimmedLower.includes("meat") || trimmedLower.includes("seafood") || trimmedLower.includes("fish") || trimmedLower.includes("chicken")) {
    return "Meat & Seafood";
  }
  if (trimmedLower.includes("dairy") || trimmedLower.includes("egg") || trimmedLower.includes("milk") || trimmedLower.includes("cheese")) {
    return "Dairy & Eggs";
  }
  if (trimmedLower.includes("baking") || trimmedLower.includes("spice")) {
    return "Baking & Spices";
  }
  if (trimmedLower.includes("beverage") || trimmedLower.includes("drink") || trimmedLower.includes("snack") || trimmedLower.includes("candy") || trimmedLower.includes("frozen")) {
    return "Snacks & Beverages";
  }
  if (trimmedLower.includes("household") || trimmedLower.includes("clean") || trimmedLower.includes("personal") || trimmedLower.includes("health") || trimmedLower.includes("pharmacy")) {
    return "Health, Personal & Household";
  }
  if (trimmedLower.includes("beer") || trimmedLower.includes("wine") || trimmedLower.includes("liquor") || trimmedLower.includes("alcohol")) {
    return "Beer, Wine & Spirits";
  }

  return "Pantry Staples";
}
