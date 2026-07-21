import { useState, useEffect, useRef } from "react";
import { ChevronDown } from "lucide-react";
import { useOfflineStore } from "@/lib/client/offline-store-context";

const RESET_TO_SERVER_CONFIRM =
  "Replace the shopping list on this device with what's on the server?\n\nLocal-only items will be removed. This can't be undone.";

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

function useTimeAgo(date: Date | null): string {
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!date) return;
    const interval = setInterval(() => setTick((t) => t + 1), 10000);
    return () => clearInterval(interval);
  }, [date]);

  if (!date) return "";
  return timeAgo(date);
}

type ChipTone = "green" | "yellow" | "red" | "blue";

function getChipState(opts: {
  syncConflict: boolean;
  isOnline: boolean;
  saving: boolean;
  hasPendingChanges: boolean;
  status: string;
  writeAcknowledgement?: "mongodb" | "local_fs" | "error";
}): { tone: ChipTone; label: string; pulse: boolean } {
  const { syncConflict, isOnline, saving, hasPendingChanges, status, writeAcknowledgement } = opts;

  if (syncConflict && isOnline) {
    return { tone: "red", label: "Conflict", pulse: true };
  }
  if (saving) {
    return { tone: "blue", label: "Syncing", pulse: true };
  }
  if (!isOnline || status === "offline" || status === "error") {
    return { tone: "yellow", label: hasPendingChanges ? "Offline · unsaved" : "Offline", pulse: false };
  }
  if (hasPendingChanges) {
    return { tone: "yellow", label: "Unsaved", pulse: true };
  }
  if (writeAcknowledgement === "local_fs" || writeAcknowledgement === "error") {
    return { tone: "yellow", label: "Local", pulse: true };
  }
  if (writeAcknowledgement === "mongodb") {
    return { tone: "green", label: "Cloud", pulse: false };
  }
  return { tone: "green", label: "Synced", pulse: false };
}

const DOT_CLASS: Record<ChipTone, string> = {
  green: "bg-emerald-500",
  yellow: "bg-amber-500",
  red: "bg-red-600",
  blue: "bg-blue-500",
};

/** Compact header chip + actions menu. Reads sync state from OfflineStore. */
export default function SyncIndicator() {
  const store = useOfflineStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const ago = useTimeAgo(store.lastSynced);

  const { tone, label, pulse } = getChipState({
    syncConflict: store.syncConflict,
    isOnline: store.isOnline,
    saving,
    hasPendingChanges: store.hasPendingChanges,
    status: store.syncStatus,
    writeAcknowledgement: store.writeAcknowledgement,
  });

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await store.saveChanges();
    } finally {
      setSaving(false);
      setMenuOpen(false);
    }
  };

  const handleResetToServer = async () => {
    if (!window.confirm(RESET_TO_SERVER_CONFIRM)) return;
    setResetting(true);
    try {
      await store.resetToServer();
    } finally {
      setResetting(false);
      setMenuOpen(false);
    }
  };

  const byDevice = store.lastSavedBy ? ` by ${store.lastSavedBy}` : "";
  const detailLine = ago
    ? `Last saved${byDevice} ${ago}`
    : store.isOnline
      ? "Connected"
      : "Working offline";

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setMenuOpen((o) => !o)}
        className="flex items-center justify-center min-w-11 min-h-11 -my-1 rounded-md hover:bg-surface-container-low transition-colors cursor-pointer"
        title={`${label} — ${detailLine}`}
        aria-label={`Sync status: ${label}. ${detailLine}`}
        aria-expanded={menuOpen}
        aria-haspopup="menu"
      >
        <span
          className={`w-2.5 h-2.5 rounded-full border border-black/20 ${DOT_CLASS[tone]} ${
            pulse ? "animate-pulse" : ""
          }`}
        />
        <ChevronDown
          size={12}
          className={`ml-0.5 text-on-surface-variant/70 transition-transform ${menuOpen ? "rotate-180" : ""}`}
        />
      </button>

      {menuOpen && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1 z-[60] w-56 rounded-lg border border-outline/15 bg-surface shadow-lg p-1.5 text-left"
        >
          <div className="px-2.5 py-2 border-b border-outline/10 mb-1">
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${DOT_CLASS[tone]} ${pulse ? "animate-pulse" : ""}`} />
              <span className="text-xs font-bold text-on-surface">{label}</span>
            </div>
            <p className="text-[10px] text-on-surface-variant mt-1 leading-snug">{detailLine}</p>
          </div>

          {store.hasPendingChanges && store.isOnline && !store.syncConflict && (
            <button
              type="button"
              role="menuitem"
              onClick={handleSave}
              disabled={saving}
              className="w-full text-left px-2.5 py-2 text-xs font-semibold rounded-md hover:bg-surface-container-low disabled:opacity-50 cursor-pointer"
            >
              {saving ? "Saving…" : "Save Now"}
            </button>
          )}

          {store.isOnline && !store.syncConflict && (
            <button
              type="button"
              role="menuitem"
              onClick={handleResetToServer}
              disabled={resetting || saving}
              className="w-full text-left px-2.5 py-2 text-xs font-semibold rounded-md hover:bg-rose-50 text-rose-800 disabled:opacity-50 cursor-pointer"
            >
              {resetting ? "Resetting…" : "Reset to Server…"}
            </button>
          )}

          {store.syncConflict && (
            <p className="px-2.5 py-2 text-[10px] text-on-surface-variant leading-snug">
              Resolve the conflict banner below first.
            </p>
          )}

          {!store.isOnline && (
            <p className="px-2.5 py-2 text-[10px] text-on-surface-variant leading-snug">
              Reconnect to save or reset from the server.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** Full-width conflict resolution banner for rare sync conflicts. */
export function SyncConflictBanner() {
  const store = useOfflineStore();

  if (!store.syncConflict || !store.isOnline) return null;

  return (
    <div className="px-4 pt-3">
      <div className="mx-auto max-w-lg flex flex-col gap-2.5 p-3.5 border border-red-500/40 bg-red-50 text-black rounded-lg text-xs font-bold uppercase w-full">
        <div className="flex items-center gap-2 font-black text-red-700">
          <span className="w-2.5 h-2.5 rounded-full bg-red-600 border border-black animate-pulse" />
          <span>Sync Conflict: Server list is newer</span>
        </div>
        <p className="text-[10px] text-gray-700 normal-case font-bold leading-normal">
          Another device has saved changes you do not have locally. Keep your local edits (overwrites the server), or
          replace this device with the full server list — local-only items will be removed.
        </p>
        <div className="flex flex-wrap items-center gap-2 mt-0.5">
          <button
            type="button"
            onClick={() => void store.resolveConflict("local")}
            className="px-2.5 py-1.5 bg-black text-white hover:bg-emerald-600 transition-colors border border-black text-[9px] font-black uppercase cursor-pointer rounded-md"
          >
            Keep Local (Overwrite)
          </button>
          <button
            type="button"
            onClick={() => {
              if (!window.confirm(RESET_TO_SERVER_CONFIRM)) return;
              void store.resolveConflict("server");
            }}
            className="px-2.5 py-1.5 bg-white text-black hover:bg-rose-100 transition-colors border border-black text-[9px] font-black uppercase cursor-pointer rounded-md"
          >
            Use Server (Discard Local)
          </button>
        </div>
      </div>
    </div>
  );
}
