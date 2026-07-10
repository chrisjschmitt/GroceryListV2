import assert from "assert";
import { computeTimeframeSavings } from "../src/lib/purchase-savings";
import { PurchaseLogEntry } from "../src/lib/types";

console.log("=== Running Purchase Savings Unit Tests ===");

function testSparseData() {
  const logs: PurchaseLogEntry[] = [
    {
      id: "log-1",
      timestamp: new Date().toISOString(),
      itemId: "item-1",
      name: "Bananas",
      category: "Produce",
      quantity: 2,
      storeId: "foodbasics",
      storeName: "Food Basics",
      paidPrice: 0.59,
      regularPrice: 0.89, // regular exists and is greater
      wasOnSale: true,
      priceSnapshot: [
        { storeId: "foodbasics", storeName: "Food Basics", activePrice: 0.59, regularPrice: 0.89 },
        { storeId: "metro", storeName: "Metro", activePrice: 0.79, regularPrice: 0.79 },
      ],
    },
    {
      id: "log-2",
      timestamp: new Date().toISOString(),
      itemId: "item-2",
      name: "Milk",
      category: "Dairy",
      quantity: 1,
      storeId: "foodbasics",
      storeName: "Food Basics",
      paidPrice: 4.89,
      regularPrice: 4.89, // paid == regular (no same-store savings)
      wasOnSale: false,
      priceSnapshot: [
        { storeId: "foodbasics", storeName: "Food Basics", activePrice: 4.89, regularPrice: 4.89 },
        { storeId: "metro", storeName: "Metro", activePrice: 4.49, regularPrice: 4.89 }, // metro is cheaper
      ],
    },
    {
      id: "log-3",
      timestamp: new Date().toISOString(),
      itemId: "item-3",
      name: "Unpriced Item",
      category: "Produce",
      quantity: 5,
      storeId: "foodbasics",
      storeName: "Food Basics",
      paidPrice: null, // unpriced
      priceSnapshot: [],
    }
  ];

  const report = computeTimeframeSavings(logs);

  console.log("Report totalSpent:", report.totalSpent);
  console.log("Report vsRegularSavings:", report.vsRegularSavings);
  console.log("Report vsAlternateSavings:", report.vsAlternateSavings);
  console.log("Report missedSavings:", report.missedSavings);
  console.log("Report unpricedLogs count:", report.unpricedLogs.length);

  const normalizeZero = (val: number) => {
    const rounded = Math.round(val * 100) / 100;
    return Object.is(rounded, -0) ? 0 : rounded;
  };

  // Assert spent = (0.59 * 2) + (4.89 * 1) = 1.18 + 4.89 = 6.07
  assert.strictEqual(normalizeZero(report.totalSpent), 6.07);

  // Metric 1: vs regular savings:
  // Item 1: (0.89 - 0.59) * 2 = 0.60
  // Item 2: (4.89 - 4.89) * 1 = 0.00
  // Item 3: Excluded
  // Total: 0.60
  assert.strictEqual(normalizeZero(report.vsRegularSavings), 0.60);
  assert.strictEqual(report.vsRegularCount, 2);

  // Metric 2: vs alternate (cheapest competitor):
  // Item 1: Metro active = 0.79. Savings = (0.79 - 0.59) * 2 = 0.40
  // Item 2: Metro active = 4.49. Savings = (4.49 - 4.89) * 1 = -0.40
  // Total alternate savings = 0.00
  assert.strictEqual(normalizeZero(report.vsAlternateSavings), 0);
  assert.strictEqual(report.vsAlternateCount, 2);

  // Missed Savings:
  // Item 1: Metro = 0.79 (cheaper is Food Basics, so 0 missed)
  // Item 2: Metro = 4.49 (Food Basics = 4.89. Missed = (4.89 - 4.49) * 1 = 0.40)
  // Total missed = 0.40
  assert.strictEqual(normalizeZero(report.missedSavings), 0.40);
  assert.strictEqual(report.missedCount, 2);

  // Metric 3: vs Average:
  // Item 1: [0.59, 0.79] -> avg = 0.69. Savings = (0.69 - 0.59) * 2 = 0.20
  // Item 2: [4.89, 4.49] -> avg = 4.69. Savings = (4.69 - 4.89) * 1 = -0.20
  // Total vsAverage = 0.00
  assert.strictEqual(normalizeZero(report.vsAverageSavings), 0);
  assert.strictEqual(report.vsAverageCount, 2);

  // Metric 4: vs Highest:
  // Item 1: max(0.59, 0.79) = 0.79. Savings = (0.79 - 0.59) * 2 = 0.40
  // Item 2: max(4.89, 4.49) = 4.89. Savings = (4.89 - 4.89) * 1 = 0.00
  // Total vsHighest = 0.40
  assert.strictEqual(normalizeZero(report.vsHighestSavings), 0.40);
  assert.strictEqual(report.vsHighestCount, 2);

  // Unpriced logs: Item 3
  assert.strictEqual(report.unpricedLogs.length, 1);
  assert.strictEqual(report.unpricedLogs[0].name, "Unpriced Item");

  console.log("✅ testSparseData passed!");
}

try {
  testSparseData();
  console.log("\n🎉 ALL PURCHASE SAVINGS TESTS PASSED! 🎉");
} catch (err) {
  console.error("Test execution failed:", err);
  process.exit(1);
}
