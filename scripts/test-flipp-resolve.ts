import assert from "assert";
import {
  sanitizeFlippItemName,
  buildFlippSearchQueryVariants,
  merchantNamesMatch,
  isDirectFlippUrlUsable,
  buildFlippSearchPageUrl
} from "../src/lib/flipp-resolve";

async function runTests() {
  console.log("=== Running Flipp Resolve Unit Tests ===");

  // 1. sanitizeFlippItemName Tests
  console.log("\nTesting sanitizeFlippItemName...");
  
  // Count ranges (asserting stripped tokens rather than exact string leftovers)
  assert.ok(!sanitizeFlippItemName("Banana 5-6").includes("5-6"));
  assert.ok(!sanitizeFlippItemName("Lentils #5").includes("#5"));
  assert.ok(!sanitizeFlippItemName("Kiwi 5 - 6 pack").includes("5 - 6"));
  
  // Units/weights/percentages
  assert.strictEqual(sanitizeFlippItemName("Lactantia Milk 1.5l"), "Lactantia Milk");
  assert.strictEqual(sanitizeFlippItemName("Cream 500ml"), "Cream");
  assert.strictEqual(sanitizeFlippItemName("Butter 454g"), "Butter");
  assert.strictEqual(sanitizeFlippItemName("Natrel 2%"), "Natrel");
  assert.strictEqual(sanitizeFlippItemName("Loblaws Butter 1lb"), "Loblaws Butter");
  assert.strictEqual(sanitizeFlippItemName("Eggs 12-pack"), "Eggs");
  assert.strictEqual(sanitizeFlippItemName("Yogurt 4x100g"), "Yogurt");

  // Noise words & trailing stuff
  assert.strictEqual(sanitizeFlippItemName("Lactantia Lactose Free Milk (Organic)"), "Lactantia Lactose Free Milk");
  assert.strictEqual(sanitizeFlippItemName("Green Lentils - Metro"), "Green Lentils");
  assert.strictEqual(sanitizeFlippItemName("Red Grapes - Seedless"), "Red Grapes");

  console.log("✅ sanitizeFlippItemName tests passed.");

  // 2. buildFlippSearchQueryVariants Tests
  console.log("\nTesting buildFlippSearchQueryVariants...");
  const variants = buildFlippSearchQueryVariants("Metro", "Banana 5-6");
  assert.deepStrictEqual(variants, ["Metro Banana"]);
  
  const variantsWithConfig = buildFlippSearchQueryVariants("Metro", "Banana 5-6", "Organic Bananas");
  assert.deepStrictEqual(variantsWithConfig, ["Metro Organic Bananas", "Metro Banana", "Metro Bananas"]);
  console.log("✅ buildFlippSearchQueryVariants tests passed.");

  // 3. merchantNamesMatch Tests
  console.log("\nTesting merchantNamesMatch...");
  assert.strictEqual(merchantNamesMatch("Metro Ontario", "metro"), true);
  assert.strictEqual(merchantNamesMatch("Food Basics", "foodbasics"), true);
  assert.strictEqual(merchantNamesMatch("Metro Perth", "metro"), true);
  assert.strictEqual(merchantNamesMatch("Sobeys", "metro"), false);
  console.log("✅ merchantNamesMatch tests passed.");

  // 4. isDirectFlippUrlUsable Tests
  console.log("\nTesting isDirectFlippUrlUsable...");
  
  // Future date (non-expired)
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + 5);
  const futureStr = futureDate.toISOString().split("T")[0];
  assert.strictEqual(isDirectFlippUrlUsable("https://flipp.com/flyer/123?item_id=456", futureStr), true);
  
  // Past date (expired)
  const pastDate = new Date();
  pastDate.setDate(pastDate.getDate() - 2);
  const pastStr = pastDate.toISOString().split("T")[0];
  assert.strictEqual(isDirectFlippUrlUsable("https://flipp.com/flyer/123?item_id=456", pastStr), false);

  // Missing properties
  assert.strictEqual(isDirectFlippUrlUsable("", futureStr), false);
  assert.strictEqual(isDirectFlippUrlUsable(undefined, futureStr), false);
  assert.strictEqual(isDirectFlippUrlUsable("https://flipp.com/flyer/123", undefined), true); // URL exists but no expiry date, so assume usable
  
  console.log("✅ isDirectFlippUrlUsable tests passed.");

  // 5. buildFlippSearchPageUrl Tests
  console.log("\nTesting buildFlippSearchPageUrl...");
  const searchUrl = buildFlippSearchPageUrl("Metro", "Banana 5-6", undefined, "K7H3C6");
  assert.ok(searchUrl.includes("flipp.com/search"));
  assert.ok(searchUrl.includes("q=Metro%20Banana"));
  assert.ok(searchUrl.includes("postal_code=K7H3C6"));
  console.log("✅ buildFlippSearchPageUrl tests passed.");

  console.log("\n🎉 ALL TESTS PASSED SUCCESSFULLY! 🎉");
}

runTests().catch(err => {
  console.error("❌ Test run failed:", err);
  process.exit(1);
});
