import { mergeLists } from "../src/lib/list-merge";
import { Tombstone } from "../src/lib/types";

interface TestItem {
  id: string;
  name: string;
  category: string;
  quantity: number;
  unit: string;
  checked: boolean;
  updatedAt?: number;
}

console.log("=== Running Per-Item LWW Sync Merge Unit Tests ===");

const now = Date.now();

// 1. Concurrent adds of different IDs
function testConcurrentAddsDifferentIds() {
  console.log("Testing Concurrent adds of different IDs...");

  const localItems: TestItem[] = [
    { id: "item-1", name: "Milk", category: "Dairy", quantity: 1, unit: "bag", checked: false, updatedAt: now },
  ];
  const remoteItems: TestItem[] = [
    { id: "item-2", name: "Bread", category: "Bakery", quantity: 2, unit: "loaf", checked: false, updatedAt: now },
  ];

  const result = mergeLists(localItems, [], remoteItems, []);

  if (result.mergedItems.length !== 2) {
    throw new Error(`Expected 2 items, got ${result.mergedItems.length}`);
  }
  if (result.ambiguities.length !== 0) {
    throw new Error(`Expected 0 ambiguities, got ${result.ambiguities.length}`);
  }

  console.log("✅ testConcurrentAddsDifferentIds passed!");
}

// 2. Delete LWW
function testDeleteLww() {
  console.log("Testing Delete LWW (older item deleted by newer tombstone)...");

  const localItems: TestItem[] = [
    { id: "item-1", name: "Milk", category: "Dairy", quantity: 1, unit: "bag", checked: false, updatedAt: now - 1000 },
  ];
  const remoteTombstones: Tombstone[] = [
    { id: "item-1", deletedAt: now, deletedBy: "Device B" },
  ];

  const result = mergeLists(localItems, [], [], remoteTombstones);

  if (result.mergedItems.length !== 0) {
    throw new Error(`Expected 0 items, got ${result.mergedItems.length}`);
  }
  if (result.mergedTombstones.length !== 1) {
    throw new Error(`Expected 1 tombstone, got ${result.mergedTombstones.length}`);
  }
  if (result.ambiguities.length !== 0) {
    throw new Error(`Expected 0 ambiguities, got ${result.ambiguities.length}`);
  }

  console.log("✅ testDeleteLww passed!");
}

// 3. Delete LWW Override
function testDeleteLwwOverride() {
  console.log("Testing Delete LWW Override (newer item revives older tombstone)...");

  const localTombstones: Tombstone[] = [
    { id: "item-1", deletedAt: now - 1000, deletedBy: "Device A" },
  ];
  const remoteItems: TestItem[] = [
    { id: "item-1", name: "Milk", category: "Dairy", quantity: 2, unit: "bag", checked: false, updatedAt: now },
  ];

  const result = mergeLists([], localTombstones, remoteItems, []);

  if (result.mergedItems.length !== 1) {
    throw new Error(`Expected 1 item, got ${result.mergedItems.length}`);
  }
  if (result.mergedTombstones.length !== 0) {
    throw new Error(`Expected 0 tombstones, got ${result.mergedTombstones.length}`);
  }
  if (result.ambiguities.length !== 0) {
    throw new Error(`Expected 0 ambiguities, got ${result.ambiguities.length}`);
  }

  console.log("✅ testDeleteLwwOverride passed!");
}

// 4. Tied edit conflict
function testTiedEditConflict() {
  console.log("Testing Tied edit conflict (tied timestamps with differing meaningful fields)...");

  const localItems: TestItem[] = [
    { id: "item-1", name: "Milk", category: "Dairy", quantity: 1, unit: "bag", checked: false, updatedAt: now },
  ];
  const remoteItems: TestItem[] = [
    { id: "item-1", name: "Milk", category: "Dairy", quantity: 3, unit: "bag", checked: false, updatedAt: now }, // quantity differs
  ];

  const result = mergeLists(localItems, [], remoteItems, []);

  if (result.ambiguities.length !== 1) {
    throw new Error(`Expected 1 ambiguity, got ${result.ambiguities.length}`);
  }
  if (result.ambiguities[0].reason !== "tied-conflict") {
    throw new Error(`Expected tied-conflict reason, got ${result.ambiguities[0].reason}`);
  }

  console.log("✅ testTiedEditConflict passed!");
}

