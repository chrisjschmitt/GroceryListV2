# Implementation Plan - Per-Item LWW Merge & Deletion Tombstones (Revised)

This plan outlines the design and implementation to replace the whole-list last-write-wins synchronization with a per-item Last-Write-Wins (LWW) merge model using delete tombstones, incorporating all required amendments.

## User Review Required

> [!IMPORTANT]
> - **Retiring Stale 409 Lock for List Merges:** Server-side LWW merges will no longer trigger 409 Conflict status codes on stale baselines for grocery/regular syncs. The server will always load the latest database state, merge, and persist. Stale 409 locking is preserved exclusively for purchase-log-only pushes.
> - **Retiring Whole-List Conflict UI:** The primary SyncIndicator conflict banner is retired for list syncing. Instead, the UI will display a `SyncAmbiguityResolver` panel ONLY when true tied conflicts (same ID, identical timestamps, different fields) occur.
> - **Incremental Merge Execution:** Client-side merges apply non-ambiguous merges immediately to local IndexedDB and React states, preserving only the conflicting records in memory for user resolution.
> - **Automatic Automated Tests:** We will implement an automated test suite [test-list-merge.ts](file:///Users/christopherschmitt/Library/Mobile%20Documents/com~apple%20CloudDocs/GroceryHub/Code/GroceryListV2/scripts/test-list-merge.ts) covering the six merge scenarios.
> - We will suggest package version `2.14.0` when shipping, but will hold the version bump until after your approval.

---

## Required Data Model & Migration

### 1. Item Model Extensions
Extend `GroceryItem` and `RegularItem` in [types.ts](file:///Users/christopherschmitt/Library/Mobile%20Documents/com~apple%20CloudDocs/GroceryHub/Code/GroceryListV2/src/lib/types.ts):
- `updatedAt: number` (epoch ms, bumped on every local user mutation)
- `updatedBy?: string` (device name, resolved via `getDeviceName()`)

### 2. Deletion Tombstones
Store delete markers persistently in client-side IndexedDB (new objectStores `"groceryTombstones"` and `"regularTombstones"`) and server-side collections (`grocery_tombstones` and `regular_tombstones` / fallback files):
```typescript
export interface Tombstone {
  id: string;
  deletedAt: number;
  deletedBy?: string;
}
```

### 3. Migration Strategy
For old/existing items missing `updatedAt`:
- Parse `Date.parse(item.createdAt)` if present, else fallback to `0` (so first real user edit wins cleanly).

### 4. Bulk Actions Tombstone Requirement
Actions that delete multiple records must generate and store a tombstone for **every single removed ID** to prevent resurrection:
- `clearCheckedGroceryItems` (write tombstone for all checked IDs)
- `clearAllGroceryItems` (write tombstone for all active IDs)
- `clearRegularItems` (write tombstone for all active IDs)

---

## Pure Merge Algorithm

A new utility file [list-merge.ts](file:///Users/christopherschmitt/Library/Mobile%20Documents/com~apple%20CloudDocs/GroceryHub/Code/GroceryListV2/src/lib/list-merge.ts) will house a pure merge function:

```typescript
export interface AmbiguityConflict<T> {
  id: string;
  local: T | null;
  remote: T | null;
  localTombstone: Tombstone | null;
  remoteTombstone: Tombstone | null;
  reason: "tied-conflict" | "tied-delete-update";
}

export interface MergeResult<T> {
  mergedItems: T[];
  mergedTombstones: Tombstone[];
  ambiguities: AmbiguityConflict<T>[];
}
```

### Conflict Definitions & Field Rules
An ambiguity is ONLY registered when:
- **Tied edits:** Same ID is live on both sides, timestamps are tied, and meaningful fields differ:
  - Meaningful grocery fields: `name`, `category`, `quantity`, `unit`, `units`, `checked`.
  - Meaningful regular fields: `name`, `category`, `selected`.
- **Tied delete-update:** `updatedAt` of the item is exactly equal to `deletedAt` of the tombstone.

All other cases auto-merge silently (e.g. concurrent adds with different IDs, LWW timestamp winner). Tombstones are pruned if `deletedAt` is older than **90 days**.

---

## Sync API & Server Changes

### 1. `GET /api/sync`
Returns `{ groceryItems, regularItems, groceryTombstones, regularTombstones, syncMeta, prices, purchaseLogs }`.

### 2. `PUT /api/sync`
- Accepts payload containing list items + tombstones.
- **Optimistic Locking Bypass:** If the payload contains `groceryItems` or `regularItems`, bypass the stale baseline 409 status code. Load the current database state, run `mergeLists`, and save the merged result using Mongo upserts and deletes (preventing Naive blind replacements).
- Returns `200` with the merged items/tombstones and any remaining `ambiguities`.

### 3. File Fallbacks
Implement `blobGetGroceryTombstones()`, `blobSetGroceryTombstones(list)` etc. in [db-store.ts](file:///Users/christopherschmitt/Library/Mobile%20Documents/com~apple%20CloudDocs/GroceryHub/Code/GroceryListV2/src/lib/db-store.ts).

---

## Client Synchronization Flow

1. **Local Mutations:** Bump `updatedAt = Date.now()` and `updatedBy = getDeviceName()` on user edits. Write tombstones to IDB on deletes.
2. **Reconciliation:**
   - On pull/PUT responses, non-ambiguous merged items and tombstones are applied **immediately** to IndexedDB and React states.
   - Any returned ambiguities are kept in a React state `ambiguities` list. Do not discard the local or remote side of a tied conflict.
3. **Ambiguity UI Resolution:**
   - Display a side-by-side comparison resolver box.
   - `[Keep Local Changes]`: Applies local record, bumps its `updatedAt` to ensure it wins remote, clears the conflict state, and triggers a sync.
   - `[Keep Server Version]`: Overwrites local record with server record, bumps its `updatedAt`, clears the conflict state, and triggers a sync.
   - Block auto-saves for unresolved ambiguous IDs while conflict state is active.

---

## Automated Test Plan

Implement [test-list-merge.ts](file:///Users/christopherschmitt/Library/Mobile%20Documents/com~apple%20CloudDocs/GroceryHub/Code/GroceryListV2/scripts/test-list-merge.ts) asserting the following:
1. **Concurrent adds:** Different IDs merged successfully with zero conflicts.
2. **Delete LWW:** Older item deleted by newer tombstone.
3. **Delete LWW Override:** Newer item revives older tombstone (intentional LWW revival).
4. **Tied edit conflict:** Tied timestamps with differing meaningful fields returns a `"tied-conflict"` ambiguity.
5. **Clear-checked / clear-all tombstones:** Verify tombstones are written for all cleared IDs.
6. **90-day pruning:** Verify tombstones older than 90 days are pruned.

## Multi-Device Verification Plan
1. Device A adds `Milk`; Device B adds `Bread` offline. Verify reconnect merges both silently.
2. Device A deletes `Milk`. Device B syncs. Verify `Milk` is removed from B.
3. Device A edits qty (T2). Device B edits name offline (T1). Verify A's edit wins.
4. Tied timestamps with different name on A and B. Verify B renders the resolver box.
5. Validate using `npm run lint && npm run build`.
