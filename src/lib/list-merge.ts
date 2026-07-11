import { Tombstone } from "./types";

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

const RETENTION_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

export function mergeLists<T extends { id: string; updatedAt?: number; createdAt?: string; name: string }>(
  localItems: T[],
  localTombstones: Tombstone[],
  remoteItems: T[],
  remoteTombstones: Tombstone[],
  isRegularList = false
): MergeResult<T> {
  const allIds = new Set<string>();

  const getEffectiveTime = (item: T): number => {
    if (item.updatedAt !== undefined) return item.updatedAt;
    if (item.createdAt) {
      const parsed = Date.parse(item.createdAt);
      if (!isNaN(parsed)) return parsed;
    }
    return 0;
  };

  const localItemsMap = new Map<string, T>();
  for (const item of localItems) {
    localItemsMap.set(item.id, item);
    allIds.add(item.id);
  }

  const remoteItemsMap = new Map<string, T>();
  for (const item of remoteItems) {
    remoteItemsMap.set(item.id, item);
    allIds.add(item.id);
  }

  const localTombstonesMap = new Map<string, Tombstone>();
  for (const t of localTombstones) {
    localTombstonesMap.set(t.id, t);
    allIds.add(t.id);
  }

  const remoteTombstonesMap = new Map<string, Tombstone>();
  for (const t of remoteTombstones) {
    remoteTombstonesMap.set(t.id, t);
    allIds.add(t.id);
  }

  const mergedItems: T[] = [];
  const mergedTombstones: Tombstone[] = [];
  const ambiguities: AmbiguityConflict<T>[] = [];

  const pruneCutoff = Date.now() - RETENTION_MS;

  for (const id of allIds) {
    const localItem = localItemsMap.get(id) || null;
    const remoteItem = remoteItemsMap.get(id) || null;
    const localT = localTombstonesMap.get(id) || null;
    const remoteT = remoteTombstonesMap.get(id) || null;

    // 1. Resolve winning tombstone
    let winningTombstone: Tombstone | null = null;
    if (localT && remoteT) {
      winningTombstone = localT.deletedAt >= remoteT.deletedAt ? localT : remoteT;
    } else {
      winningTombstone = localT || remoteT;
    }

    // 2. Resolve winning item
    let winningItem: T | null = null;
    let hasTiedItemConflict = false;

    if (localItem && remoteItem) {
      const localTime = getEffectiveTime(localItem);
      const remoteTime = getEffectiveTime(remoteItem);

      if (localTime > remoteTime) {
        winningItem = localItem;
      } else if (remoteTime > localTime) {
        winningItem = remoteItem;
      } else {
        // Equal timestamps: check if fields differ
        if (areItemsMeaningfullyDifferent(localItem, remoteItem, isRegularList)) {
          hasTiedItemConflict = true;
          // Local wins as fallback for winningItem in active list
          winningItem = localItem;
        } else {
          winningItem = localItem;
        }
      }
    } else {
      winningItem = localItem || remoteItem;
    }

    // 3. Compare winningItem vs winningTombstone
    if (winningItem && winningTombstone) {
      const itemTime = getEffectiveTime(winningItem);
      const deleteTime = winningTombstone.deletedAt;

      if (itemTime > deleteTime) {
        // Item is newer -> Keep live
        if (hasTiedItemConflict) {
          ambiguities.push({
            id,
            local: localItem,
            remote: remoteItem,
            localTombstone: localT,
            remoteTombstone: remoteT,
            reason: "tied-conflict",
          });
        }
        mergedItems.push(winningItem);
      } else if (deleteTime > itemTime) {
        // Tombstone is newer -> Deleted
        if (winningTombstone.deletedAt >= pruneCutoff) {
          mergedTombstones.push(winningTombstone);
        }
      } else {
        // Tied update vs delete
        ambiguities.push({
          id,
          local: localItem,
          remote: remoteItem,
          localTombstone: localT,
          remoteTombstone: remoteT,
          reason: "tied-delete-update",
        });
        // Keep tombstone as fallback
        if (winningTombstone.deletedAt >= pruneCutoff) {
          mergedTombstones.push(winningTombstone);
        }
      }
    } else if (winningItem) {
      // Only live item exists
      if (hasTiedItemConflict) {
        ambiguities.push({
          id,
          local: localItem,
          remote: remoteItem,
          localTombstone: localT,
          remoteTombstone: remoteT,
          reason: "tied-conflict",
        });
      }
      mergedItems.push(winningItem);
    } else if (winningTombstone) {
      // Only tombstone exists
      if (winningTombstone.deletedAt >= pruneCutoff) {
        mergedTombstones.push(winningTombstone);
      }
    }
  }

  return { mergedItems, mergedTombstones, ambiguities };
}

function areItemsMeaningfullyDifferent(a: any, b: any, isRegularList: boolean): boolean {
  if (isRegularList) {
    const fields = ["name", "category", "selected"];
    for (const f of fields) {
      if (a[f] !== b[f]) return true;
    }
  } else {
    const fields = ["name", "category", "quantity", "unit", "units", "checked"];
    for (const f of fields) {
      if (a[f] !== b[f]) return true;
    }
  }
  return false;
}