// 4b. null vs undefined units should NOT be a tied conflict
function testNullUndefinedUnitsNotAmbiguity() {
  console.log("Testing null vs undefined units are not meaningfully different...");

  const localItems: TestItem[] = [
    { id: "item-1", name: "Milk", category: "Dairy", quantity: 1, unit: "bag", checked: false, updatedAt: now },
  ];
  const remoteItems: any[] = [
    { id: "item-1", name: "Milk", category: "Dairy", quantity: 1, unit: "bag", checked: false, updatedAt: now, units: null },
  ];

  const result = mergeLists(localItems, [], remoteItems as TestItem[], []);

  if (result.ambiguities.length !== 0) {
    throw new Error(`Expected 0 ambiguities for null/undefined units, got ${result.ambiguities.length}`);
  }

  console.log("✅ testNullUndefinedUnitsNotAmbiguity passed!");
}

// 4c. Regular catalog rows with no timestamps must not flood ambiguity UI
function testRegularCatalogLegacyNoAmbiguity() {
  console.log("Testing regular catalog selected false vs missing at updatedAt 0...");

  const localItems = Array.from({ length: 50 }, (_, i) => ({
    id: `r-${i}`,
    name: `Item ${i}`,
    category: "Other",
    selected: false,
  }));
  const remoteItems = Array.from({ length: 50 }, (_, i) => ({
    id: `r-${i}`,
    name: `Item ${i}`,
    category: "Other",
    // selected omitted — catalog shape
  }));

  const result = mergeLists(localItems as any, [], remoteItems as any, [], true);

  if (result.ambiguities.length !== 0) {
    throw new Error(`Expected 0 ambiguities for legacy regular catalog merge, got ${result.ambiguities.length}`);
  }
  if (result.mergedItems.length !== 50) {
    throw new Error(`Expected 50 merged items, got ${result.mergedItems.length}`);
  }

  console.log("✅ testRegularCatalogLegacyNoAmbiguity passed!");
}

// 4d. Preserve local selected=true when merging legacy regular catalog rows
function testRegularCatalogPreservesLocalSelected() {
  console.log("Testing local selected=true preserved on legacy regular merge...");

  const localItems = [
    { id: "r-1", name: "Milk", category: "Dairy", selected: true },
  ];
  const remoteItems = [
    { id: "r-1", name: "Milk", category: "Dairy", unit: "unit" },
  ];

  const result = mergeLists(localItems as any, [], remoteItems as any, [], true);
  if (result.ambiguities.length !== 0) {
    throw new Error(`Expected 0 ambiguities, got ${result.ambiguities.length}`);
  }
  if ((result.mergedItems[0] as any).selected !== true) {
    throw new Error(`Expected selected=true to be preserved`);
  }
  if ((result.mergedItems[0] as any).unit !== "unit") {
    throw new Error(`Expected remote catalog fields to be kept`);
  }

  console.log("✅ testRegularCatalogPreservesLocalSelected passed!");
}

// 5. 90-day pruning
function testTombstonePruning() {
  console.log("Testing 90-day pruning of tombstones...");

  const oldTombstone: Tombstone = {
    id: "item-old",
    deletedAt: now - 95 * 24 * 60 * 60 * 1000, // 95 days old
  };
  const newTombstone: Tombstone = {
    id: "item-new",
    deletedAt: now - 5 * 24 * 60 * 60 * 1000, // 5 days old
  };

  const result = mergeLists([], [oldTombstone, newTombstone], [], []);

  if (result.mergedTombstones.length !== 1) {
    throw new Error(`Expected 1 tombstone, got ${result.mergedTombstones.length}`);
  }
  if (result.mergedTombstones[0].id !== "item-new") {
    throw new Error(`Expected item-new to survive, got ${result.mergedTombstones[0].id}`);
  }

  console.log("✅ testTombstonePruning passed!");
}

// Execute
try {
  testConcurrentAddsDifferentIds();
  testDeleteLww();
  testDeleteLwwOverride();
  testTiedEditConflict();
  testNullUndefinedUnitsNotAmbiguity();
  testRegularCatalogLegacyNoAmbiguity();
  testRegularCatalogPreservesLocalSelected();
  testTombstonePruning();
  console.log("\n🎉 ALL SYNC MERGE TESTS PASSED SUCCESSFULLY! 🎉\n");
} catch (error) {
  console.error("\n❌ TEST FAILURE:\n", error);
  process.exit(1);
}
