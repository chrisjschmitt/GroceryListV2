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

export function inferCategoryFromItemName(name: string): string {
  if (!name) return standardizeCategory("");
  const lower = name.trim().toLowerCase();

  let category = "";

  // Beer, Wine & Spirits
  if (
    /\b(beer|wine|spirits|alcohol|liquor|whiskey|vodka|rum|gin|tequila|cider|ale|lager|ipa)s?\b/i.test(lower)
  ) {
    category = "Beer, Wine & Spirits";
  }
  // Health, Personal & Household
  else if (
    /paper towel|toilet paper|napkin|tissue|detergent|soap|shampoo|conditioner|body wash|toothpaste|toothbrush|floss|deodorant|razor|shaving|lotion|medicine|advil|tylenol|aspirin|vitamin|supplement|band-aid|bandage|trash bag|garbage bag|foil|plastic wrap|ziploc|sponge|scrubber|cleaner|disinfectant|wipe|diaper|baby|\bpet\b|\bdog\b|\bcat\b/i.test(lower)
  ) {
    category = "Health, Personal & Household";
  }
  // Snacks & Beverages
  else if (
    /water|soda|\bpop\b|juice|\bdrink\b|beverage|\btea\b|coffee|chips|pretzel|cracker|popcorn|nuts|peanut|almond|cashew|pistachio|candy|chocolate|gummy|cookie|\bbar\b|granola bar|energy drink|coke|pepsi|sprite|frozen|ice cream|sorbet|popsicle/i.test(lower)
  ) {
    category = "Snacks & Beverages";
  }
  // Bakery & Breads
  else if (
    /bread|loaf|\bbun\b|\broll\b|bagel|croissant|muffin|tortilla|wrap|pita|naan|pastry|danish|baguette|bakery|toast/i.test(lower)
  ) {
    category = "Bakery & Breads";
  }
  // Meat & Seafood
  else if (
    /meat|seafood|chicken|poultry|turkey|beef|steak|pork|\bham\b|bacon|sausage|hot dog|ribs|salmon|tuna|shrimp|prawn|crab|lobster|\bfish\b|\bcod\b|haddock|halibut|scallop|veal|lamb|mutton/i.test(lower)
  ) {
    category = "Meat & Seafood";
  }
  // Dairy & Eggs
  else if (
    /milk|\begg\b|butter|cheese|cheddar|mozzarella|parmesan|yogurt|cream|sour cream|cottage cheese|cream cheese|margarine|dairy|creamer|half & half|half and half/i.test(lower)
  ) {
    category = "Dairy & Eggs";
  }
  // Baking & Spices
  else if (
    /flour|sugar|yeast|baking powder|baking soda|vanilla|cocoa|chocolate chip|spice|cinnamon|nutmeg|oregano|paprika|salt|extract|syrup|honey|cornstarch/i.test(lower)
  ) {
    category = "Baking & Spices";
  }
  // Fresh Produce
  else if (
    /banana|apple|grape|orange|lemon|lime|berry|strawberry|blueberry|raspberry|blackberry|melon|watermelon|cantaloupe|pear|peach|plum|avocado|tomato|potato|onion|garlic|ginger|lettuce|spinach|kale|salad|carrot|broccoli|cauliflower|cucumber|pepper|celery|asparagus|zucchini|squash|mushroom|cabbage|herb|cilantro|parsley|basil|mint|thyme|rosemary|produce|fruit|vegetable/i.test(lower)
  ) {
    category = "Fresh Produce";
  }

  return standardizeCategory(category);
}
