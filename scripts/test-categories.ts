import { inferCategoryFromItemName } from "../src/lib/categories";

console.log("=== Running Category Inference Unit Tests ===");

function assertEqual(actual: string, expected: string, itemName: string) {
  if (actual === expected) {
    console.log(`✅ "${itemName}" -> "${expected}"`);
  } else {
    console.error(`❌ FAIL: "${itemName}" -> expected "${expected}", got "${actual}"`);
    process.exit(1);
  }
}

try {
  assertEqual(inferCategoryFromItemName("organic bananas"), "Fresh Produce", "organic bananas");
  assertEqual(inferCategoryFromItemName("red apples"), "Fresh Produce", "red apples");
  assertEqual(inferCategoryFromItemName("romaine lettuce"), "Fresh Produce", "romaine lettuce");
  
  assertEqual(inferCategoryFromItemName("sliced whole wheat bread"), "Bakery & Breads", "sliced whole wheat bread");
  assertEqual(inferCategoryFromItemName("bagels"), "Bakery & Breads", "bagels");
  
  assertEqual(inferCategoryFromItemName("boneless chicken breast"), "Meat & Seafood", "boneless chicken breast");
  assertEqual(inferCategoryFromItemName("ribeye steak"), "Meat & Seafood", "ribeye steak");
  
  assertEqual(inferCategoryFromItemName("2% milk"), "Dairy & Eggs", "2% milk");
  assertEqual(inferCategoryFromItemName("cheddar cheese block"), "Dairy & Eggs", "cheddar cheese block");
  
  assertEqual(inferCategoryFromItemName("baking powder"), "Baking & Spices", "baking powder");
  assertEqual(inferCategoryFromItemName("sea salt"), "Baking & Spices", "sea salt");
  
  assertEqual(inferCategoryFromItemName("potato chips"), "Snacks & Beverages", "potato chips");
  assertEqual(inferCategoryFromItemName("ground coffee"), "Snacks & Beverages", "ground coffee");
  
  assertEqual(inferCategoryFromItemName("craft beer six pack"), "Beer, Wine & Spirits", "craft beer six pack");
  assertEqual(inferCategoryFromItemName("red wine"), "Beer, Wine & Spirits", "red wine");
  
  assertEqual(inferCategoryFromItemName("toilet paper rolls"), "Health, Personal & Household", "toilet paper rolls");
  assertEqual(inferCategoryFromItemName("dish detergent"), "Health, Personal & Household", "dish detergent");
  
  assertEqual(inferCategoryFromItemName("random unknown product name"), "Pantry Staples", "random unknown product name");
  assertEqual(inferCategoryFromItemName(""), "Pantry Staples", "empty string");

  console.log("\n🎉 ALL CATEGORY TESTS PASSED SUCCESSFULLY! 🎉");
} catch (err) {
  console.error("Test execution failed:", err);
  process.exit(1);
}
